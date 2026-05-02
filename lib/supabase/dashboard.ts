import { createClient } from '@/lib/supabase/client'
import type {
  ChatSession,
  ConceptMastery,
  Doubt,
  DoubtStatus,
  Plan,
  Subscription,
  UserStats,
} from '@/lib/types/database'

export type DashboardBundle = {
  stats: UserStats | null
  recentSessions: ChatSession[] | null
  /** concept_mastery rows (topic log), ordered by last_seen_at desc */
  topicsExplored: ConceptMastery[] | null
  doubts: Doubt[] | null
  subscription: Subscription | null
}

function parsePlan(p: string): Plan {
  if (p === 'family' || p === 'school') return p
  return 'free'
}

function parseDoubtStatus(s: string): DoubtStatus {
  if (s === 'open' || s === 'got_it' || s === 'not_yet') return s
  return 'open'
}

function mapStatsRow(row: Record<string, unknown>): UserStats {
  return {
    user_id: String(row.user_id),
    total_sessions: Number(row.total_sessions ?? 0),
    total_minutes: Number(row.total_minutes ?? 0),
    doubts_cleared: Number(row.doubts_cleared ?? 0),
    topics_explored: Number(row.topics_explored ?? 0),
    current_streak: Number(row.current_streak ?? 0),
    longest_streak: Number(row.longest_streak ?? 0),
    last_active_date:
      row.last_active_date != null ? String(row.last_active_date) : null,
    updated_at: String(row.updated_at ?? ''),
  }
}

function mapSessionRow(row: Record<string, unknown>): ChatSession {
  const topics = row.topics
  const bullets = row.summary_bullets
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    name: String(row.name ?? 'New chat'),
    board: row.board != null ? String(row.board) : null,
    grade: row.grade != null ? String(row.grade) : null,
    status: String(row.status ?? 'active'),
    message_count: Number(row.message_count ?? 0),
    last_message: row.last_message != null ? String(row.last_message) : null,
    topics: Array.isArray(topics) ? (topics as string[]) : [],
    doubts_opened: Number(row.doubts_opened ?? 0),
    doubts_cleared: Number(row.doubts_cleared ?? 0),
    duration_minutes: Number(row.duration_minutes ?? 0),
    summary: row.summary != null ? String(row.summary) : null,
    summary_bullets: Array.isArray(bullets)
      ? (bullets as string[])
      : bullets == null
        ? null
        : [],
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
  }
}

function mapConceptRow(row: Record<string, unknown>): ConceptMastery {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    concept: String(row.concept ?? ''),
    subject: String(row.subject ?? ''),
    board: String(row.board ?? ''),
    grade: String(row.grade ?? ''),
    mention_count: Number(row.mention_count ?? 0),
    mastery_score: Number(row.mastery_score ?? 0),
    last_seen_at: String(row.last_seen_at ?? ''),
    created_at: String(row.created_at ?? ''),
  }
}

function mapDoubtRow(row: Record<string, unknown>): Doubt {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    session_id: String(row.session_id ?? ''),
    step_title: String(row.step_title ?? ''),
    topic: String(row.topic ?? ''),
    status: parseDoubtStatus(String(row.status ?? 'open')),
    opened_at: String(row.opened_at ?? ''),
    resolved_at:
      row.resolved_at != null && String(row.resolved_at) !== ''
        ? String(row.resolved_at)
        : null,
  }
}

function mapSubscriptionRow(row: Record<string, unknown>): Subscription {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    plan: parsePlan(String(row.plan ?? 'free')),
    status: String(row.status ?? ''),
    current_period_end:
      row.current_period_end != null && String(row.current_period_end) !== ''
        ? String(row.current_period_end)
        : null,
  }
}

async function fetchStats(userId: string): Promise<UserStats | null> {
  try {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('user_stats')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()
    if (error || !data) {
      if (error) console.error('dashboard fetchStats:', error.message)
      return null
    }
    return mapStatsRow(data as Record<string, unknown>)
  } catch (e) {
    console.error('dashboard fetchStats:', e)
    return null
  }
}

