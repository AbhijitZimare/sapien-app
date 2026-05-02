'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { z } from 'zod'
import {
  BarChart2,
  ChevronRight,
  LogOut,
  Menu,
  MessageCircle,
  Plus,
  User,
  X,
} from 'lucide-react'

import { createClient } from '@/lib/supabase/client'

const recentChatInputSchema = z.object({
  id: z.string().min(1),
  name: z.string().max(500),
  updatedAt: z.string().max(64),
})

const appShellPropsSchema = z.object({
  studentName: z.string().max(200),
  studentBoard: z.string().max(100),
  studentGrade: z.string().max(100),
  photoUrl: z.union([z.string().url(), z.null()]).optional(),
  recentChats: z.array(recentChatInputSchema).max(50).optional(),
})

interface NavItem {
  href: string
  label: string
  icon: ReactNode
  ariaLabel: string
}

export interface AppShellProps {
  children: ReactNode
  studentName: string
  studentBoard: string
  studentGrade: string
  photoUrl?: string | null
  recentChats?: {
    id: string
    name: string
    updatedAt: string
  }[]
}

const NAV_ITEMS: NavItem[] = [
  {
    href: '/learn',
    label: 'Learn',
    icon: <MessageCircle size={18} aria-hidden />,
    ariaLabel: 'Go to learn page',
  },
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: <BarChart2 size={18} aria-hidden />,
    ariaLabel: 'Go to dashboard',
  },
  {
    href: '/profile',
    label: 'Profile',
    icon: <User size={18} aria-hidden />,
    ariaLabel: 'Go to profile',
  },
]

/** Strip HTML tags and limit length for safe text display (React text nodes). */
function safeChatTitle(name: string): string {
  return name.replace(/<[^>]*>/g, '').trim().slice(0, 120)
}

function isValidImageUrl(url: string | null | undefined): url is string {
  if (!url || url.trim() === '') return false
  try {
    const u = new URL(url)
    return u.protocol === 'https:' || u.protocol === 'http:'
  } catch {
    return false
  }
}

