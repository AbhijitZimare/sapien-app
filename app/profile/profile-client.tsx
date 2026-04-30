'use client'

// Icons: lucide-react ONLY — no emoji, no other icon libraries

import type { ReactNode } from 'react'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowRight,
  BarChart2,
  BookOpen,
  Check,
  ChevronRight,
  Clock,
  LogOut,
  MapPin,
  MessageCircle,
  Sparkles,
  Star,
  Target,
  User,
} from 'lucide-react'

import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const BOARDS = ['IB', 'CBSE', 'ICSE', 'SSC'] as const
const GRADES = ['6', '7', '8', '9', '10', '11', '12'] as const
const COVER_STYLES = [
  { id: 'navy', bg: '#0D1B2A' },
  {
    id: 'teal',
    bg: 'linear-gradient(135deg, #0BB5AD, #0D6B67)',
  },
  {
    id: 'amber',
    bg: 'linear-gradient(135deg, #F0A500, #C17D00)',
  },
  {
    id: 'purple',
    bg: 'linear-gradient(135deg, #6B5EA8, #3D2B7A)',
  },
  {
    id: 'forest',
    bg: 'linear-gradient(135deg, #2D6A4F, #1B4332)',
  },
  {
    id: 'crimson',
    bg: 'linear-gradient(135deg, #C1440E, #7B1D00)',
  },
]

interface Props {
  profile: Record<string, unknown> | null
  stats: Record<string, unknown> | null
  userId: string
  userEmail: string
  isSetup: boolean
}