async function fetchRecentSessions(
  userId: string,
): Promise<ChatSession[] | null> {
  try {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('chat_sessions')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(5)
    if (error) {
      console.error('dashboard fetchRecentSessions:', error.message)
      return null
    }
    const rows = (data ?? []) as Record<string, unknown>[]
    return rows.map(mapSessionRow)
  } catch (e) {
    console.error('dashboard fetchRecentSessions:', e)
    return null
  }
}

async function fetchTopicsExplored(
  userId: string,
): Promise<ConceptMastery[] | null> {
  try {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('concept_mastery')
      .select('*')
      .eq('user_id', userId)
      .order('last_seen_at', { ascending: false })
    if (error) {
      console.error('dashboard fetchTopicsExplored:', error.message)
      return null
    }
    const rows = (data ?? []) as Record<string, unknown>[]
    return rows.map(mapConceptRow)
  } catch (e) {
    console.error('dashboard fetchTopicsExplored:', e)
    return null
  }
}

async function fetchDoubts(userId: string): Promise<Doubt[] | null> {
  try {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('doubts')
      .select('*')
      .eq('user_id', userId)
      .order('opened_at', { ascending: false })
    if (error) {
      console.error('dashboard fetchDoubts:', error.message)
      return null
    }
    const rows = (data ?? []) as Record<string, unknown>[]
    return rows.map(mapDoubtRow)
  } catch (e) {
    console.error('dashboard fetchDoubts:', e)
    return null
  }
}

async function fetchSubscription(
  userId: string,
): Promise<Subscription | null> {
  try {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()
    if (error) {
      console.error('dashboard fetchSubscription:', error.message)
      return null
    }
    if (!data) return null
    return mapSubscriptionRow(data as Record<string, unknown>)
  } catch (e) {
    console.error('dashboard fetchSubscription:', e)
    return null
  }
}

export async function getDashboardData(
  userId: string,
): Promise<DashboardBundle> {
  const [stats, recentSessions, topicsExplored, doubts, subscription] =
    await Promise.all([
      fetchStats(userId),
      fetchRecentSessions(userId),
      fetchTopicsExplored(userId),
      fetchDoubts(userId),
      fetchSubscription(userId),
    ])

  return {
    stats,
    recentSessions,
    topicsExplored,
    doubts,
    subscription,
  }
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

function localYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Last 7 calendar days including today; keys are weekday labels (unique in this window). */
export async function getWeeklyActivity(
  userId: string,
): Promise<Record<string, number>> {
  const empty = (): Record<string, number> => {
    const out: Record<string, number> = {}
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      d.setHours(0, 0, 0, 0)
      const label = WEEKDAY_LABELS[d.getDay()]
      out[label] = 0
    }
    return out
  }

  try {
    const supabase = createClient()
    const start = new Date()
    start.setDate(start.getDate() - 6)
    start.setHours(0, 0, 0, 0)

    const { data, error } = await supabase
      .from('chat_sessions')
      .select('created_at')
      .eq('user_id', userId)
      .gte('created_at', start.toISOString())

    if (error) {
      console.error('dashboard getWeeklyActivity:', error.message)
      return empty()
    }

    const countsByYmd: Record<string, number> = {}
    for (const row of data ?? []) {
      const raw = (row as { created_at?: string }).created_at
      if (!raw) continue
      const d = new Date(raw)
      const ymd = localYmd(d)
      countsByYmd[ymd] = (countsByYmd[ymd] ?? 0) + 1
    }

    const out: Record<string, number> = {}
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      d.setHours(0, 0, 0, 0)
      const ymd = localYmd(d)
      const label = WEEKDAY_LABELS[d.getDay()]
      out[label] = countsByYmd[ymd] ?? 0
    }

    return out
  } catch (e) {
    console.error('dashboard getWeeklyActivity:', e)
    return empty()
  }
}

/** Ordered entries for chart (left-to-right = oldest to newest day in window). */
export function getOrderedWeekEntries(
  activity: Record<string, number>,
): { label: string; count: number }[] {
  const labels: string[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    d.setHours(0, 0, 0, 0)
    labels.push(WEEKDAY_LABELS[d.getDay()])
  }
  return labels.map((label) => ({ label, count: activity[label] ?? 0 }))
}