export default function AppShell({
  children,
  studentName,
  studentBoard,
  studentGrade,
  photoUrl,
  recentChats = [],
}: AppShellProps) {
  const pathname = usePathname()
  const supabase = createClient()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  const safe = useMemo(() => {
    const parsed = appShellPropsSchema.safeParse({
      studentName,
      studentBoard,
      studentGrade,
      photoUrl: photoUrl ?? null,
      recentChats,
    })
    if (!parsed.success) {
      console.error('AppShell: invalid props', parsed.error.flatten())
      return {
        studentName: 'Student',
        studentBoard: '',
        studentGrade: '',
        photoUrl: null as string | null,
        recentChats: [] as { id: string; name: string; updatedAt: string }[],
      }
    }
    return {
      ...parsed.data,
      photoUrl: parsed.data.photoUrl ?? null,
      recentChats: parsed.data.recentChats ?? [],
    }
  }, [studentName, studentBoard, studentGrade, photoUrl, recentChats])

  useEffect(() => {
    const stored = localStorage.getItem('sapien_sidebar_collapsed')
    if (stored === 'true') setSidebarCollapsed(true)
  }, [])

  useEffect(() => {
    if (!sidebarOpen) return
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') setSidebarOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [sidebarOpen])

  function toggleCollapsed(): void {
    const next = !sidebarCollapsed
    setSidebarCollapsed(next)
    localStorage.setItem('sapien_sidebar_collapsed', String(next))
  }

  async function handleSignOut(): Promise<void> {
    const { error } = await supabase.auth.signOut()
    if (error) {
      console.error('AppShell: sign out failed', error.message)
    }
    window.location.href = '/login'
  }

  const initials =
    safe.studentName
      .split(/\s+/)
      .filter(Boolean)
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || 'S'

  const showPhoto = isValidImageUrl(safe.photoUrl)

  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{ background: '#F4F4F4' }}
    >
      <aside
        aria-label="Main navigation"
        className="hidden shrink-0 flex-col transition-all duration-250 lg:flex"
        style={{
          width: sidebarCollapsed ? '64px' : '240px',
          background: '#0D1B2A',
          height: '100vh',
          overflow: 'hidden',
        }}
      >
        <div
          className="flex shrink-0 items-center justify-between px-4 py-4"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}
        >
          {!sidebarCollapsed && (
            <span
              className="text-lg font-light text-white"
              style={{ fontFamily: 'Cormorant Garamond, serif' }}
            >
              Sapien
            </span>
          )}
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="flex shrink-0 items-center justify-center rounded-lg transition-colors"
            style={{
              width: '44px',
              height: '44px',
              marginLeft: sidebarCollapsed ? 'auto' : '0',
              color: 'rgba(255,255,255,0.5)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
            }}
          >
            {sidebarCollapsed ? (
              <ChevronRight size={16} aria-hidden />
            ) : (
              <Menu size={16} aria-hidden />
            )}
          </button>
        </div>

        <div className="shrink-0 px-3 py-3">
          <Link
            href="/learn?new=true"
            aria-label="Start new chat"
            className="flex w-full min-h-[44px] items-center gap-3 rounded-xl px-3 py-2.5 transition-all"
            style={{
              background: 'rgba(11,181,173,0.15)',
              border: '1px solid rgba(11,181,173,0.3)',
              color: '#0BB5AD',
              fontFamily: 'DM Sans, sans-serif',
              fontSize: '13px',
              fontWeight: 500,
              justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
            }}
          >
            <Plus size={16} aria-hidden="true" />
            {!sidebarCollapsed && <span>New chat</span>}
          </Link>
        </div>

        {!sidebarCollapsed && safe.recentChats.length > 0 && (
          <div
            className="shrink-0 px-3 pb-2"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
          >
            <p
              className="mb-1 px-2 py-1 text-xs uppercase tracking-widest"
              style={{
                color: 'rgba(255,255,255,0.3)',
                fontFamily: 'DM Sans, sans-serif',
              }}
            >
              Recent
            </p>
            {safe.recentChats.slice(0, 5).map((chat) => (
              <Link
                key={chat.id}
                href={`/learn?chat=${encodeURIComponent(chat.id)}`}
                className="flex min-h-[44px] items-center gap-2 rounded-lg px-2 py-2 transition-colors"
                style={{
                  color: 'rgba(255,255,255,0.6)',
                  fontFamily: 'DM Sans, sans-serif',
                  fontSize: '12px',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
                  e.currentTarget.style.color = 'white'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.color = 'rgba(255,255,255,0.6)'
                }}
              >
                <MessageCircle
                  size={12}
                  aria-hidden="true"
                  style={{ flexShrink: 0 }}
                />
                <span className="truncate">{safeChatTitle(chat.name)}</span>
              </Link>
            ))}
          </div>
        )}

        <nav
          aria-label="App navigation"
          className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-3"
        >
          {NAV_ITEMS.map((item) => {
            const isActive = pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-label={item.ariaLabel}
                aria-current={isActive ? 'page' : undefined}
                className="flex min-h-[44px] items-center gap-3 rounded-xl px-3 py-2.5 transition-all"
                style={{
                  background: isActive ? 'rgba(11,181,173,0.15)' : 'transparent',
                  color: isActive ? '#0BB5AD' : 'rgba(255,255,255,0.5)',
                  borderLeft: isActive ? '2px solid #0BB5AD' : '2px solid transparent',
                  fontFamily: 'DM Sans, sans-serif',
                  fontSize: '13px',
                  fontWeight: isActive ? 500 : 400,
                  justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
                }}
              >
                <span aria-hidden="true">{item.icon}</span>
                {!sidebarCollapsed && <span>{item.label}</span>}
              </Link>
            )
          })}
        </nav>

        <div
          className="shrink-0 px-3 py-3"
          style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}
        >
          {!sidebarCollapsed && (
            <div className="mb-2 flex min-h-[44px] items-center gap-3 px-2 py-2">
              {showPhoto ? (
                <Image
                  src={safe.photoUrl as string}
                  alt=""
                  width={32}
                  height={32}
                  className="h-8 w-8 shrink-0 rounded-full object-cover"
                />
              ) : (
                <div
                  aria-hidden="true"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                  style={{
                    background: '#0BB5AD',
                    fontFamily: 'DM Sans, sans-serif',
                  }}
                >
                  {initials}
                </div>
              )}
              <div className="min-w-0">
                <p
                  className="truncate text-sm font-medium text-white"
                  style={{ fontFamily: 'DM Sans, sans-serif' }}
                >
                  {safe.studentName}
                </p>
                <p
                  className="truncate text-xs"
                  style={{
                    color: 'rgba(255,255,255,0.4)',
                    fontFamily: 'DM Sans, sans-serif',
                  }}
                >
                  {safe.studentBoard} · Class {safe.studentGrade}
                </p>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => void handleSignOut()}
            aria-label="Sign out of Sapien Academy"
            className="flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3 py-2.5 transition-all"
            style={{
              color: 'rgba(255,255,255,0.4)',
              fontFamily: 'DM Sans, sans-serif',
              fontSize: '13px',
              justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
              e.currentTarget.style.color = 'rgba(255,255,255,0.8)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = 'rgba(255,255,255,0.4)'
            }}
          >
            <LogOut size={16} aria-hidden="true" />
            {!sidebarCollapsed && <span>Sign out</span>}
          </button>
        </div>
      </aside>

      {sidebarOpen && (
        <div
          id="mobile-nav"
          className="fixed inset-0 z-50 flex lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
        >
          <div
            className="absolute inset-0"
            style={{
              background: 'rgba(13,27,42,0.6)',
              backdropFilter: 'blur(4px)',
            }}
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />

          <div
            className="relative flex h-full w-72 flex-col"
            style={{ background: '#0D1B2A' }}
          >
            <div className="flex items-center justify-between px-4 py-4">
              <span
                className="text-lg font-light text-white"
                style={{ fontFamily: 'Cormorant Garamond, serif' }}
              >
                Sapien
              </span>
              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                aria-label="Close navigation menu"
                className="flex items-center justify-center rounded-lg"
                style={{
                  width: '44px',
                  height: '44px',
                  color: 'rgba(255,255,255,0.6)',
                }}
              >
                <X size={18} aria-hidden />
              </button>
            </div>

            <div className="px-3 pb-3">
              <Link
                href="/learn?new=true"
                onClick={() => setSidebarOpen(false)}
                aria-label="Start new chat"
                className="flex min-h-[44px] w-full items-center gap-3 rounded-xl px-4 py-3"
                style={{
                  background: 'rgba(11,181,173,0.15)',
                  border: '1px solid rgba(11,181,173,0.3)',
                  color: '#0BB5AD',
                  fontFamily: 'DM Sans, sans-serif',
                  fontSize: '14px',
                  fontWeight: 500,
                }}
              >
                <Plus size={16} aria-hidden="true" />
                New chat
              </Link>
            </div>

            {safe.recentChats.length > 0 && (
              <div
                className="px-3 pb-3"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}
              >
                <p
                  className="px-3 pb-1 text-xs uppercase tracking-widest"
                  style={{
                    color: 'rgba(255,255,255,0.35)',
                    fontFamily: 'DM Sans, sans-serif',
                  }}
                >
                  Recent
                </p>
                {safe.recentChats.slice(0, 5).map((chat) => (
                  <Link
                    key={chat.id}
                    href={`/learn?chat=${encodeURIComponent(chat.id)}`}
                    onClick={() => setSidebarOpen(false)}
                    className="flex min-h-[44px] items-center gap-2 rounded-lg px-3 py-2.5"
                    style={{
                      color: 'rgba(255,255,255,0.6)',
                      fontFamily: 'DM Sans, sans-serif',
                      fontSize: '13px',
                    }}
                  >
                    <MessageCircle size={13} aria-hidden="true" />
                    <span className="truncate">{safeChatTitle(chat.name)}</span>
                  </Link>
                ))}
              </div>
            )}

            <nav className="min-h-0 flex-1 space-y-1 px-3 py-3">
              {NAV_ITEMS.map((item) => {
                const isActive = pathname.startsWith(item.href)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setSidebarOpen(false)}
                    aria-label={item.ariaLabel}
                    aria-current={isActive ? 'page' : undefined}
                    className="flex min-h-[44px] items-center gap-3 rounded-xl px-4 py-3"
                    style={{
                      background: isActive ? 'rgba(11,181,173,0.15)' : 'transparent',
                      color: isActive ? '#0BB5AD' : 'rgba(255,255,255,0.6)',
                      borderLeft: isActive ? '2px solid #0BB5AD' : '2px solid transparent',
                      fontFamily: 'DM Sans, sans-serif',
                      fontSize: '14px',
                      fontWeight: isActive ? 500 : 400,
                    }}
                  >
                    <span aria-hidden="true">{item.icon}</span>
                    {item.label}
                  </Link>
                )
              })}
            </nav>

            <div
              className="px-3 py-4"
              style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}
            >
              <button
                type="button"
                onClick={() => void handleSignOut()}
                aria-label="Sign out"
                className="flex min-h-[44px] w-full items-center gap-3 rounded-xl px-4 py-3"
                style={{
                  color: 'rgba(255,255,255,0.5)',
                  fontFamily: 'DM Sans, sans-serif',
                  fontSize: '14px',
                }}
              >
                <LogOut size={16} aria-hidden="true" />
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header
          className="flex shrink-0 items-center justify-between px-4 lg:hidden"
          style={{
            height: '56px',
            background: 'white',
            borderBottom: '1px solid #E8E4DC',
            paddingTop: 'env(safe-area-inset-top, 0px)',
          }}
          role="banner"
        >
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open navigation menu"
            aria-expanded={sidebarOpen}
            aria-controls="mobile-nav"
            className="flex items-center justify-center rounded-lg"
            style={{
              width: '44px',
              height: '44px',
              color: '#0D1B2A',
            }}
          >
            <Menu size={20} aria-hidden="true" />
          </button>

          <span
            className="text-xl font-light"
            style={{
              fontFamily: 'Cormorant Garamond, serif',
              color: '#0D1B2A',
            }}
          >
            Sapien
          </span>

          <Link
            href="/profile"
            aria-label="Go to profile"
            className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-full"
            style={{
              width: '44px',
              height: '44px',
              background: '#0BB5AD',
              color: 'white',
              fontFamily: 'DM Sans, sans-serif',
              fontSize: '12px',
              fontWeight: 600,
            }}
          >
            {showPhoto ? (
              <Image
                src={safe.photoUrl as string}
                alt=""
                width={44}
                height={44}
                className="object-cover"
              />
            ) : (
              initials
            )}
          </Link>
        </header>

        <nav
          aria-label="Bottom navigation"
          className="fixed bottom-0 left-0 right-0 z-40 flex lg:hidden"
          style={{
            background: 'white',
            borderTop: '1px solid #E8E4DC',
            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
            height: 'calc(56px + env(safe-area-inset-bottom, 0px))',
          }}
        >
          {NAV_ITEMS.map((item) => {
            const isActive = pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-label={item.ariaLabel}
                aria-current={isActive ? 'page' : undefined}
                className="flex min-h-[44px] flex-1 flex-col items-center justify-center gap-1"
                style={{
                  color: isActive ? '#0BB5AD' : '#9B9BAD',
                  fontFamily: 'DM Sans, sans-serif',
                  fontSize: '10px',
                  fontWeight: isActive ? 600 : 400,
                }}
              >
                <span aria-hidden="true">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>

        <main
          id="main-content"
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
          style={{
            paddingBottom: 'calc(56px + env(safe-area-inset-bottom, 0px))',
          }}
        >
          {children}
        </main>
      </div>
    </div>
  )
}
