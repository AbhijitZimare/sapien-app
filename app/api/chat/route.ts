import Anthropic from '@anthropic-ai/sdk'
import { trackEvent } from '@/lib/analytics/posthog-server'
import { checkInputSafety, CRISIS_RESPONSE } from '@/lib/security/child-safety'
import { sanitizeInput } from '@/lib/security/sanitize'
import { buildSystemPrompt, type Board } from '@/lib/sophia/system-prompt'
import {
  generatePromptKey,
  getCacheEntry,
  setCacheEntry,
} from '@/lib/supabase/cache'
import { getPreviousSessionSummary } from '@/lib/supabase/sessions'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export const runtime = 'edge'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

const CHAT_RATE_WINDOW_MS = 60 * 60 * 1000
const CHAT_RATE_MAX_REQUESTS = 60
const chatRateBuckets = new Map<string, number[]>()

const HAIKU_MODEL = 'claude-haiku-4-5-20251001'
const MAX_OUTPUT_TOKENS = 600
const MAX_HISTORY_TURNS = 2

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

function toBoard(input: string | null | undefined): Board {
  if (input === 'IB' || input === 'CBSE' || input === 'ICSE' || input === 'SSC') {
    return input
  }
  return 'CBSE'
}

type ChatTurn = { role: 'user' | 'assistant'; content: string }

