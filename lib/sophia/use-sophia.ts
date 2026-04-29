'use client'

import { useState, useCallback, useRef } from 'react'

import { buildSystemPrompt } from '@/lib/sophia/system-prompt'
import type { StudentContext } from '@/lib/sophia/system-prompt'

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: Date
}

export function useSophia(student: StudentContext, sessionId?: string) {
  const [messages, setMessages] = useState<Message[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const systemPrompt = buildSystemPrompt(student)

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
        abortRef.current = new AbortController()

        const apiPayload = [...messages, userMessage].map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        }))

        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: apiPayload,
            system: systemPrompt,
            ...(sessionId != null ? { sessionId } : {}),
          }),
          signal: abortRef.current.signal,
        })

        if (!response.ok) throw new Error('API error')

        const reader = response.body?.getReader()
        const decoder = new TextDecoder()

        if (!reader) throw new Error('No reader')

        let accumulated = ''
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
    [messages, isStreaming, systemPrompt, sessionId],
  )

  const clearMessages = useCallback(() => {
    setMessages([])
  }, [])

  return {
    messages,
    isStreaming,
    error,
    sendMessage,
    clearMessages,
  }
}
