'use client'

import Image from 'next/image'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight,
  BookOpen,
  Brain,
  CheckCircle,
  Clock,
  Flame,
  Lock,
  MessageSquare,
} from 'lucide-react'

import {
  getDashboardData,
  getOrderedWeekEntries,
  getWeeklyActivity,
} from '@/lib/supabase/dashboard'
import type {
  ChatSession,
  ConceptMastery,
  Doubt,
  Subscription,
  UserStats,
} from '@/lib/types/database'

export type DashboardProfileProps = {
  name: string | null
  grade: string | null
  board: string | null
  school_name: string | null
  favourite_subject: string | null
  cover_style: string | null
  photo_url: string | null
}

interface Props {
  userId: string
  profile: DashboardProfileProps
}

const PAGE_BG = '#F4F4F4'
const CARD_BG = '#FFFFFF'
const BORDER = '#E8E4DC'
const NAVY = '#0D1B2A'
const TEAL = '#0BB5AD'
const AMBER = '#F0A500'

function zeroStats(userId: string): UserStats {
  return {
    user_id: userId,
    total_sessions: 0,
    total_minutes: 0,
    doubts_cleared: 0,
    topics_explored: 0,
    current_streak: 0,
    longest_streak: 0,
    last_active_date: null,
    updated_at: '',
  }
}

function formatStudyMinutes(total: number): string {
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h}h`
  return `${m}m`
}

function formatTimeAgo(iso: string): string {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ''
  const diff = Date.now() - t
  const sec = Math.floor(diff / 1000)
  if (sec < 45) return 'just now'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min} minute${min === 1 ? '' : 's'} ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} hour${hr === 1 ? '' : 's'} ago`
  const day = Math.floor(hr / 24)
  if (day < 14) return `${day} day${day === 1 ? '' : 's'} ago`
  return new Date(iso).toLocaleDateString()
}

function greetingLine(name: string): string {
  const h = new Date().getHours()
  const display = name.trim() || 'Student'
  if (h < 12) return `Good morning, ${display}`
  if (h < 17) return `Good afternoon, ${display}`
  return `Good evening, ${display}`
}

function isValidPhotoUrl(url: string | null | undefined): url is string {
  if (!url || url.trim() === '') return false
  try {
    const u = new URL(url)
    return u.protocol === 'https:' || u.protocol === 'http:'
  } catch {
    return false
  }
}

function initialsFromName(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'S'
}

function subjectPillStyle(subject: string): { bg: string; text: string } {
  const s = subject.trim().toLowerCase()
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h + s.charCodeAt(i) * (i + 1)) % 3
  }
  if (h === 0) return { bg: '#FDECEA', text: '#B91C1C' }
  if (h === 1) return { bg: '#FEF3C7', text: '#92400E' }
  return { bg: '#CCFBF1', text: '#0F766E' }
}

interface AggregatedTopic {
  concept: string
  subject: string
  mention_count: number
  last_seen_at: string
}

function aggregateTopicsByConcept(rows: ConceptMastery[]): AggregatedTopic[] {
  const m = new Map<
    string,
    {
      concept: string
      subject: string
      mentionSum: number
      lastSeen: string
    }
  >()

  for (const r of rows) {
    const key = (r.concept.trim().toLowerCase() || '\u0000') as string
    const prev = m.get(key)
    const seen = r.last_seen_at
    const seenTime = new Date(seen).getTime()

    if (!prev) {
      m.set(key, {
        concept: r.concept.trim() || r.concept,
        subject: r.subject.trim() || 'General',
        mentionSum: r.mention_count,
        lastSeen: seen,
      })
    } else {
      prev.mentionSum += r.mention_count
      const prevTime = new Date(prev.lastSeen).getTime()
      if (seenTime >= prevTime) {
        prev.lastSeen = seen
        prev.concept = r.concept.trim() || r.concept
        prev.subject = r.subject.trim() || 'General'
      }
    }
  }

  return [...m.values()]
    .map((v) => ({
      concept: v.concept,
      subject: v.subject,
      mention_count: v.mentionSum,
      last_seen_at: v.lastSeen,
    }))
    .sort(
      (a, b) =>
        new Date(b.last_seen_at).getTime() - new Date(a.last_seen_at).getTime(),
    )
}

