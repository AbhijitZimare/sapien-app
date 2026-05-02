'use client'

// Icons: lucide-react ONLY — no emoji, no other icon libraries

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Loader2,
  PanelLeftClose,
  PanelLeft,
  Plus,
  Send,
  X,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import type { StudentContext } from '@/lib/sophia/system-prompt'
import {
  useSophia,
  type AssistantStreamPersistMeta,
  type Message,
} from '@/lib/sophia/use-sophia'
import {
  archiveSession,
  createChatSession,
  getChatMessages,
  getChatSessions,
  saveMessage,
  updateSessionName,
} from '@/lib/supabase/chat'
import type { ChatSession } from '@/lib/types/database'

interface LearnClientProps {
  student: StudentContext
  userId: string
}

function isGreetingMessage(m: Message) {
  return m.role === 'user' && m.content.startsWith('[GREETING]')
}

function maxMessageIndexPlusOne(rows: { message_index: number }[]): number {
  if (rows.length === 0) return 0
  return Math.max(...rows.map((r) => r.message_index)) + 1
}

function previewText(text: string | null | undefined, max: number): string {
  const s = (text ?? '').trim()
  if (s.length <= max) return s
  return `${s.slice(0, max)}…`
}

function beaconSummarise(sessionId: string) {
  if (typeof navigator === 'undefined') return
  navigator.sendBeacon(
    '/api/session/summarise',
    new Blob([JSON.stringify({ sessionId })], { type: 'application/json' }),
  )
}

