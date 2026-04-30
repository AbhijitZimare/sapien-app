import { redirect } from 'next/navigation'

import LearnClient from './learn-client'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { Board } from '@/lib/sophia/system-prompt'

export default async function LearnPage() {
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

  if (!profile?.onboarding_complete) {
    redirect('/onboarding')
  }

  if (!profile?.board || !profile?.grade) {
    redirect('/profile?setup=true')
  }

  return (
    <LearnClient
      student={{
        name: profile.name || user.email?.split('@')[0] || 'Student',
        board: profile.board as Board,
        grade: profile.grade,
        school: profile.school_name || undefined,
      }}
      userId={user.id}
    />
  )
}
