/**
 * Server-only session helpers (service role). Do not import from client bundles.
 */

import { createAdminClient } from '@/lib/supabase/admin'

export async function getPreviousSessionSummary(
  userId: string,
  currentSessionId: string | null,
): Promise<string | null> {
  try {
    const admin = createAdminClient()
    let q = admin
      .from('chat_sessions')
      .select('summary')
      .eq('user_id', userId)
      .eq('status', 'active')
      .not('summary', 'is', null)
      .neq('summary', '')
      .order('updated_at', { ascending: false })
      .limit(1)

    if (currentSessionId != null && currentSessionId.trim() !== '') {
      q = q.neq('id', currentSessionId.trim())
    }

    const { data, error } = await q.maybeSingle()

    if (error) {
      console.error('getPreviousSessionSummary:', error.message)
      return null
    }

    if (!data || typeof data.summary !== 'string') {
      return null
    }

    const s = data.summary.trim()
    return s.length > 0 ? s : null
  } catch (e) {
    console.error('getPreviousSessionSummary:', e)
    return null
  }
}
