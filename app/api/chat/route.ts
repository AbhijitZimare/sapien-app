import Anthropic from '@anthropic-ai/sdk'

import { checkInputSafety, CRISIS_RESPONSE } from '@/lib/security/child-safety'
import { sanitizeInput } from '@/lib/security/sanitize'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export const runtime = 'edge'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

const CHAT_RATE_WINDOW_MS = 60 * 60 * 1000
const CHAT_RATE_MAX_REQUESTS = 60
const chatRateBuckets = new Map<string, number[]>()

function takeChatRateSlot(userId: string): boolean {
  const now = Date.now()
  const windowStart = now - CHAT_RATE_WINDOW_MS
  const bucket = (chatRateBuckets.get(userId) ?? []).filter((t) => t > windowStart)
  if (bucket.length >= CHAT_RATE_MAX_REQUESTS) {
    chatRateBuckets.set(userId, bucket)
    return false
  }
  bucket.push(now)
  chatRateBuckets.set(userId, bucket)
  return true
}

type IncomingMessage = {
  role: string
  content?: unknown
}

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return new Response('Unauthorized', { status: 401 })
    }

    const { messages, system } = (await request.json()) as {
      messages?: unknown
      system?: unknown
    }

    if (!messages || !Array.isArray(messages)) {
      return new Response('Invalid request', { status: 400 })
    }

    const msgs = messages as IncomingMessage[]

    if (!takeChatRateSlot(user.id)) {
      return new Response('Too many requests. Try again in a little while.', {
        status: 429,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      })
    }

    const lastUserMessage =
      msgs
        .filter((m) => m.role === 'user')
        .map((m) => (typeof m.content === 'string' ? m.content : ''))
        .slice(-1)[0] ?? ''

    const safetyCheck = checkInputSafety(sanitizeInput(lastUserMessage))
    if (safetyCheck.crisis) {
      return new Response(CRISIS_RESPONSE, {
        status: 200,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      })
    }

    const sanitizedMessages = msgs
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: sanitizeInput(
          typeof m.content === 'string' ? m.content : '',
        ),
      }))

    const safeSystem =
      typeof system === 'string' ? sanitizeInput(system) : ''

    const stream = await anthropic.messages.stream({
      model: 'claude-sonnet-4-5',
      max_tokens: 2048,
      system: safeSystem || undefined,
      messages: sanitizedMessages,
    })

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            if (
              chunk.type === 'content_block_delta' &&
              chunk.delta.type === 'text_delta'
            ) {
              const text = chunk.delta.text
              controller.enqueue(new TextEncoder().encode(text))
            }
          }
        } catch (streamErr) {
          console.error('Chat stream iteration error:', streamErr)
          controller.error(streamErr)
          return
        }
        controller.close()
      },
    })

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
        'Cache-Control': 'no-cache',
      },
    })
  } catch (error) {
    console.error('Chat API error:', error)
    return new Response('Internal server error', { status: 500 })
  }
}
