import { trackEvent } from '@/lib/analytics/posthog-server'
import { updateCacheRating } from '@/lib/supabase/cache'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export const runtime = 'edge'

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return Response.json({ success: false, reason: 'no_auth' }, { status: 200 })
    }

    let body: {
      messageId?: unknown
      sessionId?: unknown
      rating?: unknown
      promptKey?: unknown
    }
    try {
      body = (await request.json()) as typeof body
    } catch {
      return Response.json({ success: false, reason: 'invalid_body' }, { status: 200 })
    }

    const messageId =
      typeof body.messageId === 'string' && body.messageId.trim() !== ''
        ? body.messageId.trim()
        : null
    const sessionId =
      typeof body.sessionId === 'string' && body.sessionId.trim() !== ''
        ? body.sessionId.trim()
        : null
    const rating = body.rating === 'positive' || body.rating === 'negative' ? body.rating : null
    const promptKey =
      typeof body.promptKey === 'string' && body.promptKey.trim() !== ''
        ? body.promptKey.trim()
        : null

    if (!messageId || !sessionId || !rating) {
      return Response.json({ success: false, reason: 'validation' }, { status: 200 })
    }

    try {
      const { error } = await supabase
        .from('chat_messages')
        .update({ feedback: rating })
        .eq('id', messageId)
        .eq('session_id', sessionId)
        .eq('user_id', user.id)

      if (error) {
        console.error('feedback: update message', error.message)
        return Response.json({ success: false, reason: 'db_update' }, { status: 200 })
      }
    } catch (e) {
      console.error('feedback: update message', e)
      return Response.json({ success: false, reason: 'db_update' }, { status: 200 })
    }

    if (promptKey) {
      await updateCacheRating(promptKey, rating)
    }

    trackEvent(user.id, 'sophia_response_rated', {
      session_id: sessionId,
      rating,
      message_id: messageId,
      prompt_key: promptKey,
      was_cached: !!promptKey,
    })

    return Response.json({ success: true }, { status: 200 })
  } catch (e) {
    console.error('feedback: unexpected', e)
    return Response.json({ success: false, reason: 'unknown' }, { status: 200 })
  }
}
