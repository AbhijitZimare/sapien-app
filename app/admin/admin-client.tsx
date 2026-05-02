'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  DollarSign,
  MessageSquare,
  ThumbsDown,
  ThumbsUp,
  Zap,
} from 'lucide-react'

import type {
  AdminDailyActivity,
  AdminMatrixRow,
  AdminStatsResponse,
} from '@/lib/types/admin-stats'

const NAVY = '#0D1B2A'
const TEAL = '#0BB5AD'
const AMBER = '#F0A500'
const BORDER = '#E8E4DC'
const PAGE_BG = '#F4F4F4'
const CARD_BG = '#FFFFFF'

function formatPct(n: number | null, digits = 1): string {
  if (n == null || Number.isNaN(n)) return '—'
  return `${n.toFixed(digits)}%`
}

function formatUsd(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(n)
}

function cacheHitColor(rate: number | null): string {
  if (rate == null) return '#6B7280'
  if (rate > 50) return '#16A34A'
  if (rate >= 20) return AMBER
  return '#DC2626'
}

function thumbsColor(rate: number | null): string {
  if (rate == null) return '#6B7280'
  if (rate > 70) return '#16A34A'
  if (rate >= 50) return AMBER
  return '#DC2626'
}

function shortPromptKey(key: string): string {
  if (key.length <= 11) return key
  return `${key.slice(0, 8)}…`
}

