import { redirect } from 'next/navigation'

import { createServerSupabaseClient } from '@/lib/supabase/server'

import OnboardingClient from './onboarding-client'

export default async function OnboardingPage() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('student_profiles')
    .select('onboarding_complete, board, grade, name')
    .eq('user_id', user.id)
    .maybeSingle()

  if (
    profile?.onboarding_complete === true &&
    Boolean(profile.board?.trim()) &&
    Boolean(profile.grade?.trim())
  ) {
    redirect('/learn')
  }

  return (
    <OnboardingClient
      userId={user.id}
      userEmail={user.email || ''}
      initialName={profile?.name?.trim() || ''}
    />
  )
}
