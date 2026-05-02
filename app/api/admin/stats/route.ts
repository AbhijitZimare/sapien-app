import { createAdminClient } from '@/lib/supabase/admin'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type {
  AdminDailyActivity,
  AdminMatrixRow,
  AdminOverviewStats,
  AdminStatsResponse,
} from '@/lib/types/admin-stats'

export const runtime = 'nodejs'

const INPUT_PER_TOKEN = 0.0000008
const OUTPUT_PER_TOKEN = 0.000004

function isAdminEmail(email: string | undefined): boolean {
  const allowed =
    process.env.ADMIN_EMAIL?.trim().toLowerCase() ??
    process.env.NEXT_PUBLIC_ADMIN_EMAIL?.trim().toLowerCase() ??
    ''
  if (!allowed) return false
  return (email ?? '').trim().toLowerCase() === allowed
}

function startOfUtcDay(d: Date): Date {
  const x = new Date(d)
  x.setUTCHours(0, 0, 0, 0)
  return x
}

function addUtcDays(d: Date, days: number): Date {
  const x = new Date(d)
  x.setUTCDate(x.getUTCDate() + days)
  return x
}

type AssistantPromptRow = {
  prompt_key: string
  feedback: string | null
}

async function fetchAssistantPromptRows(
  admin: ReturnType<typeof createAdminClient>,
): Promise<{ data: AssistantPromptRow[]; error: Error | null }> {
  const pageSize = 1000
  const all: AssistantPromptRow[] = []
  let from = 0
  for (;;) {
    const { data, error } = await admin
      .from('chat_messages')
      .select('prompt_key, feedback')
      .eq('role', 'assistant')
      .not('prompt_key', 'is', null)
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1)

    if (error) {
      return { data: [], error: new Error(error.message) }
    }
    const rows = (data ?? []) as AssistantPromptRow[]
    all.push(...rows)
    if (rows.length < pageSize) break
    from += pageSize
  }
  return { data: all, error: null }
}

function groupByPromptKey(
  rows: AssistantPromptRow[],
): [string, { count: number; thumbs_up: number; thumbs_down: number }][] {
  const byKey = new Map<
    string,
    { count: number; thumbs_up: number; thumbs_down: number }
  >()

  for (const row of rows) {
    const key = row.prompt_key?.trim()
    if (!key) continue
    const cur = byKey.get(key) ?? { count: 0, thumbs_up: 0, thumbs_down: 0 }
    cur.count += 1
    if (row.feedback === 'positive') cur.thumbs_up += 1
    if (row.feedback === 'negative') cur.thumbs_down += 1
    byKey.set(key, cur)
  }

  return Array.from(byKey.entries())
}

async function buildMatrixRows(
  admin: ReturnType<typeof createAdminClient>,
  rows: AssistantPromptRow[],
): Promise<AdminMatrixRow[]> {
  const entries = groupByPromptKey(rows)
  const cacheByKey = new Map<
    string,
    { sumIn: number; sumOut: number; n: number }
  >()

  const keys = entries.map(([k]) => k)
  const chunkSize = 100
  for (let i = 0; i < keys.length; i += chunkSize) {
    const chunk = keys.slice(i, i + chunkSize)
    const { data, error } = await admin
      .from('content_cache')
      .select('prompt_key, tokens_input, tokens_output')
      .in('prompt_key', chunk)
      .is('invalidated_at', null)

    if (error) {
      console.error('admin/stats cache fetch', error.message)
      continue
    }
    for (const raw of data ?? []) {
      const row = raw as {
        prompt_key?: unknown
        tokens_input?: unknown
        tokens_output?: unknown
      }
      const pk =
        typeof row.prompt_key === 'string' ? row.prompt_key.trim() : ''
      if (!pk) continue
      const ti =
        row.tokens_input != null && Number.isFinite(Number(row.tokens_input))
          ? Number(row.tokens_input)
          : 0
      const to =
        row.tokens_output != null && Number.isFinite(Number(row.tokens_output))
          ? Number(row.tokens_output)
          : 0
      const cur = cacheByKey.get(pk) ?? { sumIn: 0, sumOut: 0, n: 0 }
      cur.sumIn += ti
      cur.sumOut += to
      cur.n += 1
      cacheByKey.set(pk, cur)
    }
  }

  const matrix: AdminMatrixRow[] = entries.map(([prompt_key, agg]) => {
    const cc = cacheByKey.get(prompt_key)
    const avg_input = cc && cc.n > 0 ? cc.sumIn / cc.n : null
    const avg_output = cc && cc.n > 0 ? cc.sumOut / cc.n : null

    const denom = agg.thumbs_up + agg.thumbs_down
    const thumbs_up_rate =
      denom > 0 ? (agg.thumbs_up / denom) * 100 : null

    const costBase =
      (avg_input ?? 0) * INPUT_PER_TOKEN + (avg_output ?? 0) * OUTPUT_PER_TOKEN

    let cost_per_useful: number | null = null
    if (
      thumbs_up_rate != null &&
      thumbs_up_rate > 0 &&
      costBase > 0
    ) {
      cost_per_useful = costBase / (thumbs_up_rate / 100)
    }

    return {
      prompt_key,
      message_count: agg.count,
      avg_input,
      avg_output,
      thumbs_up: agg.thumbs_up,
      thumbs_down: agg.thumbs_down,
      thumbs_up_rate,
      cost_per_useful,
    }
  })

  matrix.sort((a, b) => {
    const ac = a.cost_per_useful
    const bc = b.cost_per_useful
    if (ac == null && bc == null) return b.message_count - a.message_count
    if (ac == null) return 1
    if (bc == null) return -1
    if (bc !== ac) return bc - ac
    return b.message_count - a.message_count
  })

  return matrix.slice(0, 50)
}

