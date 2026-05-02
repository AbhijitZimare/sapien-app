import Anthropic from '@anthropic-ai/sdk'

import { trackEvent } from '@/lib/analytics/posthog-server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export const runtime = 'edge'

const HAIKU_MODEL = 'claude-haiku-4-5-20251001'

const SUMMARY_SYSTEM = `Summarise this tutoring session in exactly 3 bullet points.
Each bullet max 15 words. Format as JSON array of strings.
Return ONLY the JSON array, no markdown, no preamble.`

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

function extractAssistantText(data: {
  content: Array<{ type: string; text?: string }>
}): string {
  const parts: string[] = []
  for (const block of data.content) {
    if (block.type === 'text' && typeof block.text === 'string') {
      parts.push(block.text)
    }
  }
  return parts.join('')
}

function parseBullets(raw: string): string[] {
  const t = raw.trim()
  try {
    const parsed: unknown = JSON.parse(t)
    if (
      Array.isArray(parsed) &&
      parsed.length > 0 &&
      parsed.every((x) => typeof x === 'string')
    ) {
      return parsed as string[]
    }
  } catch {
    // use fallback below
  }
  return t ? [t] : []
}

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return Response.json({ success: false, reason: 'no_auth' }, { status: 200 })
    }

    let sessionId: string | null = null
    try {
      const body = (await request.json()) as { sessionId?: unknown }
      sessionId =
        typeof body.sessionId === 'string' && body.sessionId.trim() !== ''
          ? body.sessionId.trim()
          : null
    } catch {
      return Response.json({ success: false, reason: 'invalid_body' }, { status: 200 })
    }

    if (!sessionId) {
      return Response.json({ success: false, reason: 'no_session' }, { status: 200 })
    }

    const { data: sessionRow, error: sessionErr } = await supabase
      .from('chat_sessions')
      .select('id')
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (sessionErr || !sessionRow) {
      return Response.json({ success: false, reason: 'forbidden' }, { status: 200 })
    }

    let rows: { role: string; content: string; message_index: number }[] = []
    try {
      const admin = createAdminClient()
      const { data, error } = await admin
        .from('chat_messages')
        .select('role, content, message_index')
        .eq('session_id', sessionId)
        .eq('user_id', user.id)
        .order('message_index', { ascending: false })
        .limit(10)

      if (error) {
        console.error('summarise: fetch messages', error.message)
        return Response.json({ success: false, reason: 'db_read' }, { status: 200 })
      }

      const list = (data ?? []) as {
        role: string
        content: string
        message_index: number
      }[]
      rows = [...list].sort((a, b) => a.message_index - b.message_index)
    } catch (e) {
      console.error('summarise: admin messages', e)
      return Response.json({ success: false, reason: 'db_read' }, { status: 200 })
    }

    if (rows.length < 2) {
      return Response.json({ success: true, skipped: true }, { status: 200 })
    }

    const lines = rows.map((r) => {
      const who = r.role === 'assistant' ? 'Sophia' : 'Student'
      return `${who}: ${r.content}`
    })
    const userPrompt = lines.join('\n')

    let assistantRaw = ''
    let tokensUsed = 0
    try {
      const msg = await anthropic.messages.create({
        model: HAIKU_MODEL,
        max_tokens: 150,
        system: SUMMARY_SYSTEM,
        messages: [{ role: 'user', content: userPrompt }],
      })

      assistantRaw = extractAssistantText(
        msg as { content: Array<{ type: string; text?: string }> },
      )
      const usage = (msg as { usage?: { input_tokens?: number; output_tokens?: number } })
        .usage
      if (usage?.input_tokens != null || usage?.output_tokens != null) {
        tokensUsed =
          (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0)
      } else {
        tokensUsed = Math.ceil(
          (SUMMARY_SYSTEM.length + userPrompt.length + assistantRaw.length) / 4,
        )
      }
    } catch (e) {
      console.error('summarise: Anthropic', e)
      trackEvent(user.id, 'session_summary_failed', {
        session_id: sessionId,
        error: e instanceof Error ? e.message : String(e),
      })
      return Response.json({ success: false, reason: 'llm_error' }, { status: 200 })
    }

    const bullets = parseBullets(assistantRaw)
    const summary = bullets.join(' | ')
    const now = new Date().toISOString()

    try {
      const admin = createAdminClient()
      const { error: updErr } = await admin
        .from('chat_sessions')
        .update({
          summary,
          summary_bullets: bullets,
          updated_at: now,
        })
        .eq('id', sessionId)
        .eq('user_id', user.id)

      if (updErr) {
        console.error('summarise: update session', updErr.message)
        trackEvent(user.id, 'session_summary_failed', {
          session_id: sessionId,
          error: updErr.message,
        })
        return Response.json({ success: false, reason: 'db_write' }, { status: 200 })
      }
    } catch (e) {
      console.error('summarise: update session', e)
      trackEvent(user.id, 'session_summary_failed', {
        session_id: sessionId,
        error: e instanceof Error ? e.message : String(e),
      })
      return Response.json({ success: false, reason: 'db_write' }, { status: 200 })
    }

    trackEvent(user.id, 'session_summary_generated', {
      session_id: sessionId,
      bullet_count: bullets.length,
      tokens_used: tokensUsed,
    })

    return Response.json({ success: true }, { status: 200 })
  } catch (e) {
    console.error('summarise: unexpected', e)
    return Response.json({ success: false, reason: 'unknown' }, { status: 200 })
  }
}
