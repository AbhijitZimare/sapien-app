'use client'

import { useState, useCallback, useRef } from 'react'

import type { StudentContext } from '@/lib/sophia/system-prompt'
import type { ChatMessage } from '@/lib/types/database'

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: Date
  promptKey?: string | null
  feedback?: 'positive' | 'negative' | null
}

export interface AssistantStreamPersistMeta {
  promptKey: string | null
  wasCacheHit: boolean
}

export interface UseSophiaPersistence {
  onBeforeStream?: (userContent: string) => Promise<void>
  onAfterStream?: (
    assistantContent: string,
    meta: AssistantStreamPersistMeta,
  ) => Promise<string | undefined>
}

export function useSophia(
  student: StudentContext,
  sessionId: string | null,
  isLoadingHistory: boolean,
  persistence?: UseSophiaPersistence | null,
) {
  const [messages, setMessages] = useState<Message[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const hydrateMessages = useCallback((rows: ChatMessage[]) => {
    setMessages(
      rows.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: new Date(m.created_at),
        promptKey: m.prompt_key ?? null,
        feedback: m.feedback ?? null,
      })),
    )
  }, [])

  const sendMessage = useCallback(
    async (content: string) => {
      if (isStreaming) return

      const userMessage: Message = {
        id: crypto.randomUUID(),
        role: 'user',
        content,
        createdAt: new Date(),
      }

      setMessages((prev) => [...prev, userMessage])
      setIsStreaming(true)
      setError(null)

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: '',
        createdAt: new Date(),
      }
      setMessages((prev) => [...prev, assistantMessage])

      try {
        if (persistence?.onBeforeStream) {
          await persistence.onBeforeStream(content)
        }
      } catch (persistErr) {
        console.error('useSophia: onBeforeStream', persistErr)
        setMessages((prev) =>
          prev.filter(
            (m) => m.id !== userMessage.id && m.id !== assistantMessage.id,
          ),
        )
        setIsStreaming(false)
        setError('Something went wrong. Please try again.')
        return
      }

      let accumulated = ''

      try {
        abortRef.current = new AbortController()

        const fullThread = [...messages, userMessage]
        const apiPayload = fullThread.slice(-6).map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        }))

        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: apiPayload,
            ...(sessionId != null ? { sessionId } : {}),
          }),
          signal: abortRef.current.signal,
        })

        if (!response.ok) throw new Error('API error')

        const reader = response.body?.getReader()
        const decoder = new TextDecoder()

        if (!reader) throw new Error('No reader')

        let promptKey: string | null = null
        let wasCacheHit = false

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const chunk = decoder.decode(value, { stream: true })
          accumulated += chunk

          setMessages((prev) => {
            const updated = [...prev]
            const last = updated.length - 1
            updated[last] = {
              ...updated[last],
              content: accumulated,
            }
            return updated
          })
        }

        const META_DELIMITER = '|||META|||'
        if (accumulated.includes(META_DELIMITER)) {
          const delimIndex = accumulated.indexOf(META_DELIMITER)
          const cleanText = accumulated.slice(0, delimIndex)
          const metaRaw = accumulated.slice(delimIndex + META_DELIMITER.length)
          accumulated = cleanText
          try {
            const meta = JSON.parse(metaRaw.trim()) as {
              promptKey?: string
              wasCacheHit?: boolean
            }
            promptKey = meta.promptKey ?? null
            wasCacheHit = meta.wasCacheHit ?? false
          } catch (e) {
            console.error('META PARSE FAILED:', e, 'raw was:', metaRaw)
          }
        }

        setMessages((prev) => {
          const updated = [...prev]
          const last = updated.length - 1
          updated[last] = {
            ...updated[last],
            content: accumulated,
            promptKey,
            feedback: null,
          }
          return updated
        })

        try {
          if (persistence?.onAfterStream) {
            const savedId = await persistence.onAfterStream(accumulated, {
              promptKey,
              wasCacheHit,
            })
            if (typeof savedId === 'string' && savedId.trim() !== '') {
              setMessages((prev) => {
                const updated = [...prev]
                const last = updated.length - 1
                updated[last] = {
                  ...updated[last],
                  id: savedId.trim(),
                }
                return updated
              })
            }
          }
        } catch (persistErr) {
          console.error('useSophia: onAfterStream', persistErr)
        }
      } catch (err: unknown) {
        const aborted =
          typeof err === 'object' &&
          err !== null &&
          'name' in err &&
          (err as { name?: string }).name === 'AbortError'
        if (!aborted) {
          setError('Something went wrong. Please try again.')
          setMessages((prev) => prev.slice(0, -2))
        }
      } finally {
        setIsStreaming(false)
      }
    },
    [messages, isStreaming, sessionId, persistence],
  )

  const clearMessages = useCallback(() => {
    setMessages([])
  }, [])

  const submitFeedback = useCallback(
    async (
      messageId: string,
      rating: 'positive' | 'negative',
      promptKey: string | null,
    ) => {
      if (sessionId == null || sessionId.trim() === '') return

      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, feedback: rating } : m,
        ),
      )

      try {
        const res = await fetch('/api/response/feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messageId,
            sessionId,
            rating,
            ...(promptKey ? { promptKey } : {}),
          }),
        })
        let ok = false
        try {
          const data = (await res.json()) as { success?: boolean }
          ok = res.ok && data.success === true
        } catch {
          ok = false
        }
        if (!ok) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === messageId ? { ...m, feedback: null } : m,
            ),
          )
        }
      } catch (err) {
        console.error('submitFeedback:', err)
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId ? { ...m, feedback: null } : m,
          ),
        )
      }
    },
    [sessionId],
  )

  return {
    messages,
    isStreaming,
    error,
    isLoadingHistory,
    sendMessage,
    clearMessages,
    hydrateMessages,
    submitFeedback,
  }
}