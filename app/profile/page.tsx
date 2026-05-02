import { redirect } from 'next/navigation'

import ErrorBoundary from '@/components/error-boundary'
import AppShellWrapper from '@/components/layout/app-shell-wrapper'
import { createServerSupabaseClient } from '@/lib/supabase/server'

import ProfileClient from './profile-client'

export default async function ProfilePage() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('student_profiles')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (!profile?.onboarding_complete) redirect('/onboarding')

  const { data: stats } = await supabase
    .from('user_stats')
    .select('*')
    .eq('user_id', user.id)
    .single()

  return (
    <AppShellWrapper>
      <ErrorBoundary>
        <ProfileClient
          profile={profile}
          stats={stats}
          userId={user.id}
          userEmail={user.email || ''}
          isSetup={false}
        />
      </ErrorBoundary>
    </AppShellWrapper>
  )
}
