import { redirect } from 'next/navigation'

import OnboardingClient from './onboarding-client'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export default async function OnboardingPage() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('student_profiles')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()

  if (profile?.onboarding_complete) redirect('/learn')

  return (
    <OnboardingClient
      userId={user.id}
      userEmail={user.email || ''}
      initialName={(profile?.name as string | undefined) || ''}
    />
  )
}