function doubtStatusLabel(s: Doubt['status']): string {
  if (s === 'open') return 'Open'
  if (s === 'got_it') return 'Got it'
  return 'Not yet'
}

function subscriptionDisplay(sub: Subscription | null): {
  label: string
  bg: string
  text: string
} {
  const plan = sub?.plan ?? 'free'
  if (plan === 'family')
    return { label: 'Family', bg: 'rgba(240,165,0,0.15)', text: AMBER }
  if (plan === 'school')
    return { label: 'School', bg: 'rgba(11,181,173,0.12)', text: TEAL }
  return { label: 'Free Plan', bg: '#F3F4F6', text: '#6B7280' }
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2
      className="mb-3 text-[13px] font-medium tracking-[0.08em] uppercase"
      style={{ color: '#9CA3AF', fontFamily: 'DM Sans, system-ui, sans-serif' }}
    >
      {children}
    </h2>
  )
}

export default function DashboardClient({ userId, profile }: Props) {
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<UserStats | null>(null)
  const [recentSessions, setRecentSessions] = useState<ChatSession[] | null>(
    null,
  )
  const [topicsRows, setTopicsRows] = useState<ConceptMastery[] | null>(null)
  const [topicsExpanded, setTopicsExpanded] = useState(false)
  const [doubts, setDoubts] = useState<Doubt[] | null>(null)
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [weekActivity, setWeekActivity] = useState<Record<string, number>>({})

  const recentRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const [bundle, weekly] = await Promise.all([
          getDashboardData(userId),
          getWeeklyActivity(userId),
        ])
        if (cancelled) return
        setStats(bundle.stats)
        setRecentSessions(bundle.recentSessions)
        setTopicsRows(bundle.topicsExplored)
        setDoubts(bundle.doubts)
        setSubscription(bundle.subscription)
        setWeekActivity(weekly)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [userId])

  const s = stats ?? zeroStats(userId)
  const sessionsList = recentSessions ?? []
  const topicsSource = topicsRows ?? []
  const topicsAggregated = useMemo(
    () => aggregateTopicsByConcept(topicsSource),
    [topicsSource],
  )
  const topicsDisplay = useMemo(
    () =>
      topicsExpanded ? topicsAggregated : topicsAggregated.slice(0, 10),
    [topicsAggregated, topicsExpanded],
  )
  const maxTopicMentions = useMemo(
    () =>
      topicsAggregated.length === 0
        ? 1
        : Math.max(...topicsAggregated.map((t) => t.mention_count), 1),
    [topicsAggregated],
  )

  const doubtsList = doubts ?? []

  const doubtCounts = useMemo(() => {
    let open = 0
    let got = 0
    let notYet = 0
    for (const d of doubtsList) {
      if (d.status === 'open') open += 1
      else if (d.status === 'got_it') got += 1
      else notYet += 1
    }
    return { open, got_it: got, not_yet: notYet }
  }, [doubtsList])

  const weekEntries = useMemo(
    () => getOrderedWeekEntries(weekActivity),
    [weekActivity],
  )
  const weekTotal = useMemo(
    () => weekEntries.reduce((a, b) => a + b.count, 0),
    [weekEntries],
  )
  const maxWeek = useMemo(
    () => Math.max(...weekEntries.map((e) => e.count), 1),
    [weekEntries],
  )

  const displayName = profile.name?.trim() || 'Student'
  const subBadge = subscriptionDisplay(subscription)

  function scrollToRecent() {
    recentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  if (loading) {
    return (
      <div
        className="min-h-full overflow-y-auto p-4 md:p-6"
        style={{ background: PAGE_BG }}
      >
        <div className="mx-auto flex max-w-6xl flex-col gap-6">
          <div className="animate-pulse space-y-4">
            <div className="h-10 w-2/3 max-w-md rounded-lg bg-zinc-200" />
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="h-28 rounded-xl bg-zinc-200"
                  style={{ borderRadius: 12 }}
                />
              ))}
            </div>
            <div className="flex flex-col gap-4 lg:flex-row">
              <div className="h-64 flex-1 rounded-xl bg-zinc-200 lg:w-[60%]" />
              <div className="h-64 flex-1 rounded-xl bg-zinc-200 lg:w-[40%]" />
            </div>
            <div className="flex flex-col gap-4 lg:flex-row">
              <div className="h-56 flex-1 rounded-xl bg-zinc-200 lg:w-[60%]" />
              <div className="h-56 flex-1 rounded-xl bg-zinc-200 lg:w-[40%]" />
            </div>
            <div className="flex flex-col gap-4 lg:flex-row">
              <div className="h-48 flex-1 rounded-xl bg-zinc-200" />
              <div className="h-48 flex-1 rounded-xl bg-zinc-200" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="min-h-full overflow-y-auto p-4 md:p-6"
      style={{ background: PAGE_BG }}
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        {/* ROW 1 */}
        <header>
          <h1
            className="mb-6 text-[32px] font-light"
            style={{
              fontFamily: 'Cormorant Garamond, Georgia, serif',
              color: NAVY,
            }}
          >
            {greetingLine(displayName)}
          </h1>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <div
              className="group rounded-xl border border-solid p-5 transition-colors hover:border-l-[3px] hover:[border-left-color:#0BB5AD]"
              style={{
                background: CARD_BG,
                borderColor: BORDER,
                borderRadius: 12,
                padding: 20,
                borderLeftWidth: 3,
                borderLeftColor: 'transparent',
              }}
            >
              <MessageSquare
                className="mb-2 h-6 w-6"
                style={{ color: TEAL }}
                aria-hidden
              />
              <p
                className="text-[28px] font-bold"
                style={{ color: NAVY, fontFamily: 'DM Sans, system-ui, sans-serif' }}
              >
                {s.total_sessions}
              </p>
              <p
                className="text-xs"
                style={{ color: '#6B7280', fontFamily: 'DM Sans, system-ui, sans-serif' }}
              >
                Total Sessions
              </p>
            </div>
            <div
              className="group rounded-xl border border-solid p-5 transition-colors hover:border-l-[3px] hover:[border-left-color:#0BB5AD]"
              style={{
                background: CARD_BG,
                borderColor: BORDER,
                borderRadius: 12,
                padding: 20,
                borderLeftWidth: 3,
                borderLeftColor: 'transparent',
              }}
            >
              <Flame
                className="mb-2 h-6 w-6"
                style={{ color: s.current_streak > 0 ? AMBER : TEAL }}
                aria-hidden
              />
              <p
                className="text-[28px] font-bold"
                style={{
                  color: s.current_streak > 0 ? AMBER : NAVY,
                  fontFamily: 'DM Sans, system-ui, sans-serif',
                }}
              >
                {s.current_streak}
              </p>
              <p
                className="text-xs"
                style={{ color: '#6B7280', fontFamily: 'DM Sans, system-ui, sans-serif' }}
              >
                Day Streak
              </p>
            </div>
            <div
              className="group rounded-xl border border-solid p-5 transition-colors hover:border-l-[3px] hover:[border-left-color:#0BB5AD]"
              style={{
                background: CARD_BG,
                borderColor: BORDER,
                borderRadius: 12,
                padding: 20,
                borderLeftWidth: 3,
                borderLeftColor: 'transparent',
              }}
            >
              <CheckCircle
                className="mb-2 h-6 w-6"
                style={{ color: TEAL }}
                aria-hidden
              />
              <p
                className="text-[28px] font-bold"
                style={{ color: NAVY, fontFamily: 'DM Sans, system-ui, sans-serif' }}
              >
                {s.doubts_cleared}
              </p>
              <p
                className="text-xs"
                style={{ color: '#6B7280', fontFamily: 'DM Sans, system-ui, sans-serif' }}
              >
                Doubts Cleared
              </p>
            </div>
            <div
              className="group rounded-xl border border-solid p-5 transition-colors hover:border-l-[3px] hover:[border-left-color:#0BB5AD]"
              style={{
                background: CARD_BG,
                borderColor: BORDER,
                borderRadius: 12,
                padding: 20,
                borderLeftWidth: 3,
                borderLeftColor: 'transparent',
              }}
            >
              <BookOpen
                className="mb-2 h-6 w-6"
                style={{ color: TEAL }}
                aria-hidden
              />
              <p
                className="text-[28px] font-bold"
                style={{ color: NAVY, fontFamily: 'DM Sans, system-ui, sans-serif' }}
              >
                {s.topics_explored}
              </p>
              <p
                className="text-xs"
                style={{ color: '#6B7280', fontFamily: 'DM Sans, system-ui, sans-serif' }}
              >
                Topics Explored
              </p>
            </div>
            <div
              className="group rounded-xl border border-solid p-5 transition-colors hover:border-l-[3px] hover:[border-left-color:#0BB5AD]"
              style={{
                background: CARD_BG,
                borderColor: BORDER,
                borderRadius: 12,
                padding: 20,
                borderLeftWidth: 3,
                borderLeftColor: 'transparent',
              }}
            >
              <Clock
                className="mb-2 h-6 w-6"
                style={{ color: TEAL }}
                aria-hidden
              />
              <p
                className="text-[28px] font-bold"
                style={{ color: NAVY, fontFamily: 'DM Sans, system-ui, sans-serif' }}
              >
                {formatStudyMinutes(s.total_minutes)}
              </p>
              <p
                className="text-xs"
                style={{ color: '#6B7280', fontFamily: 'DM Sans, system-ui, sans-serif' }}
              >
                Time Studied
              </p>
            </div>
          </div>
        </header>

        {/* ROW 2 */}
        <div className="flex flex-col gap-6 lg:flex-row lg:gap-6">
          <section
            ref={recentRef}
            id="recent-sessions"
            className="min-w-0 scroll-mt-24 lg:w-[60%] lg:flex-[3]"
            aria-labelledby="recent-sessions-heading"
          >
            <SectionTitle>
              <span id="recent-sessions-heading">Recent sessions</span>
            </SectionTitle>
            <div
              className="rounded-xl border border-solid"
              style={{
                background: CARD_BG,
                borderColor: BORDER,
                borderRadius: 12,
                padding: 20,
              }}
            >
              {sessionsList.length === 0 ? (
                <div className="py-8 text-center">
                  <p
                    className="mb-4 text-sm"
                    style={{
                      color: '#6B7280',
                      fontFamily: 'DM Sans, system-ui, sans-serif',
                    }}
                  >
                    No sessions yet. Start a conversation with Sophia.
                  </p>
                  <Link
                    href="/learn"
                    className="inline-flex min-h-[44px] items-center justify-center rounded-xl px-5 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-[#0BB5AD] focus-visible:ring-offset-2"
                    style={{
                      background: TEAL,
                      color: '#FFFFFF',
                      fontFamily: 'DM Sans, system-ui, sans-serif',
                    }}
                    aria-label="Ask Sophia to start a session"
                  >
                    Ask Sophia
                  </Link>
                </div>
              ) : (
                <ul className="space-y-2">
                  {sessionsList.map((sess) => (
                    <li key={sess.id}>
                      <button
                        type="button"
                        onClick={() => {
                          window.location.href = '/learn'
                        }}
                        className="flex min-h-[44px] w-full items-center gap-3 rounded-xl border border-transparent px-3 py-2 text-left outline-none transition-colors hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-[#0BB5AD] focus-visible:ring-offset-2"
                        aria-label={`Continue chat ${sess.name}`}
                      >
                        <div className="min-w-0 flex-1">
                          <p
                            className="truncate font-medium"
                            style={{
                              color: NAVY,
                              fontFamily: 'DM Sans, system-ui, sans-serif',
                            }}
                          >
                            {sess.name}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <span
                              className="rounded-full px-2 py-0.5 text-xs"
                              style={{
                                background: 'rgba(11,181,173,0.12)',
                                color: TEAL,
                                fontFamily: 'DM Sans, system-ui, sans-serif',
                              }}
                            >
                              Class {sess.grade ?? '—'} · {sess.board ?? '—'}
                            </span>
                            <span
                              className="text-xs"
                              style={{
                                color: '#6B7280',
                                fontFamily: 'DM Sans, system-ui, sans-serif',
                              }}
                            >
                              {sess.message_count} message
                              {sess.message_count === 1 ? '' : 's'} ·{' '}
                              {formatTimeAgo(sess.updated_at)}
                            </span>
                          </div>
                        </div>
                        <ArrowRight className="h-5 w-5 shrink-0 text-zinc-400" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section
            className="min-w-0 lg:w-[40%] lg:flex-[2]"
            aria-labelledby="weekly-activity-heading"
          >
            <SectionTitle>
              <span id="weekly-activity-heading">Weekly activity</span>
            </SectionTitle>
            <div
              className="rounded-xl border border-solid"
              style={{
                background: CARD_BG,
                borderColor: BORDER,
                borderRadius: 12,
                padding: 20,
              }}
            >
              <div className="flex h-[100px] items-end justify-between gap-1">
                {weekEntries.map((day, i) => {
                  const h =
                    day.count === 0
                      ? 4
                      : Math.max(8, (day.count / maxWeek) * 80)
                  return (
                    <div
                      key={`week-day-${i}`}
                      className="flex flex-1 flex-col items-center gap-2"
                    >
                      <div
                        className="flex w-full justify-center"
                        style={{ height: 80, alignItems: 'flex-end' }}
                      >
                        <div
                          className="w-[70%] max-w-[32px] rounded-t transition-[height] duration-300"
                          style={{
                            height: h,
                            background: day.count === 0 ? BORDER : TEAL,
                          }}
                          aria-hidden
                        />
                      </div>
                      <span
                        className="text-center text-[10px] font-medium sm:text-xs"
                        style={{
                          color: '#6B7280',
                          fontFamily: 'DM Sans, system-ui, sans-serif',
                        }}
                      >
                        {day.label}
                      </span>
                    </div>
                  )
                })}
              </div>
              {weekTotal === 0 ? (
                <p
                  className="mt-4 text-center text-xs"
                  style={{
                    color: '#6B7280',
                    fontFamily: 'DM Sans, system-ui, sans-serif',
                  }}
                >
                  Your activity will appear here
                </p>
              ) : null}
            </div>
          </section>
        </div>

        {/* ROW 3 */}
        <div className="flex flex-col gap-6 lg:flex-row lg:gap-6">
          <section
            className="min-w-0 lg:w-[60%] lg:flex-[3]"
            aria-labelledby="topics-explored-heading"
          >
            <SectionTitle>
              <span id="topics-explored-heading">Topics explored</span>
            </SectionTitle>
            <div
              className="rounded-xl border border-solid"
              style={{
                background: CARD_BG,
                borderColor: BORDER,
                borderRadius: 12,
                padding: 20,
              }}
            >
              {topicsAggregated.length === 0 ? (
                <div className="flex flex-col items-center py-10 text-center">
                  <BookOpen
                    className="mb-3 h-10 w-10"
                    style={{ color: TEAL }}
                    aria-hidden
                  />
                  <p
                    className="mb-1 text-base font-medium"
                    style={{
                      color: NAVY,
                      fontFamily: 'DM Sans, system-ui, sans-serif',
                    }}
                  >
                    No topics explored yet
                  </p>
                  <p
                    className="max-w-sm text-sm"
                    style={{
                      color: '#6B7280',
                      fontFamily: 'DM Sans, system-ui, sans-serif',
                    }}
                  >
                    Start a conversation with Sophia to begin
                  </p>
                </div>
              ) : (
                <>
                  <ul className="max-h-[min(70vh,520px)] space-y-4 overflow-y-auto pr-1">
                    {topicsDisplay.map((t) => {
                      const pill = subjectPillStyle(t.subject)
                      const barPct = Math.max(
                        4,
                        (t.mention_count / maxTopicMentions) * 100,
                      )
                      return (
                        <li
                          key={`${t.concept}-${t.last_seen_at}`}
                          className="border-b border-[#E8E4DC] pb-4 last:border-b-0 last:pb-0"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <p
                              className="text-[14px] font-medium"
                              style={{
                                color: NAVY,
                                fontFamily: 'DM Sans, system-ui, sans-serif',
                              }}
                            >
                              {t.concept}
                            </p>
                            <span
                              className="shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium"
                              style={{
                                background: pill.bg,
                                color: pill.text,
                                fontFamily: 'DM Sans, system-ui, sans-serif',
                              }}
                            >
                              {t.subject}
                            </span>
                          </div>
                          <p
                            className="mt-1 text-xs"
                            style={{
                              color: '#6B7280',
                              fontFamily: 'DM Sans, system-ui, sans-serif',
                            }}
                          >
                            Explored {t.mention_count}{' '}
                            {t.mention_count === 1 ? 'time' : 'times'} ·{' '}
                            {formatTimeAgo(t.last_seen_at)}
                          </p>
                          <div
                            className="mt-2 h-1 w-full rounded-full"
                            style={{ background: '#E8E4DC' }}
                            aria-hidden
                          >
                            <div
                              className="h-1 min-w-[4px] rounded-full"
                              style={{
                                width: `${barPct}%`,
                                background: TEAL,
                              }}
                            />
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                  {topicsAggregated.length > 10 ? (
                    <button
                      type="button"
                      onClick={() => setTopicsExpanded((v) => !v)}
                      className="mt-4 min-h-[44px] w-full text-center text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-[#0BB5AD] focus-visible:ring-offset-2"
                      style={{
                        color: TEAL,
                        fontFamily: 'DM Sans, system-ui, sans-serif',
                        cursor: 'pointer',
                      }}
                      aria-expanded={topicsExpanded}
                      aria-label={
                        topicsExpanded
                          ? 'Show fewer topics'
                          : 'See all explored topics'
                      }
                    >
                      {topicsExpanded ? 'See less' : 'See all'}
                    </button>
                  ) : null}
                </>
              )}
            </div>

            <div
              className="mt-6 rounded-xl border border-solid opacity-70"
              style={{
                background: '#F9F8F6',
                borderColor: BORDER,
                borderRadius: 12,
                padding: 20,
                cursor: 'default',
              }}
              aria-labelledby="concept-mastery-locked-heading"
            >
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h2
                  id="concept-mastery-locked-heading"
                  className="text-[13px] font-medium tracking-[0.08em] uppercase"
                  style={{
                    color: '#9CA3AF',
                    fontFamily: 'DM Sans, system-ui, sans-serif',
                  }}
                >
                  Concept mastery
                </h2>
                <div className="flex items-center gap-2">
                  <Lock
                    className="h-4 w-4 shrink-0"
                    style={{ color: '#6B7280' }}
                    aria-hidden
                  />
                  <span
                    className="rounded-full px-2 py-0.5 font-medium"
                    style={{
                      background: '#E8E4DC',
                      color: '#6B7280',
                      fontSize: '11px',
                      fontFamily: 'DM Sans, system-ui, sans-serif',
                    }}
                  >
                    Study Mode Only
                  </span>
                </div>
              </div>
              <div className="flex flex-col items-center text-center">
                <Brain
                  className="mb-3 h-8 w-8"
                  style={{ color: '#9CA3AF' }}
                  aria-hidden
                />
                <p
                  className="mb-2 text-[16px] font-medium"
                  style={{
                    color: '#6B7280',
                    fontFamily: 'DM Sans, system-ui, sans-serif',
                  }}
                >
                  Concept Mastery unlocks in Study Mode
                </p>
                <p
                  className="max-w-md text-[13px] leading-relaxed"
                  style={{
                    color: '#9CA3AF',
                    fontFamily: 'DM Sans, system-ui, sans-serif',
                  }}
                >
                  Mastery is measured through structured practice, chapter tests,
                  and timed questions — coming soon.
                </p>
              </div>
            </div>
          </section>

          <section
            className="min-w-0 lg:w-[40%] lg:flex-[2]"
            aria-labelledby="doubts-heading"
          >
            <SectionTitle>
              <span id="doubts-heading">Doubts tracker</span>
            </SectionTitle>
            <div
              className="rounded-xl border border-solid"
              style={{
                background: CARD_BG,
                borderColor: BORDER,
                borderRadius: 12,
                padding: 20,
              }}
            >
              <div className="mb-4 grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="mb-1 flex items-center justify-center gap-2">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: AMBER }}
                      aria-hidden
                    />
                    <span
                      className="text-lg font-bold"
                      style={{ color: NAVY, fontFamily: 'DM Sans, system-ui, sans-serif' }}
                    >
                      {doubtCounts.open}
                    </span>
                  </div>
                  <span
                    className="text-xs"
                    style={{ color: '#6B7280', fontFamily: 'DM Sans, system-ui, sans-serif' }}
                  >
                    Open
                  </span>
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-center gap-2">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: TEAL }}
                      aria-hidden
                    />
                    <span
                      className="text-lg font-bold"
                      style={{ color: NAVY, fontFamily: 'DM Sans, system-ui, sans-serif' }}
                    >
                      {doubtCounts.got_it}
                    </span>
                  </div>
                  <span
                    className="text-xs"
                    style={{ color: '#6B7280', fontFamily: 'DM Sans, system-ui, sans-serif' }}
                  >
                    Got it
                  </span>
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-center gap-2">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: '#DC2626' }}
                      aria-hidden
                    />
                    <span
                      className="text-lg font-bold"
                      style={{ color: NAVY, fontFamily: 'DM Sans, system-ui, sans-serif' }}
                    >
                      {doubtCounts.not_yet}
                    </span>
                  </div>
                  <span
                    className="text-xs"
                    style={{ color: '#6B7280', fontFamily: 'DM Sans, system-ui, sans-serif' }}
                  >
                    Not yet
                  </span>
                </div>
              </div>

              {doubtsList.length === 0 ? (
                <p
                  className="py-4 text-center text-sm"
                  style={{
                    color: '#6B7280',
                    fontFamily: 'DM Sans, system-ui, sans-serif',
                  }}
                >
                  No doubts tracked yet
                </p>
              ) : (
                <ul className="divide-y divide-[#E8E4DC] border-t border-[#E8E4DC]">
                  {doubtsList.slice(0, 5).map((d) => (
                    <li key={d.id} className="flex flex-col gap-1 py-3">
                      <p
                        className="text-sm font-medium"
                        style={{
                          color: NAVY,
                          fontFamily: 'DM Sans, system-ui, sans-serif',
                        }}
                      >
                        {d.topic || d.step_title || 'Doubt'}
                      </p>
                      <span
                        className="w-fit rounded-full px-2 py-0.5 text-xs"
                        style={{
                          background:
                            d.status === 'open'
                              ? 'rgba(240,165,0,0.15)'
                              : d.status === 'got_it'
                                ? 'rgba(11,181,173,0.12)'
                                : 'rgba(220,38,38,0.1)',
                          color:
                            d.status === 'open'
                              ? AMBER
                              : d.status === 'got_it'
                                ? TEAL
                                : '#DC2626',
                          fontFamily: 'DM Sans, system-ui, sans-serif',
                        }}
                      >
                        {doubtStatusLabel(d.status)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>

        {/* ROW 4 */}
        <div className="flex flex-col gap-6 lg:flex-row lg:gap-6">
          <section
            className="min-w-0 flex-1"
            aria-labelledby="profile-card-heading"
          >
            <SectionTitle>
              <span id="profile-card-heading">Your profile</span>
            </SectionTitle>
            <div
              className="flex flex-col gap-4 rounded-xl border border-solid p-5 sm:flex-row sm:items-center"
              style={{
                background: CARD_BG,
                borderColor: BORDER,
                borderRadius: 12,
                padding: 20,
              }}
            >
              {isValidPhotoUrl(profile.photo_url) ? (
                <Image
                  src={profile.photo_url}
                  alt=""
                  width={80}
                  height={80}
                  className="h-20 w-20 shrink-0 rounded-full object-cover"
                />
              ) : (
                <div
                  className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full text-lg font-semibold text-white"
                  style={{ background: TEAL, fontFamily: 'DM Sans, system-ui, sans-serif' }}
                  aria-hidden
                >
                  {initialsFromName(displayName)}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <p
                    className="text-2xl font-light"
                    style={{
                      fontFamily: 'Cormorant Garamond, Georgia, serif',
                      color: NAVY,
                    }}
                  >
                    {displayName}
                  </p>
                  <span
                    className="rounded-full px-2.5 py-1 text-xs font-medium"
                    style={{
                      background: subBadge.bg,
                      color: subBadge.text,
                      fontFamily: 'DM Sans, system-ui, sans-serif',
                    }}
                  >
                    {subBadge.label}
                  </span>
                </div>
                <p
                  className="text-sm"
                  style={{
                    color: '#6B7280',
                    fontFamily: 'DM Sans, system-ui, sans-serif',
                  }}
                >
                  Class {profile.grade ?? '—'} · {profile.board ?? '—'}
                  {profile.school_name ? ` · ${profile.school_name}` : ''}
                </p>
                {profile.favourite_subject ? (
                  <span
                    className="mt-2 inline-block rounded-full px-3 py-1 text-xs font-medium"
                    style={{
                      background: 'rgba(13,27,42,0.06)',
                      color: NAVY,
                      fontFamily: 'DM Sans, system-ui, sans-serif',
                    }}
                  >
                    {profile.favourite_subject}
                  </span>
                ) : null}
              </div>
            </div>
          </section>

          <section
            className="min-w-0 flex-1"
            aria-labelledby="quick-actions-heading"
          >
            <SectionTitle>
              <span id="quick-actions-heading">Quick actions</span>
            </SectionTitle>
            <div
              className="flex flex-col gap-3 rounded-xl border border-solid p-5"
              style={{
                background: CARD_BG,
                borderColor: BORDER,
                borderRadius: 12,
                padding: 20,
              }}
            >
              <Link
                href="/learn"
                className="flex min-h-[44px] items-center justify-center rounded-xl px-4 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-[#0BB5AD] focus-visible:ring-offset-2"
                style={{
                  background: TEAL,
                  color: '#FFFFFF',
                  fontFamily: 'DM Sans, system-ui, sans-serif',
                }}
                aria-label="Open Learn to ask Sophia"
              >
                Ask Sophia
              </Link>
              <Link
                href="/profile"
                className="flex min-h-[44px] items-center justify-center rounded-xl border border-solid px-4 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-[#0BB5AD] focus-visible:ring-offset-2"
                style={{
                  borderColor: BORDER,
                  color: NAVY,
                  fontFamily: 'DM Sans, system-ui, sans-serif',
                }}
                aria-label="Edit your profile"
              >
                Edit profile
              </Link>
              <button
                type="button"
                onClick={scrollToRecent}
                className="flex min-h-[44px] items-center justify-center rounded-xl px-4 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-[#0BB5AD] focus-visible:ring-offset-2"
                style={{
                  color: '#6B7280',
                  fontFamily: 'DM Sans, system-ui, sans-serif',
                  background: 'transparent',
                }}
                aria-label="Scroll to recent sessions"
              >
                View sessions
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