type DailyAggRow = {
  created_at: string
  role: string
  was_cache_hit: boolean | null
}

function buildDailyActivity(
  rows: DailyAggRow[],
  weekStart: Date,
): AdminDailyActivity[] {
  const byDate = new Map<string, { messages: number; cacheHits: number }>()
  for (const row of rows) {
    if (row.role !== 'assistant') continue
    const d = new Date(row.created_at)
    const key = formatDateKey(d)
    const cur = byDate.get(key) ?? { messages: 0, cacheHits: 0 }
    cur.messages += 1
    if (row.was_cache_hit === true) cur.cacheHits += 1
    byDate.set(key, cur)
  }

  const out: AdminDailyActivity[] = []
  for (let i = 0; i < 7; i++) {
    const d = addUtcDays(weekStart, i)
    const key = formatDateKey(d)
    const cur = byDate.get(key) ?? { messages: 0, cacheHits: 0 }
    out.push({
      date: key,
      messages: cur.messages,
      cacheHits: cur.cacheHits,
    })
  }
  return out
}

function formatDateKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user?.email || !isAdminEmail(user.email)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    const admin = createAdminClient()
    const now = new Date()
    const weekStart = addUtcDays(startOfUtcDay(now), -6)
    const weekAgoIso = addUtcDays(now, -7).toISOString()

    const [
      weeklyMessagesRes,
      cacheHitsRes,
      withPromptKeyRes,
      thumbsUpRes,
      withFeedbackRes,
      cacheRowsRes,
      promptRowsResult,
      dailyRowsRes,
    ] = await Promise.all([
      admin
        .from('chat_messages')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'assistant')
        .gte('created_at', weekAgoIso),
      admin
        .from('chat_messages')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'assistant')
        .eq('was_cache_hit', true)
        .not('prompt_key', 'is', null),
      admin
        .from('chat_messages')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'assistant')
        .not('prompt_key', 'is', null),
      admin
        .from('chat_messages')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'assistant')
        .eq('feedback', 'positive'),
      admin
        .from('chat_messages')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'assistant')
        .not('feedback', 'is', null),
      admin
        .from('content_cache')
        .select('tokens_input, tokens_output')
        .gte('created_at', weekAgoIso),
      fetchAssistantPromptRows(admin),
      admin
        .from('chat_messages')
        .select('created_at, role, was_cache_hit')
        .gte('created_at', weekStart.toISOString()),
    ])

    if (promptRowsResult.error) {
      return Response.json(
        { error: promptRowsResult.error.message },
        { status: 500 },
      )
    }

    const err =
      weeklyMessagesRes.error ??
      cacheHitsRes.error ??
      withPromptKeyRes.error ??
      thumbsUpRes.error ??
      withFeedbackRes.error ??
      cacheRowsRes.error ??
      dailyRowsRes.error

    if (err) {
      console.error('admin/stats:', err.message)
      return Response.json({ error: err.message }, { status: 500 })
    }

    const weeklyMessages = weeklyMessagesRes.count ?? 0
    const totalCacheHits = cacheHitsRes.count ?? 0
    const totalWithPromptKey = withPromptKeyRes.count ?? 0
    const totalThumbsUp = thumbsUpRes.count ?? 0
    const totalWithFeedback = withFeedbackRes.count ?? 0

    const cacheHitRate =
      totalWithPromptKey > 0
        ? (totalCacheHits / totalWithPromptKey) * 100
        : null
    const thumbsUpRate =
      totalWithFeedback > 0
        ? (totalThumbsUp / totalWithFeedback) * 100
        : null

    let weeklyCost = 0
    for (const row of cacheRowsRes.data ?? []) {
      const r = row as { tokens_input?: unknown; tokens_output?: unknown }
      const ti =
        r.tokens_input != null && Number.isFinite(Number(r.tokens_input))
          ? Number(r.tokens_input)
          : 0
      const to =
        r.tokens_output != null && Number.isFinite(Number(r.tokens_output))
          ? Number(r.tokens_output)
          : 0
      weeklyCost += ti * INPUT_PER_TOKEN + to * OUTPUT_PER_TOKEN
    }

    const matrixRows = await buildMatrixRows(
      admin,
      promptRowsResult.data,
    )

    const dailyActivity = buildDailyActivity(
      (dailyRowsRes.data ?? []) as DailyAggRow[],
      weekStart,
    )

    const overview: AdminOverviewStats = {
      weeklyMessages,
      cacheHitRate,
      thumbsUpRate,
      weeklyCost,
    }

    const body: AdminStatsResponse = {
      overview,
      matrixRows,
      dailyActivity,
    }

    return Response.json(body)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('admin/stats:', e)
    return Response.json({ error: msg }, { status: 500 })
  }
}