/** Keep up to `maxTurns` user+assistant pairs (latest messages). */
function applyHistoryWindow(
  messages: ChatTurn[],
  maxTurns: number,
): ChatTurn[] {
  const maxMessages = maxTurns * 2
  const sliced =
    messages.length <= maxMessages
      ? messages
      : messages.slice(messages.length - maxMessages)

  return sliced.map((m) => ({
    ...m,
    content:
      m.content.length > 300
        ? m.content.slice(0, 300) + '...'
        : m.content,
  }))
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

    const body = (await request.json()) as {
      messages?: unknown
      sessionId?: unknown
    }

    const sessionId =
      typeof body.sessionId === 'string' && body.sessionId.trim() !== ''
        ? body.sessionId.trim()
        : null

    if (body.sessionId != null) {
      if (!sessionId) {
        return new Response('Forbidden', { status: 403 })
      }
      const { data: sessionRow, error: sessionErr } = await supabase
        .from('chat_sessions')
        .select('id')
        .eq('id', sessionId)
        .eq('user_id', user.id)
        .maybeSingle()

      if (sessionErr || !sessionRow) {
        return new Response('Forbidden', { status: 403 })
      }
    }

    const { messages } = body

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

    const sanitizedMessages: ChatTurn[] = msgs
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: sanitizeInput(
          typeof m.content === 'string' ? m.content : '',
        ),
      }))

    const windowedMessages = applyHistoryWindow(
      sanitizedMessages,
      MAX_HISTORY_TURNS,
    )

    const { data: profileData } = await supabase
      .from('student_profiles')
      .select('name, board, grade, school_name, favourite_subject')
      .eq('user_id', user.id)
      .maybeSingle()

    const profile = {
      name:
        typeof profileData?.name === 'string' && profileData.name.trim() !== ''
          ? profileData.name
          : 'Student',
      board: toBoard(profileData?.board),
      grade:
        typeof profileData?.grade === 'string' && profileData.grade.trim() !== ''
          ? profileData.grade
          : '10',
      school:
        typeof profileData?.school_name === 'string'
          ? profileData.school_name
          : undefined,
      favourite_subject:
        typeof profileData?.favourite_subject === 'string'
          ? profileData.favourite_subject
          : null,
    }

    const priorSummary = await getPreviousSessionSummary(
      user.id,
      sessionId,
    )

    if (process.env.NODE_ENV === 'development' && priorSummary) {
      console.log('PRIOR SUMMARY INJECTED:', priorSummary.slice(0, 100))
    }

    trackEvent(user.id, 'sophia_message_sent', {
      session_id: sessionId,
      board: profile.board,
      grade: profile.grade,
      subject: profile.favourite_subject ?? null,
      message_length: lastUserMessage.length,
      had_prior_summary: !!priorSummary,
    })

    const systemPrompt = buildSystemPrompt(
      {
        name: profile.name,
        board: profile.board,
        grade: profile.grade,
        school: profile.school,
        favourite_subject: profile.favourite_subject,
      },
      priorSummary,
    )

    const safeSystem = sanitizeInput(systemPrompt)

    const systemTokens = Math.ceil(safeSystem.length / 4)
    const historyTokens = Math.ceil(
      JSON.stringify(windowedMessages).length / 4,
    )
    const inputEstimate = systemTokens + historyTokens

    if (inputEstimate > 400) {
      console.warn(
        'TOKEN GUARD: input estimate',
        inputEstimate,
        'exceeds 400 — trimming',
      )
      trackEvent(user.id, 'sophia_token_guard_triggered', {
        session_id: sessionId,
        input_estimate: inputEstimate,
        system_tokens: systemTokens,
        history_tokens: historyTokens,
      })
    }

    const normalised = lastUserMessage.trim().toLowerCase().slice(0, 200)
    const promptKey = await generatePromptKey([
      profile.board,
      profile.grade,
      profile.favourite_subject ?? 'general',
      normalised,
    ])

    const cacheEntry = await getCacheEntry(promptKey)

    if (cacheEntry) {
      trackEvent(user.id, 'sophia_cache_hit', {
        session_id: sessionId,
        prompt_key: promptKey,
        board: profile.board,
        grade: profile.grade,
      })

      const cachedText =
        typeof cacheEntry.response_jsonb.text === 'string'
          ? cacheEntry.response_jsonb.text
          : JSON.stringify(cacheEntry.response_jsonb)

      const outputEstimate = Math.ceil(cachedText.length / 4)
      const cacheCandidate = lastUserMessage.trim().length < 150

      trackEvent(user.id, 'sophia_response_completed', {
        session_id: sessionId,
        model: 'haiku',
        tier: 'C',
        input_estimate: inputEstimate,
        output_estimate: outputEstimate,
        was_cache_hit: true,
        cache_candidate: cacheCandidate,
        board: profile.board,
        grade: profile.grade,
        subject: profile.favourite_subject ?? null,
      })

      const meta = JSON.stringify({ promptKey, wasCacheHit: true })
      const bodyWithMeta = cachedText + '|||META|||' + meta

      return new Response(bodyWithMeta, {
        status: 200,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      })
    }

    trackEvent(user.id, 'sophia_cache_miss', {
      session_id: sessionId,
      prompt_key: promptKey,
      board: profile.board,
      grade: profile.grade,
      input_estimate: inputEstimate,
    })

    const stream = await anthropic.messages.stream({
      model: HAIKU_MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: safeSystem || undefined,
      messages: windowedMessages,
    })

    let fullResponse = ''

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            if (
              chunk.type === 'content_block_delta' &&
              chunk.delta.type === 'text_delta'
            ) {
              const text = chunk.delta.text
              fullResponse += text
              controller.enqueue(new TextEncoder().encode(text))
            }
          }
        } catch (streamErr) {
          console.error('Chat stream iteration error:', streamErr)
          controller.error(streamErr)
          return
        }

        const isCacheCandidate = lastUserMessage.trim().length < 150

        if (isCacheCandidate && fullResponse.length > 0) {
          await setCacheEntry({
            promptKey,
            responseJsonb: { text: fullResponse },
            tier: 'C',
            model: 'haiku',
            tokensInput: inputEstimate,
            tokensOutput: Math.ceil(fullResponse.length / 4),
          })
        }

        trackEvent(user.id, 'sophia_response_completed', {
          session_id: sessionId,
          model: 'haiku',
          tier: 'C',
          input_estimate: inputEstimate,
          output_estimate: Math.ceil(fullResponse.length / 4),
          was_cache_hit: false,
          cache_candidate: isCacheCandidate,
          board: profile.board,
          grade: profile.grade,
          subject: profile.favourite_subject ?? null,
        })

        console.log(
          'TOKEN USAGE:',
          JSON.stringify({
            model: 'haiku',
            tier: 'C',
            inputEstimate,
            sessionId,
            userId: user.id,
          }),
        )

        const meta = JSON.stringify({ promptKey, wasCacheHit: false })
        controller.enqueue(
          new TextEncoder().encode('|||META|||' + meta),
        )
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
