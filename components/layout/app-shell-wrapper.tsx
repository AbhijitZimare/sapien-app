import { redirect } from 'next/navigation'
import { z } from 'zod'

import { createServerSupabaseClient } from '@/lib/supabase/server'

import AppShell from './app-shell'

const profileRowSchema = z.object({
  name: z.string().nullable().optional(),
  board: z.string().nullable().optional(),
  grade: z.string().nullable().optional(),
  photo_url: z.union([z.string().url(), z.literal(''), z.null()]).optional(),
})

const chatRowSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  updated_at: z.string(),
})

function safeChatName(raw: string): string {
  return raw.replace(/<[^>]*>/g, '').trim().slice(0, 500)
}

function parseRecentChats(data: unknown): {
  chats: { id: string; name: string; updatedAt: string }[]
} {
  if (!Array.isArray(data)) return { chats: [] }
  const chats: { id: string; name: string; updatedAt: string }[] = []
  for (const row of data) {
    const r = chatRowSchema.safeParse(row)
    if (!r.success) continue
    chats.push({
      id: r.data.id,
      name: safeChatName(r.data.name),
      updatedAt: r.data.updated_at,
    })
  }
  return { chats }
}

interface AppShellWrapperProps {
  children: React.ReactNode
}

export default async function AppShellWrapper({ children }: AppShellWrapperProps) {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError) {
    console.error('AppShellWrapper: auth', authError.message)
    redirect('/login')
  }
  if (!user) redirect('/login')

  const { data: profileRaw, error: profileError } = await supabase
    .from('student_profiles')
    .select('name, board, grade, photo_url')
    .eq('user_id', user.id)
    .maybeSingle()

  if (profileError) {
    console.error('AppShellWrapper: profile', profileError.message)
  }

  let studentName = 'Student'
  let studentBoard = ''
  let studentGrade = ''
  let photoUrl: string | null = null

  if (profileRaw) {
    const profileParsed = profileRowSchema.safeParse(profileRaw)
    if (profileParsed.success) {
      const p = profileParsed.data
      studentName = p.name?.trim() || 'Student'
      studentBoard = p.board?.trim() || ''
      studentGrade = p.grade?.trim() || ''
      photoUrl =
        p.photo_url && p.photo_url !== '' ? p.photo_url : null
    } else {
      console.error(
        'AppShellWrapper: profile validation',
        profileParsed.error.flatten(),
      )
    }
  }

  const { data: chatsRaw, error: chatsError } = await supabase
    .from('chat_sessions')
    .select('id, name, updated_at')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(5)

  if (chatsError) {
    console.error('AppShellWrapper: recent chats', chatsError.message)
  }

  const recent = parseRecentChats(chatsRaw)

  return (
    <AppShell
      studentName={studentName}
      studentBoard={studentBoard}
      studentGrade={studentGrade}
      photoUrl={photoUrl}
      recentChats={recent.chats}
    >
      {children}
    </AppShell>
  )
}