export default function ProfileClient({
  profile: initialProfile,
  stats,
  userId,
  userEmail,
  isSetup,
}: Props) {
  const router = useRouter()

  const [profile, setProfile] = useState<Record<string, unknown>>(
    () => initialProfile || {},
  )
  const [saving, setSaving] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<
    'profile' | 'progress' | 'sessions'
  >('profile')

  async function saveSection(section: string, data: Record<string, unknown>) {
    const supabase = createClient()
    setSaving(section)
    try {
      const { error } = await supabase
        .from('student_profiles')
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq('user_id', userId)

      if (!error) {
        setProfile((prev) => ({ ...prev, ...data }))
        setSaved(section)
        setTimeout(() => setSaved(null), 2000)

        if (data.board && data.grade) {
          router.push('/learn')
        }
      }
    } finally {
      setSaving(null)
    }
  }

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const coverStyle =
    COVER_STYLES.find((c) => c.id === (profile.cover_style as string)) ||
    COVER_STYLES[0]

  return (
    <div
      id="main-content"
      className="min-h-screen"
      style={{ background: '#F4F4F4', fontFamily: 'DM Sans, sans-serif' }}
    >
      {isSetup && (
        <div
          className="flex items-center justify-between px-6 py-3"
          style={{ background: '#0BB5AD' }}
        >
          <p className="flex items-center gap-2 text-sm font-medium text-white">
            <Sparkles size={18} aria-hidden />
            Welcome! Set your board and class to start learning.
          </p>
          <ChevronRight size={16} color="white" aria-hidden />
        </div>
      )}

      <div
        className="relative"
        style={{
          height: '140px',
          background: coverStyle.bg,
        }}
      />

      <div
        className="relative z-10 mx-4 -mt-6 mb-4 rounded-2xl p-6"
        style={{ background: 'white', border: '1px solid #E8E4DC' }}
      >
        <div className="mb-4 flex items-start justify-between">
          <div
            className="-mt-10 flex h-16 w-16 items-center justify-center rounded-full border-4 border-white text-2xl font-medium text-white"
            style={{
              background: '#0BB5AD',
              fontFamily: 'Cormorant Garamond, serif',
              boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
            }}
          >
            {String((profile.name as string | undefined) || userEmail)?.[0]?.toUpperCase() || 'S'}
          </div>
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="flex items-center gap-1.5 text-xs"
            style={{ color: '#9B9BAD' }}
          >
            <LogOut size={13} aria-hidden />
            Sign out
          </button>
        </div>

        <h1
          className="mb-1 text-2xl font-medium"
          style={{
            fontFamily: 'Cormorant Garamond, serif',
            color: '#0D1B2A',
          }}
        >
          {(profile.name as string) || 'Student'}
        </h1>
        <p className="mb-3 text-sm" style={{ color: '#9B9BAD' }}>
          {(profile.school_name as string | undefined) || 'School not set'} ·{' '}
          {userEmail}
        </p>

        <div className="mb-4 flex flex-wrap gap-2">
          {(profile.board != null && String(profile.board).length > 0) ? (
            <span
              className="rounded-full px-3 py-1 text-xs font-semibold text-white"
              style={{ background: '#0D1B2A' }}
            >
              {String(profile.board)}
            </span>
          ) : null}
          {(profile.grade != null && String(profile.grade).length > 0) ? (
            <span
              className="rounded-full px-3 py-1 text-xs font-semibold text-white"
              style={{ background: '#0D1B2A' }}
            >
              Class {String(profile.grade)}
            </span>
          ) : null}
        </div>

        <div
          className="grid grid-cols-4 gap-0 overflow-hidden rounded-xl"
          style={{ border: '1px solid #E8E4DC' }}
        >
          {[
            {
              icon: <Star size={14} aria-hidden />,
              value: (stats?.current_streak as number) ?? 0,
              label: 'Streak',
            },
            {
              icon: <MessageCircle size={14} aria-hidden />,
              value: (stats?.total_sessions as number) ?? 0,
              label: 'Sessions',
            },
            {
              icon: <Check size={14} aria-hidden />,
              value: (stats?.doubts_cleared as number) ?? 0,
              label: 'Doubts',
            },
            {
              icon: <BookOpen size={14} aria-hidden />,
              value: (stats?.topics_explored as number) ?? 0,
              label: 'Topics',
            },
          ].map((stat, i) => (
            <div
              key={stat.label}
              className="flex flex-col items-center py-3"
              style={{
                borderRight: i < 3 ? '1px solid #E8E4DC' : 'none',
              }}
            >
              <span style={{ color: '#0BB5AD' }}>{stat.icon}</span>
              <span
                className="mt-1 text-xl font-medium"
                style={{
                  fontFamily: 'Cormorant Garamond, serif',
                  color: '#0D1B2A',
                }}
              >
                {stat.value}
              </span>
              <span className="text-xs" style={{ color: '#9B9BAD' }}>
                {stat.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div
        className="mx-4 mb-4 flex overflow-hidden rounded-xl"
        style={{ border: '1px solid #E8E4DC', background: 'white' }}
      >
        {(['profile', 'progress', 'sessions'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className="flex-1 py-3 text-sm font-medium capitalize transition-all"
            style={{
              background: activeTab === tab ? '#0D1B2A' : 'white',
              color: activeTab === tab ? 'white' : '#9B9BAD',
              fontFamily: 'DM Sans, sans-serif',
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="mx-4 space-y-4 pb-8">
        {activeTab === 'profile' && (
          <>
            <ProfileCard
              title="Academic"
              icon={<BookOpen size={16} aria-hidden />}
              highlight={isSetup}
            >
              <div className="space-y-4">
                <div>
                  <label
                    className="mb-2 block text-xs font-medium"
                    style={{ color: '#0D1B2A' }}
                  >
                    Board
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {BOARDS.map((b) => (
                      <button
                        key={b}
                        type="button"
                        onClick={() =>
                          setProfile((p) => ({ ...p, board: b }))
                        }
                        className="rounded-lg px-4 py-2 text-sm font-medium transition-all"
                        style={{
                          background: profile.board === b ? '#0D1B2A' : 'white',
                          color:
                            profile.board === b ? 'white' : '#0D1B2A',
                          border: `1px solid ${profile.board === b ? '#0D1B2A' : '#E8E4DC'}`,
                        }}
                      >
                        {b}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label
                    className="mb-2 block text-xs font-medium"
                    style={{ color: '#0D1B2A' }}
                  >
                    Class
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {GRADES.map((g) => (
                      <button
                        key={g}
                        type="button"
                        onClick={() =>
                          setProfile((p) => ({ ...p, grade: g }))
                        }
                        className="h-10 w-10 rounded-lg text-sm font-medium transition-all"
                        style={{
                          background: profile.grade === g ? '#0D1B2A' : 'white',
                          color:
                            profile.grade === g ? 'white' : '#0D1B2A',
                          border: `1px solid ${profile.grade === g ? '#0D1B2A' : '#E8E4DC'}`,
                        }}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label
                      className="mb-1.5 block text-xs font-medium"
                      style={{ color: '#0D1B2A' }}
                    >
                      School name
                    </label>
                    <Input
                      value={(profile.school_name as string) || ''}
                      onChange={(e) =>
                        setProfile((p) => ({
                          ...p,
                          school_name: e.target.value,
                        }))
                      }
                      placeholder="Your school"
                    />
                  </div>
                  <div>
                    <label
                      className="mb-1.5 block text-xs font-medium"
                      style={{ color: '#0D1B2A' }}
                    >
                      House name
                    </label>
                    <Input
                      value={(profile.house_name as string) || ''}
                      onChange={(e) =>
                        setProfile((p) => ({
                          ...p,
                          house_name: e.target.value,
                        }))
                      }
                      placeholder="e.g. Yellow House"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label
                      className="mb-1.5 block text-xs font-medium"
                      style={{ color: '#0D1B2A' }}
                    >
                      Target exam year
                    </label>
                    <select
                      value={(profile.target_exam_year as string) || ''}
                      onChange={(e) =>
                        setProfile((p) => ({
                          ...p,
                          target_exam_year: e.target.value,
                        }))
                      }
                      className="h-10 w-full rounded-lg border px-3 text-sm outline-none"
                      style={{
                        border: '1px solid #E8E4DC',
                        color: '#0D1B2A',
                        fontFamily: 'DM Sans, sans-serif',
                      }}
                    >
                      <option value="">Select year</option>
                      {['2025', '2026', '2027', '2028', '2029'].map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label
                      className="mb-1.5 block text-xs font-medium"
                      style={{ color: '#0D1B2A' }}
                    >
                      Favourite subject
                    </label>
                    <Input
                      value={(profile.favourite_subject as string) || ''}
                      onChange={(e) =>
                        setProfile((p) => ({
                          ...p,
                          favourite_subject: e.target.value,
                        }))
                      }
                      placeholder="e.g. Calculus"
                    />
                  </div>
                </div>

                <SaveButton
                  section="academic"
                  saving={saving}
                  saved={saved}
                  onClick={() =>
                    void saveSection('academic', {
                      board: profile.board as string | undefined,
                      grade: profile.grade as string | undefined,
                      school_name: profile.school_name as string | undefined,
                      house_name: profile.house_name as string | undefined,
                      target_exam_year: profile.target_exam_year as
                        | string
                        | undefined,
                      favourite_subject: profile.favourite_subject as
                        | string
                        | undefined,
                      onboarding_complete: true,
                    })
                  }
                />
              </div>
            </ProfileCard>

            <ProfileCard title="Personal" icon={<User size={16} aria-hidden />}>
              <div className="space-y-3">
                <div>
                  <label
                    className="mb-1.5 block text-xs font-medium"
                    style={{ color: '#0D1B2A' }}
                  >
                    Full name
                  </label>
                  <Input
                    value={(profile.name as string) || ''}
                    onChange={(e) =>
                      setProfile((p) => ({
                        ...p,
                        name: e.target.value,
                      }))
                    }
                    placeholder="Your full name"
                  />
                </div>
                <div>
                  <label
                    className="mb-1.5 block text-xs font-medium"
                    style={{ color: '#0D1B2A' }}
                  >
                    Email
                  </label>
                  <Input
                    value={userEmail}
                    disabled
                    style={{ background: '#F9F8F6', color: '#9B9BAD' }}
                  />
                  <p className="mt-1 text-xs" style={{ color: '#9B9BAD' }}>
                    Managed by Google
                  </p>
                </div>
                <div>
                  <label
                    className="mb-1.5 block text-xs font-medium"
                    style={{ color: '#0D1B2A' }}
                  >
                    Learning goal
                  </label>
                  <Input
                    value={(profile.learning_goal as string) || ''}
                    onChange={(e) =>
                      setProfile((p) => ({
                        ...p,
                        learning_goal: e.target.value,
                      }))
                    }
                    placeholder="e.g. Score 7 in IB Math AA HL"
                  />
                </div>
                <SaveButton
                  section="personal"
                  saving={saving}
                  saved={saved}
                  onClick={() =>
                    void saveSection('personal', {
                      name: profile.name as string | undefined,
                      learning_goal: profile.learning_goal as
                        | string
                        | undefined,
                    })
                  }
                />
              </div>
            </ProfileCard>

            <ProfileCard title="Location" icon={<MapPin size={16} aria-hidden />}>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label
                      className="mb-1.5 block text-xs font-medium"
                      style={{ color: '#0D1B2A' }}
                    >
                      City{' '}
                      <span style={{ color: '#DC3545' }} aria-hidden>
                        *
                      </span>
                    </label>
                    <Input
                      value={(profile.city as string) || ''}
                      onChange={(e) =>
                        setProfile((p) => ({
                          ...p,
                          city: e.target.value,
                        }))
                      }
                      placeholder="Mumbai"
                      required
                    />
                  </div>
                  <div>
                    <label
                      className="mb-1.5 block text-xs font-medium"
                      style={{ color: '#0D1B2A' }}
                    >
                      PIN Code{' '}
                      <span style={{ color: '#DC3545' }} aria-hidden>
                        *
                      </span>
                    </label>
                    <Input
                      value={(profile.pin_code as string) || ''}
                      onChange={(e) =>
                        setProfile((p) => ({
                          ...p,
                          pin_code: e.target.value,
                        }))
                      }
                      placeholder="400001"
                      maxLength={6}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label
                      className="mb-1.5 block text-xs font-medium"
                      style={{ color: '#0D1B2A' }}
                    >
                      State
                    </label>
                    <Input
                      value={(profile.state as string) || ''}
                      onChange={(e) =>
                        setProfile((p) => ({
                          ...p,
                          state: e.target.value,
                        }))
                      }
                      placeholder="Maharashtra"
                    />
                  </div>
                  <div>
                    <label
                      className="mb-1.5 block text-xs font-medium"
                      style={{ color: '#0D1B2A' }}
                    >
                      Country
                    </label>
                    <Input
                      value={(profile.country as string) || 'India'}
                      onChange={(e) =>
                        setProfile((p) => ({
                          ...p,
                          country: e.target.value,
                        }))
                      }
                      placeholder="India"
                    />
                  </div>
                </div>
                <SaveButton
                  section="location"
                  saving={saving}
                  saved={saved}
                  onClick={() =>
                    void saveSection('location', {
                      city: profile.city as string | undefined,
                      pin_code: profile.pin_code as string | undefined,
                      state: profile.state as string | undefined,
                      country: (profile.country as string) || 'India',
                    })
                  }
                />
              </div>
            </ProfileCard>

            <ProfileCard
              title="Appearance"
              icon={<Target size={16} aria-hidden />}
            >
              <div>
                <label
                  className="mb-3 block text-xs font-medium"
                  style={{ color: '#0D1B2A' }}
                >
                  Cover style
                </label>
                <div className="grid grid-cols-6 gap-2">
                  {COVER_STYLES.map((style) => (
                    <button
                      key={style.id}
                      type="button"
                      onClick={() =>
                        void saveSection('appearance', {
                          cover_style: style.id,
                        })
                      }
                      className="h-10 rounded-lg transition-all"
                      style={{
                        background: style.bg,
                        outline:
                          profile.cover_style === style.id
                            ? '2px solid #0BB5AD'
                            : '2px solid transparent',
                        outlineOffset: '2px',
                      }}
                      aria-label={`Cover style ${style.id}`}
                    />
                  ))}
                </div>
              </div>
            </ProfileCard>
          </>
        )}

        {activeTab === 'progress' && (
          <div
            className="rounded-2xl p-12 text-center"
            style={{ background: 'white', border: '1px solid #E8E4DC' }}
          >
            <BarChart2
              size={48}
              className="mx-auto mb-4"
              style={{ color: '#0BB5AD' }}
              aria-hidden
            />
            <h3
              className="mb-2 text-2xl font-medium"
              style={{
                fontFamily: 'Cormorant Garamond, serif',
                color: '#0D1B2A',
              }}
            >
              Start learning to see progress
            </h3>
            <p className="mb-6 text-sm" style={{ color: '#9B9BAD' }}>
              Your mastery levels will appear here after your first session.
            </p>
            <Button
              type="button"
              onClick={() => router.push('/learn')}
              className="inline-flex items-center gap-1.5"
              style={{ background: '#0BB5AD' }}
            >
              Start learning
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        )}

        {activeTab === 'sessions' && (
          <div
            className="rounded-2xl p-12 text-center"
            style={{ background: 'white', border: '1px solid #E8E4DC' }}
          >
            <Clock
              size={48}
              className="mx-auto mb-4"
              style={{ color: '#0BB5AD' }}
              aria-hidden
            />
            <h3
              className="mb-2 text-2xl font-medium"
              style={{
                fontFamily: 'Cormorant Garamond, serif',
                color: '#0D1B2A',
              }}
            >
              No sessions yet
            </h3>
            <p className="mb-6 text-sm" style={{ color: '#9B9BAD' }}>
              Your session history will appear here.
            </p>
            <Button
              type="button"
              onClick={() => router.push('/learn')}
              className="inline-flex items-center gap-1.5"
              style={{ background: '#0BB5AD' }}
            >
              Start your first session
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

function ProfileCard({
  title,
  icon,
  children,
  highlight = false,
}: {
  title: string
  icon: ReactNode
  children: ReactNode
  highlight?: boolean
}) {
  return (
    <div
      className="rounded-2xl p-5"
      style={{
        background: 'white',
        border: `1px solid ${highlight ? '#0BB5AD' : '#E8E4DC'}`,
        boxShadow: highlight ? '0 0 0 2px rgba(11,181,173,0.15)' : 'none',
      }}
    >
      <div className="mb-4 flex items-center gap-2">
        <span style={{ color: '#0BB5AD' }}>{icon}</span>
        <h3
          className="text-lg font-medium"
          style={{
            fontFamily: 'Cormorant Garamond, serif',
            color: '#0D1B2A',
          }}
        >
          {title}
        </h3>
      </div>
      {children}
    </div>
  )
}

function SaveButton({
  section,
  saving,
  saved,
  onClick,
}: {
  section: string
  saving: string | null
  saved: string | null
  onClick: () => void
}) {
  const isSaving = saving === section
  const isSaved = saved === section

  return (
    <div className="flex justify-end pt-2">
      <Button
        type="button"
        onClick={onClick}
        disabled={isSaving}
        className="h-9 px-5 text-sm"
        style={{
          background: isSaved ? '#0BB5AD' : '#0D1B2A',
          fontFamily: 'DM Sans, sans-serif',
          transition: 'background 200ms ease',
        }}
      >
        {isSaving ? (
          'Saving...'
        ) : isSaved ? (
          <span className="inline-flex items-center gap-1.5">
            <Check size={14} aria-hidden /> Saved
          </span>
        ) : (
          'Save changes'
        )}
      </Button>
    </div>
  )
}
