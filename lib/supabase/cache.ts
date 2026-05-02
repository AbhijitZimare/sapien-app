/**
 * Server-only content cache (service role). Do not import from client bundles.
 * Uses Web Crypto SHA-256 so callers work on Edge and Node.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import type { CacheEntry } from '@/lib/types/database'

export async function generatePromptKey(parts: string[]): Promise<string> {
  const payload = new TextEncoder().encode(parts.join('|'))
  const hashBuffer = await crypto.subtle.digest('SHA-256', payload)
  const bytes = new Uint8Array(hashBuffer)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

function mapCacheRow(row: Record<string, unknown>): CacheEntry {
  const tier = row.tier
  const t: CacheEntry['tier'] =
    tier === 'B' || tier === 'C' || tier === 'D' ? tier : 'C'
  const jsonb = row.response_jsonb
  return {
    id: String(row.id),
    prompt_key: String(row.prompt_key ?? ''),
    response_jsonb:
      jsonb != null && typeof jsonb === 'object' && !Array.isArray(jsonb)
        ? (jsonb as Record<string, unknown>)
        : {},
    tier: t,
    model: String(row.model ?? ''),
    tokens_input:
      row.tokens_input != null ? Number(row.tokens_input) : null,
    tokens_output:
      row.tokens_output != null ? Number(row.tokens_output) : null,
    thumbs_up: Number(row.thumbs_up ?? 0),
    thumbs_down: Number(row.thumbs_down ?? 0),
    created_at: String(row.created_at ?? ''),
    last_served_at:
      row.last_served_at != null ? String(row.last_served_at) : null,
    invalidated_at:
      row.invalidated_at != null ? String(row.invalidated_at) : null,
  }
}

export async function getCacheEntry(
  promptKey: string,
): Promise<CacheEntry | null> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('content_cache')
      .select('*')
      .eq('prompt_key', promptKey)
      .is('invalidated_at', null)
      .maybeSingle()

    if (error || !data) {
      return null
    }

    const now = new Date().toISOString()
    const { error: updateErr } = await admin
      .from('content_cache')
      .update({ last_served_at: now })
      .eq('prompt_key', promptKey)

    if (updateErr) {
      console.error('getCacheEntry: last_served_at update', updateErr.message)
    }

    return mapCacheRow(data as Record<string, unknown>)
  } catch {
    return null
  }
}

export async function setCacheEntry(params: {
  promptKey: string
  responseJsonb: Record<string, unknown>
  tier: 'B' | 'C' | 'D'
  model: string
  tokensInput?: number
  tokensOutput?: number
}): Promise<void> {
  try {
    const admin = createAdminClient()
    const now = new Date().toISOString()
    const patch = {
      response_jsonb: params.responseJsonb,
      tier: params.tier,
      model: params.model,
      tokens_input: params.tokensInput ?? null,
      tokens_output: params.tokensOutput ?? null,
      last_served_at: now,
      invalidated_at: null as string | null,
    }

    const { data: existing, error: readErr } = await admin
      .from('content_cache')
      .select('id')
      .eq('prompt_key', params.promptKey)
      .maybeSingle()

    if (readErr) {
      console.error('setCacheEntry: read', readErr.message)
      return
    }

    if (existing) {
      const { error } = await admin
        .from('content_cache')
        .update(patch)
        .eq('prompt_key', params.promptKey)
      if (error) console.error('setCacheEntry: update', error.message)
      return
    }

    const { error } = await admin.from('content_cache').insert({
      prompt_key: params.promptKey,
      ...patch,
    })
    if (error) console.error('setCacheEntry: insert', error.message)
  } catch (e) {
    console.error('setCacheEntry:', e)
  }
}

export async function updateCacheRating(
  promptKey: string,
  rating: 'positive' | 'negative',
): Promise<void> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('content_cache')
      .select('thumbs_up, thumbs_down')
      .eq('prompt_key', promptKey)
      .maybeSingle()

    if (error || !data) {
      if (error) console.error('updateCacheRating: read', error.message)
      return
    }

    const row = data as { thumbs_up?: number; thumbs_down?: number }
    const patch =
      rating === 'positive'
        ? { thumbs_up: Number(row.thumbs_up ?? 0) + 1 }
        : { thumbs_down: Number(row.thumbs_down ?? 0) + 1 }

    const { error: upErr } = await admin
      .from('content_cache')
      .update(patch)
      .eq('prompt_key', promptKey)

    if (upErr) console.error('updateCacheRating: update', upErr.message)
  } catch (e) {
    console.error('updateCacheRating:', e)
  }
}