export default function LearnClient({ student, userId }: LearnClientProps) {
  const [input, setInput] = useState('')
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [isLoadingHistory, setIsLoadingHistory] = useState(true)
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [isCreatingChat, setIsCreatingChat] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const nextDbIndexRef = useRef(0)
  const lastStreamWasGreetingRef = useRef(false)

  const greetKey = `sapien:greeted:${userId}:${activeSessionId ?? ''}`

  const persistence = useMemo(
    () => ({
      onBeforeStream: async (userContent: string) => {
        if (!activeSessionId) return
        if (userContent.startsWith('[GREETING]')) {
          lastStreamWasGreetingRef.current = true
          return
        }
        lastStreamWasGreetingRef.current = false
        const idx = nextDbIndexRef.current
        const r = await saveMessage({
          sessionId: activeSessionId,
          userId,
          role: 'user',
          content: userContent,
          messageIndex: idx,
          promptKey: null,
          wasCacheHit: false,
        })
        if (!r.success) {
          throw new Error(r.error.message)
        }
        if (idx === 0) {
          const title = userContent.trim().slice(0, 50)
          const ur = await updateSessionName(activeSessionId, userId, title)
          if (ur.success) {
            setSessions((prev) =>
              prev.map((s) =>
                s.id === activeSessionId ? { ...s, name: title } : s,
              ),
            )
          }
        }
        nextDbIndexRef.current = idx + 1
        setSessions((prev) =>
          prev.map((s) =>
            s.id === activeSessionId
              ? {
                  ...s,
                  last_message: userContent.slice(0, 100),
                  message_count: s.message_count + 1,
                  updated_at: new Date().toISOString(),
                }
              : s,
          ),
        )
      },
      onAfterStream: async (
        assistantContent: string,
        meta: AssistantStreamPersistMeta,
      ) => {
        if (!activeSessionId) return
        if (lastStreamWasGreetingRef.current) return
        const idx = nextDbIndexRef.current
        const r = await saveMessage({
          sessionId: activeSessionId,
          userId,
          role: 'assistant',
          content: assistantContent,
          messageIndex: idx,
          promptKey: meta.promptKey,
          wasCacheHit: meta.wasCacheHit,
        })
        if (r.success) {
          nextDbIndexRef.current = idx + 1
          setSessions((prev) =>
            prev.map((s) =>
              s.id === activeSessionId
                ? {
                    ...s,
                    last_message: assistantContent.slice(0, 100),
                    message_count: s.message_count + 1,
                    updated_at: new Date().toISOString(),
                  }
                : s,
            ),
          )
        } else {
          console.error('Assistant message save:', r.error.message)
        }
      },
    }),
    [activeSessionId, userId],
  )

  const {
    messages,
    isStreaming,
    error,
    sendMessage,
    clearMessages,
    hydrateMessages,
  } = useSophia(student, activeSessionId, isLoadingHistory, persistence)

  const visibleMessages = useMemo(
    () => messages.filter((m) => !isGreetingMessage(m)),
    [messages],
  )

  const scrollIntoView = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollIntoView()
  }, [visibleMessages, scrollIntoView])

  useEffect(() => {
    let cancelled = false

    async function load() {
      setIsLoadingHistory(true)
      const sessionsRes = await getChatSessions(userId)
      if (cancelled) return

      if (!sessionsRes.success) {
        console.error('getChatSessions:', sessionsRes.error.message)
        setIsLoadingHistory(false)
        return
      }

      let list = sessionsRes.data
      let sid: string | null = list[0]?.id ?? null

      if (list.length === 0) {
        const cre = await createChatSession(userId, {
          board: student.board,
          grade: student.grade,
        })
        if (cancelled) return
        if (!cre.success) {
          console.error('createChatSession:', cre.error.message)
          setIsLoadingHistory(false)
          return
        }
        list = [cre.data]
        sid = cre.data.id
      }

      setSessions(list)
      setActiveSessionId(sid)

      if (sid) {
        const msgRes = await getChatMessages(sid, userId)
        if (cancelled) return
        if (msgRes.success) {
          hydrateMessages(msgRes.data)
          nextDbIndexRef.current = maxMessageIndexPlusOne(msgRes.data)
        }
      }

      setIsLoadingHistory(false)
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [userId, student.board, student.grade, hydrateMessages])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!activeSessionId) return

    const handleUnload = () => {
      beaconSummarise(activeSessionId)
    }

    window.addEventListener('beforeunload', handleUnload)
    return () => window.removeEventListener('beforeunload', handleUnload)
  }, [activeSessionId])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (isLoadingHistory || !activeSessionId) return
    if (sessionStorage.getItem(greetKey)) return
    if (messages.length > 0) return
    sessionStorage.setItem(greetKey, '1')
    void sendMessage(
      `[GREETING] Start with a warm greeting for ${student.name},
their ${student.board} Class ${student.grade} tutor.
Ask what they want to work on today.
2 sentences max. No step cards.`,
    )
  }, [
    greetKey,
    isLoadingHistory,
    activeSessionId,
    messages.length,
    sendMessage,
    student,
  ])

  async function handleNewChat() {
    if (isCreatingChat || isStreaming) return
    if (activeSessionId) {
      beaconSummarise(activeSessionId)
    }
    setIsCreatingChat(true)
    const res = await createChatSession(userId, {
      board: student.board,
      grade: student.grade,
    })
    setIsCreatingChat(false)
    if (!res.success) {
      console.error('createChatSession:', res.error.message)
      return
    }
    setSessions((prev) => [res.data, ...prev])
    setActiveSessionId(res.data.id)
    clearMessages()
    nextDbIndexRef.current = 0
  }

  async function handleSelectSession(sessionId: string) {
    if (sessionId === activeSessionId || isStreaming) return
    if (activeSessionId) {
      beaconSummarise(activeSessionId)
    }
    setActiveSessionId(sessionId)
    const msgRes = await getChatMessages(sessionId, userId)
    if (msgRes.success) {
      hydrateMessages(msgRes.data)
      nextDbIndexRef.current = maxMessageIndexPlusOne(msgRes.data)
    }
  }

  async function handleArchiveSession(sessionIdToArchive: string) {
    if (activeSessionId === sessionIdToArchive) {
      beaconSummarise(sessionIdToArchive)
    }
    const res = await archiveSession(sessionIdToArchive, userId)
    if (!res.success) {
      console.error('archiveSession:', res.error.message)
      return
    }

    const listRes = await getChatSessions(userId)
    if (!listRes.success) {
      console.error('getChatSessions:', listRes.error.message)
      return
    }

    setSessions(listRes.data)

    if (activeSessionId !== sessionIdToArchive) return

    if (listRes.data.length > 0) {
      const next = listRes.data[0]
      setActiveSessionId(next.id)
      const msgRes = await getChatMessages(next.id, userId)
      if (msgRes.success) {
        hydrateMessages(msgRes.data)
        nextDbIndexRef.current = maxMessageIndexPlusOne(msgRes.data)
      }
    } else {
      setIsCreatingChat(true)
      const cre = await createChatSession(userId, {
        board: student.board,
        grade: student.grade,
      })
      setIsCreatingChat(false)
      if (cre.success) {
        setSessions([cre.data])
        setActiveSessionId(cre.data.id)
        clearMessages()
        nextDbIndexRef.current = 0
      }
    }
  }

  async function handleSendText() {
    const text = input.trim()
    if (!text || isStreaming || !activeSessionId || isLoadingHistory) return
    setInput('')
    await sendMessage(text)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSendText()
    }
  }

  const busy = isLoadingHistory || !activeSessionId

  return (
    <div
      className="flex min-h-0 min-w-0 flex-1 overflow-hidden"
      style={{
        height: '100%',
        background: '#F9F8F6',
      }}
    >
      <aside
        aria-label="Chat sessions"
        className={`hidden shrink-0 flex-col border-r transition-[width] duration-200 ease-out lg:flex ${
          isSidebarOpen ? 'w-[260px]' : 'w-0'
        } overflow-hidden`}
        style={{ borderColor: '#E8E4DC', background: '#FFFFFF' }}
      >
        <div
          className="flex shrink-0 items-center justify-end border-b px-2 py-2"
          style={{ borderColor: '#E8E4DC' }}
        >
          <button
            type="button"
            onClick={() => setIsSidebarOpen(false)}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[#0BB5AD] focus-visible:ring-offset-2"
            style={{ color: '#0D1B2A' }}
            aria-label="Collapse session list"
          >
            <PanelLeftClose className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <nav
          className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 py-2"
          aria-label="Your chat sessions"
        >
          {sessions.map((s) => {
            const isActive = s.id === activeSessionId
            return (
              <div
                key={s.id}
                className="group flex items-stretch gap-1 rounded-xl"
                style={{
                  borderLeft: isActive ? '3px solid #0BB5AD' : '3px solid transparent',
                  background: isActive ? 'rgba(11,181,173,0.08)' : 'transparent',
                }}
              >
                <button
                  type="button"
                  onClick={() => void handleSelectSession(s.id)}
                  className="min-h-[44px] min-w-0 flex-1 rounded-r-xl px-3 py-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#0BB5AD] focus-visible:ring-offset-2"
                  aria-current={isActive ? 'page' : undefined}
                >
                  <p
                    className="truncate text-sm font-medium"
                    style={{
                      fontFamily: 'DM Sans, system-ui, sans-serif',
                      color: '#0D1B2A',
                    }}
                  >
                    {s.name}
                  </p>
                  <p
                    className="truncate text-xs"
                    style={{
                      fontFamily: 'DM Sans, system-ui, sans-serif',
                      color: '#9B9BAD',
                    }}
                  >
                    {s.board ?? '—'} · Class {s.grade ?? '—'}
                  </p>
                  <p
                    className="mt-0.5 truncate text-xs"
                    style={{
                      fontFamily: 'DM Sans, system-ui, sans-serif',
                      color: '#9B9BAD',
                    }}
                  >
                    {previewText(s.last_message, 40) || 'No messages yet'}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => void handleArchiveSession(s.id)}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[#0BB5AD] focus-visible:ring-offset-2"
                  style={{ color: '#9B9BAD' }}
                  aria-label={`Archive chat ${s.name}`}
                >
                  <X className="h-5 w-5" aria-hidden />
                </button>
              </div>
            )
          })}
        </nav>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header
          className="flex shrink-0 items-center gap-2 border-b px-3 py-3 sm:px-4"
          style={{ borderColor: '#E8E4DC', background: '#FFFFFF' }}
        >
          {!isSidebarOpen ? (
            <button
              type="button"
              onClick={() => setIsSidebarOpen(true)}
              className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[#0BB5AD] focus-visible:ring-offset-2 lg:flex"
              style={{ color: '#0D1B2A' }}
              aria-label="Expand session list"
            >
              <PanelLeft className="h-5 w-5" aria-hidden />
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => void handleNewChat()}
            disabled={isCreatingChat || isStreaming || busy}
            className="flex h-11 min-w-[44px] shrink-0 items-center justify-center gap-2 rounded-xl px-3 text-sm font-medium outline-none transition-opacity disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-[#0BB5AD] focus-visible:ring-offset-2"
            style={{
              background: '#0BB5AD',
              color: '#FFFFFF',
              fontFamily: 'DM Sans, system-ui, sans-serif',
            }}
            aria-label="Start new chat"
          >
            {isCreatingChat ? (
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            ) : (
              <Plus className="h-5 w-5" aria-hidden />
            )}
            <span className="hidden sm:inline">New chat</span>
          </button>

          <div className="min-w-0 flex-1">
            <h1
              className="truncate text-xl font-semibold tracking-tight"
              style={{
                fontFamily: 'Cormorant Garamond, Georgia, serif',
                color: '#0D1B2A',
              }}
            >
              Sophia
            </h1>
            <p
              className="truncate text-xs"
              style={{
                fontFamily: 'DM Sans, system-ui, sans-serif',
                color: '#9B9BAD',
              }}
            >
              {student.board} · Class {student.grade}
              {student.school ? ` · ${student.school}` : ''}
            </p>
          </div>
        </header>

        <div
          className="min-h-0 flex-1 overflow-y-auto px-4 py-6"
          role="region"
          aria-label="Chat messages"
        >
          <div className="mx-auto flex max-w-2xl flex-col gap-4">
            {isLoadingHistory ? (
              <>
                <div className="ml-8 flex justify-end" aria-hidden>
                  <div
                    className="h-16 max-w-[min(85%,28rem)] flex-1 animate-pulse rounded-2xl"
                    style={{ background: 'rgba(11,181,173,0.2)' }}
                  />
                </div>
                <div className="mr-8 flex justify-start" aria-hidden>
                  <div
                    className="h-20 max-w-[min(85%,28rem)] flex-1 animate-pulse rounded-2xl"
                    style={{ background: 'rgba(13,27,42,0.08)' }}
                  />
                </div>
                <div className="ml-8 flex justify-end" aria-hidden>
                  <div
                    className="h-14 max-w-[min(85%,28rem)] flex-1 animate-pulse rounded-2xl"
                    style={{ background: 'rgba(11,181,173,0.15)' }}
                  />
                </div>
              </>
            ) : (
              visibleMessages.map((m, index) => {
                const isLast = index === visibleMessages.length - 1
                const showSpinner =
                  isLast &&
                  m.role === 'assistant' &&
                  isStreaming &&
                  m.content.trim() === ''

                return (
                  <div
                    key={m.id}
                    className={
                      m.role === 'user'
                        ? 'ml-8 flex justify-end'
                        : 'mr-8 flex justify-start'
                    }
                  >
                    <div
                      className="max-w-[min(85%,28rem)] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap"
                      style={{
                        fontFamily: 'DM Sans, system-ui, sans-serif',
                        background: m.role === 'user' ? '#0BB5AD' : '#FFFFFF',
                        color: m.role === 'user' ? '#FFFFFF' : '#0D1B2A',
                        boxShadow:
                          m.role === 'assistant'
                            ? '0 1px 3px rgba(13,27,42,0.08)'
                            : undefined,
                        border:
                          m.role === 'assistant'
                            ? '1px solid #E8E4DC'
                            : undefined,
                      }}
                    >
                      {showSpinner ? (
                        <Loader2
                          className="h-5 w-5 animate-spin"
                          aria-label="Sophia is typing"
                          style={{ color: '#0BB5AD' }}
                        />
                      ) : (
                        m.content
                      )}
                    </div>
                  </div>
                )
              })
            )}
            <div ref={messagesEndRef} aria-hidden />
          </div>

          {error && !isLoadingHistory ? (
            <p
              className="mx-auto mt-4 max-w-2xl px-4 text-center text-xs"
              role="alert"
              style={{
                fontFamily: 'DM Sans, system-ui, sans-serif',
                color: '#DC3545',
              }}
            >
              {error}
            </p>
          ) : null}
        </div>

        <footer
          className="shrink-0 border-t p-4"
          style={{ borderColor: '#E8E4DC', background: '#FFFFFF' }}
        >
          <div className="mx-auto flex max-w-2xl items-end gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask Sophia a question…"
              rows={3}
              className="min-h-[4.5rem] resize-none"
              disabled={isStreaming || busy}
              aria-label="Message to Sophia"
            />
            <Button
              type="button"
              onClick={() => void handleSendText()}
              disabled={!input.trim() || isStreaming || busy}
              className="h-11 min-w-[44px] shrink-0 px-4 outline-none focus-visible:ring-2 focus-visible:ring-[#0BB5AD] focus-visible:ring-offset-2"
              style={{
                background: '#0D1B2A',
                fontFamily: 'DM Sans, system-ui, sans-serif',
              }}
              aria-label="Send message"
            >
              {isStreaming ? (
                <Loader2
                  className="h-5 w-5 animate-spin text-white"
                  aria-hidden
                />
              ) : (
                <Send className="h-5 w-5 text-white" aria-hidden />
              )}
            </Button>
          </div>
        </footer>
      </div>
    </div>
  )
}
