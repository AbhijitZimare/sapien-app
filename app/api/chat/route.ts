import Anthropic from '@anthropic-ai/sdk'

import { createServerSupabaseClient } from '@/lib/supabase/server'

export const runtime = 'edge'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return new Response('Unauthorized', { status: 401 })
    }

    const { messages, system } = await request.json()

    if (!messages || !Array.isArray(messages)) {
      return new Response('Invalid request', { status: 400 })
    }

    const stream = await anthropic.messages.stream({
      model: 'claude-sonnet-4-5',
      max_tokens: 2048,
      system: system || '',
      messages,
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