function weekdayLabel(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00Z`)
  return d.toLocaleDateString('en-US', { weekday: 'short' })
}

function matrixRowTint(
  row: AdminMatrixRow,
  expensiveKeys: Set<string>,
  cheapKeys: Set<string>,
): string {
  if (expensiveKeys.has(row.prompt_key)) return '#FEF2F2'
  if (cheapKeys.has(row.prompt_key)) return '#F0FDF4'
  return CARD_BG
}

function buildQuartileKeys(rows: AdminMatrixRow[]): {
  expensive: Set<string>
  cheap: Set<string>
} {
  const ranked = rows
    .filter((r) => r.cost_per_useful != null && r.cost_per_useful > 0)
    .sort((a, b) => (b.cost_per_useful ?? 0) - (a.cost_per_useful ?? 0))
  if (ranked.length === 0) {
    return { expensive: new Set(), cheap: new Set() }
  }
  const q = Math.max(1, Math.ceil(ranked.length * 0.25))
  const expensive = new Set(ranked.slice(0, q).map((r) => r.prompt_key))
  const ascending = [...ranked].sort(
    (a, b) => (a.cost_per_useful ?? 0) - (b.cost_per_useful ?? 0),
  )
  const cheap = new Set(ascending.slice(0, q).map((r) => r.prompt_key))
  return { expensive, cheap }
}

export default function AdminClient() {
  const [data, setData] = useState<AdminStatsResponse | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await fetch('/api/admin/stats', { credentials: 'same-origin' })
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string }
        setLoadError(j.error ?? `HTTP ${res.status}`)
        setData(null)
        return
      }
      const body = (await res.json()) as AdminStatsResponse
      setData(body)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e))
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const { expensive, cheap } = useMemo(
    () => buildQuartileKeys(data?.matrixRows ?? []),
    [data?.matrixRows],
  )

  const maxBar = useMemo(() => {
    const days = data?.dailyActivity ?? []
    let m = 1
    for (const d of days) {
      m = Math.max(m, d.messages, d.cacheHits)
    }
    return m
  }, [data?.dailyActivity])

  return (
    <div
      className="min-h-full w-full overflow-x-hidden px-4 py-6 md:px-8"
      style={{ background: PAGE_BG }}
      id="main-content"
    >
      <div className="mx-auto max-w-6xl space-y-8">
        <header>
          <h1
            className="text-[28px] font-light"
            style={{
              fontFamily: 'Cormorant Garamond, Georgia, serif',
              color: NAVY,
            }}
          >
            Cost-Quality Matrix
          </h1>
          <p
            className="mt-1 text-xs"
            style={{ color: '#9CA3AF', fontFamily: 'DM Sans, system-ui, sans-serif' }}
          >
            Internal — not for sharing
          </p>
        </header>

        {loadError ? (
          <p
            className="rounded-xl border p-4 text-sm"
            role="alert"
            style={{
              borderColor: BORDER,
              background: CARD_BG,
              color: '#DC2626',
              fontFamily: 'DM Sans, system-ui, sans-serif',
            }}
          >
            {loadError}
          </p>
        ) : null}

        {loading ? (
          <div className="space-y-6" aria-busy="true" aria-label="Loading admin statistics">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="h-28 animate-pulse rounded-xl bg-zinc-200"
                  style={{ borderRadius: 12 }}
                />
              ))}
            </div>
            <div className="h-64 animate-pulse rounded-xl bg-zinc-200" />
            <div className="h-40 animate-pulse rounded-xl bg-zinc-200" />
          </div>
        ) : data ? (
          <>
            <section aria-labelledby="admin-overview-heading">
              <h2 id="admin-overview-heading" className="sr-only">
                Overview statistics
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                  label="Messages This Week"
                  value={String(data.overview.weeklyMessages)}
                  icon={<MessageSquare className="h-6 w-6" style={{ color: TEAL }} aria-hidden />}
                />
                <StatCard
                  label="Cache Hit Rate"
                  value={formatPct(data.overview.cacheHitRate)}
                  valueColor={cacheHitColor(data.overview.cacheHitRate)}
                  icon={<Zap className="h-6 w-6" style={{ color: TEAL }} aria-hidden />}
                />
                <StatCard
                  label="Thumbs Up Rate"
                  value={formatPct(data.overview.thumbsUpRate, 0)}
                  valueColor={thumbsColor(data.overview.thumbsUpRate)}
                  icon={<ThumbsUp className="h-6 w-6" style={{ color: TEAL }} aria-hidden />}
                />
                <StatCard
                  label="Est. Weekly Cost"
                  value={formatUsd(data.overview.weeklyCost)}
                  icon={<DollarSign className="h-6 w-6" style={{ color: TEAL }} aria-hidden />}
                />
              </div>
            </section>

            <section aria-labelledby="admin-matrix-heading">
              <h2
                id="admin-matrix-heading"
                className="mb-1 text-[13px] font-medium uppercase tracking-[0.08em]"
                style={{ color: '#9CA3AF', fontFamily: 'DM Sans, system-ui, sans-serif' }}
              >
                Prompt performance
              </h2>
              <p
                className="mb-3 text-xs"
                style={{ color: '#6B7280', fontFamily: 'DM Sans, system-ui, sans-serif' }}
              >
                Sorted by cost per useful response — highest first
              </p>
              <div
                className="overflow-x-auto rounded-xl border"
                style={{ borderColor: BORDER, background: CARD_BG }}
              >
                {data.matrixRows.length === 0 ? (
                  <p
                    className="p-8 text-center text-sm"
                    style={{
                      color: '#6B7280',
                      fontFamily: 'DM Sans, system-ui, sans-serif',
                    }}
                  >
                    No data yet. Send messages to Sophia and rate responses to populate this
                    matrix.
                  </p>
                ) : (
                  <table className="min-w-[900px] w-full border-collapse text-left">
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                        {[
                          'Prompt key',
                          'Messages',
                          'Avg input',
                          'Avg output',
                          'Thumbs up',
                          'Thumbs down',
                          'Thumbs up rate',
                          'Cost / useful',
                          'Action',
                        ].map((h) => (
                          <th
                            key={h}
                            scope="col"
                            className="px-3 py-3 align-bottom font-medium uppercase"
                            style={{
                              fontFamily: 'DM Sans, system-ui, sans-serif',
                              fontSize: 11,
                              color: '#9CA3AF',
                            }}
                          >
                            {h === 'Thumbs up' ? (
                              <span className="inline-flex items-center gap-1">
                                <ThumbsUp className="h-3.5 w-3.5" aria-hidden />
                                <span className="sr-only">Thumbs up</span>
                              </span>
                            ) : h === 'Thumbs down' ? (
                              <span className="inline-flex items-center gap-1">
                                <ThumbsDown className="h-3.5 w-3.5" aria-hidden />
                                <span className="sr-only">Thumbs down</span>
                              </span>
                            ) : (
                              h
                            )}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.matrixRows.map((row) => (
                        <tr
                          key={row.prompt_key}
                          className="transition-colors hover:bg-[#F9F8F6]"
                          style={{
                            background: matrixRowTint(row, expensive, cheap),
                            fontFamily: 'DM Sans, system-ui, sans-serif',
                            fontSize: 13,
                            color: NAVY,
                            borderBottom: `1px solid ${BORDER}`,
                          }}
                        >
                          <td className="px-3 py-2 font-mono text-xs">
                            {shortPromptKey(row.prompt_key)}
                          </td>
                          <td className="px-3 py-2">{row.message_count}</td>
                          <td className="px-3 py-2">
                            {row.avg_input != null ? row.avg_input.toFixed(1) : '—'}
                          </td>
                          <td className="px-3 py-2">
                            {row.avg_output != null ? row.avg_output.toFixed(1) : '—'}
                          </td>
                          <td className="px-3 py-2">{row.thumbs_up}</td>
                          <td className="px-3 py-2">{row.thumbs_down}</td>
                          <td className="px-3 py-2">
                            {row.thumbs_up_rate != null
                              ? `${row.thumbs_up_rate.toFixed(1)}%`
                              : '—'}
                          </td>
                          <td className="px-3 py-2">
                            {row.cost_per_useful != null
                              ? formatUsd(row.cost_per_useful)
                              : '—'}
                          </td>
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              className="min-h-[44px] min-w-[44px] rounded-md px-3 text-sm font-medium underline-offset-2 hover:underline"
                              style={{ color: TEAL, fontFamily: 'DM Sans, system-ui, sans-serif' }}
                              aria-label="View full prompt key"
                              onClick={() => {
                                window.alert(row.prompt_key)
                              }}
                            >
                              View
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </section>

            <section aria-labelledby="admin-daily-heading">
              <h2
                id="admin-daily-heading"
                className="mb-3 text-[13px] font-medium uppercase tracking-[0.08em]"
                style={{ color: '#9CA3AF', fontFamily: 'DM Sans, system-ui, sans-serif' }}
              >
                Daily activity
              </h2>
              <div
                className="rounded-xl border p-4 md:p-6"
                style={{ borderColor: BORDER, background: CARD_BG }}
              >
                {data.dailyActivity.length === 0 ? (
                  <p
                    className="text-center text-sm"
                    style={{
                      color: '#6B7280',
                      fontFamily: 'DM Sans, system-ui, sans-serif',
                    }}
                  >
                    No activity in the last seven days.
                  </p>
                ) : (
                  <>
                    <div
                      className="flex flex-wrap items-end justify-between gap-4"
                      style={{ minHeight: 120 }}
                    >
                      {data.dailyActivity.map((d) => (
                        <div
                          key={d.date}
                          className="flex flex-1 flex-col items-center gap-1"
                          style={{ minWidth: 56 }}
                        >
                          <div className="flex h-[100px] items-end justify-center gap-1">
                            <Bar
                              value={d.messages}
                              max={maxBar}
                              color={TEAL}
                              label="Total messages"
                            />
                            <Bar
                              value={d.cacheHits}
                              max={maxBar}
                              color={AMBER}
                              label="Cache hits"
                            />
                          </div>
                          <span
                            className="text-center text-[11px]"
                            style={{
                              color: '#6B7280',
                              fontFamily: 'DM Sans, system-ui, sans-serif',
                            }}
                          >
                            {weekdayLabel(d.date)}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div
                      className="mt-4 flex flex-wrap gap-6 border-t pt-4"
                      style={{ borderColor: BORDER }}
                    >
                      <span className="inline-flex items-center gap-2 text-xs" style={{ color: NAVY, fontFamily: 'DM Sans, system-ui, sans-serif' }}>
                        <span className="h-2 w-2 rounded-full" style={{ background: TEAL }} aria-hidden />
                        Total messages
                      </span>
                      <span className="inline-flex items-center gap-2 text-xs" style={{ color: NAVY, fontFamily: 'DM Sans, system-ui, sans-serif' }}>
                        <span className="h-2 w-2 rounded-full" style={{ background: AMBER }} aria-hidden />
                        Cache hits
                      </span>
                    </div>
                  </>
                )}
              </div>
            </section>
          </>
        ) : null}
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  valueColor,
  icon,
}: {
  label: string
  value: string
  valueColor?: string
  icon: ReactNode
}) {
  return (
    <div
      className="rounded-xl border border-solid p-5"
      style={{
        background: CARD_BG,
        borderColor: BORDER,
        borderRadius: 12,
        padding: 20,
      }}
    >
      <div className="mb-2">{icon}</div>
      <p
        className="text-[28px] font-bold"
        style={{
          color: valueColor ?? NAVY,
          fontFamily: 'DM Sans, system-ui, sans-serif',
        }}
      >
        {value}
      </p>
      <p
        className="text-xs"
        style={{ color: '#6B7280', fontFamily: 'DM Sans, system-ui, sans-serif' }}
      >
        {label}
      </p>
    </div>
  )
}

function Bar({
  value,
  max,
  color,
  label,
}: {
  value: number
  max: number
  color: string
  label: string
}) {
  const pixelHeight = max > 0 ? Math.max(4, Math.round((value / max) * 100)) : 4
  return (
    <div
      className="w-4 rounded-t"
      style={{
        height: pixelHeight,
        minHeight: 4,
        background: color,
        maxHeight: 100,
      }}
      role="img"
      aria-label={`${label}: ${value}`}
    />
  )
}
