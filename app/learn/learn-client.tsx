'use client'

// Icons: lucide-react ONLY — no emoji, no other icon libraries

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Send } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import type { StudentContext } from '@/lib/sophia/system-prompt'
import { useSophia, type Message } from '@/lib/sophia/use-sophia'

interface LearnClientProps {
  student: StudentContext
  userId: string
}

function isGreetingMessage(m: Message) {
  return m.role === 'user' && m.content.startsWith('[GREETING]')
}

export default function LearnClient({ student, userId }: LearnClientProps) {
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const greetKey = `sophia:greeted:${userId}`

  const { messages, isStreaming, error, sendMessage } = useSophia(student)

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
    if (typeof window === 'undefined') return
    if (sessionStorage.getItem(greetKey)) return
    if (messages.length > 0) return
    sessionStorage.setItem(greetKey, '1')
    void sendMessage(
      `[GREETING] Start with a warm greeting for ${student.name},
their ${student.board} Class ${student.grade} tutor.
Ask what they want to work on today.
2 sentences max. No step cards.`,
    )
     
  }, [greetKey, messages.length, sendMessage, student])

  async function handleSend() {
    const text = input.trim()
    if (!text || isStreaming) return
    setInput('')
    await sendMessage(text)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  return (
    <div
      className="flex flex-col"
      style={{
        height: '100dvh',
        background: '#F9F8F6',
      }}
    >
      <header
        className="flex shrink-0 items-center justify-between border-b px-4 py-3"
        style={{ borderColor: '#E8E4DC', background: '#FFFFFF' }}
      >
        <div className="min-w-0">
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
            style={{ fontFamily: 'DM Sans, system-ui, sans-serif', color: '#9B9BAD' }}
          >
            {student.board} · Class {student.grade}
            {student.school ? ` · ${student.school}` : ''}
          </p>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto flex max-w-2xl flex-col gap-4">
          {visibleMessages.map((m, index) => {
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
                  m.role === 'user' ? 'ml-8 flex justify-end' : 'mr-8 flex justify-start'
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
                      m.role === 'assistant' ? '1px solid #E8E4DC' : undefined,
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
          })}
          <div ref={messagesEndRef} aria-hidden />
        </div>

        {error && (
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
        )}
      </main>

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
            disabled={isStreaming}
            aria-label="Message to Sophia"
          />
          <Button
            type="button"
            onClick={() => void handleSend()}
            disabled={!input.trim() || isStreaming}
            className="h-11 shrink-0 px-4"
            style={{ background: '#0D1B2A', fontFamily: 'DM Sans, system-ui, sans-serif' }}
            aria-label="Send message"
          >
            {isStreaming ? (
              <Loader2 className="h-5 w-5 animate-spin text-white" aria-hidden />
            ) : (
              <Send className="h-5 w-5 text-white" aria-hidden />
            )}
          </Button>
        </div>
      </footer>
    </div>
  )
}
