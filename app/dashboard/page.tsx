import Link from 'next/link'
import { redirect } from 'next/navigation'

import DashboardClient from './dashboard-client'
import ErrorBoundary from '@/components/error-boundary'
import AppShellWrapper from '@/components/layout/app-shell-wrapper'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('student_profiles')
    .select(
      'name, grade, board, school_name, favourite_subject, cover_style, photo_url, onboarding_complete',
    )
    .eq('user_id', user.id)
    .maybeSingle()

  if (!profile) {
    redirect('/onboarding')
  }

  const hasBoardAndGrade = Boolean(profile.board?.trim()) && Boolean(profile.grade?.trim())
  const isOnboardingComplete = profile.onboarding_complete === true

  if (!isOnboardingComplete || !hasBoardAndGrade) {
    return (
      <div
        className="flex min-h-screen items-center justify-center p-6"
        style={{ background: '#F4F4F4' }}
      >
        <div className="max-w-md text-center">
          <h1
            className="mb-2 text-2xl font-medium"
            style={{
              fontFamily: 'Cormorant Garamond, serif',
              color: '#0D1B2A',
            }}
          >
            Complete your profile
          </h1>
          <p
            className="mb-6 text-sm"
            style={{
              color: '#9B9BAD',
              fontFamily: 'DM Sans, sans-serif',
            }}
          >
            Finish onboarding so we can personalize your experience.
          </p>
          <Link
            href="/onboarding"
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl px-6 py-3 text-sm font-medium text-white"
            style={{
              background: '#0D1B2A',
              fontFamily: 'DM Sans, sans-serif',
            }}
            aria-label="Continue to onboarding to complete your profile"
          >
            Continue setup
          </Link>
        </div>
      </div>
    )
  }

  return (
    <AppShellWrapper>
      <ErrorBoundary>
        <DashboardClient
          userId={user.id}
          profile={{
            name: profile.name,
            grade: profile.grade,
            board: profile.board,
            school_name: profile.school_name,
            favourite_subject: profile.favourite_subject,
            cover_style: profile.cover_style,
            photo_url: profile.photo_url,
          }}
        />
      </ErrorBoundary>
    </AppShellWrapper>
  )
}
