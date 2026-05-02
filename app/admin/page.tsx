import { redirect } from 'next/navigation'

import AdminClient from './admin-client'
import AppShellWrapper from '@/components/layout/app-shell-wrapper'
import { createServerSupabaseClient } from '@/lib/supabase/server'

function adminEmailAllowlist(): string {
  return (
    process.env.ADMIN_EMAIL?.trim().toLowerCase() ??
    process.env.NEXT_PUBLIC_ADMIN_EMAIL?.trim().toLowerCase() ??
    ''
  )
}

function isAdminEmail(email: string | undefined): boolean {
  const allowed = adminEmailAllowlist()
  if (!allowed) return false
  return (email ?? '').trim().toLowerCase() === allowed
}

export default async function AdminPage() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  if (!isAdminEmail(user.email ?? undefined)) {
    return <div>Access denied</div>
  }

  return (
    <AppShellWrapper>
      <AdminClient />
    </AppShellWrapper>
  )
}
