'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [name, setName] = useState('')

  async function handleGoogle() {
    setLoading(true)
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`
      }
    })
  }

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const supabase = createClient()

    if (mode === 'register') {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: name },
          emailRedirectTo: `${window.location.origin}/auth/callback`
        }
      })
      if (error) setError(error.message)
      else setError('Check your email to confirm your account.')
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password
      })
      if (error) setError(error.message)
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex">
      {/* Left panel — desktop only */}
      <div
        className="hidden lg:flex flex-col justify-between w-1/2 p-12"
        style={{ background: '#0D1B2A' }}
      >
        <div>
          <h1
            className="text-white text-5xl font-light tracking-tight"
            style={{ fontFamily: 'Cormorant Garamond, serif' }}
          >
            Sapien Academy
          </h1>
          <div
            className="mt-3 h-0.5 w-10"
            style={{ background: '#0BB5AD' }}
          />
          <p
            className="mt-4 text-lg font-light italic"
            style={{
              fontFamily: 'Cormorant Garamond, serif',
              color: 'rgba(255,255,255,0.6)'
            }}
          >
            Where Thinking Grows.
          </p>
        </div>

        <div className="space-y-6">
          {[
            { icon: '📚', text: 'Board-aligned tutoring for IB, CBSE, ICSE and SSC' },
            { icon: '🧠', text: 'Step-by-step explanations with Deep Dive doubt clearing' },
            { icon: '📊', text: 'Track your progress and build mastery over time' },
          ].map((item, i) => (
            <div key={i} className="flex items-start gap-3">
              <span className="text-xl">{item.icon}</span>
              <p
                className="text-sm font-light leading-relaxed"
                style={{ color: 'rgba(255,255,255,0.6)',
                  fontFamily: 'DM Sans, sans-serif' }}
              >
                {item.text}
              </p>
            </div>
          ))}
        </div>

        <p
          className="text-xs"
          style={{ color: 'rgba(255,255,255,0.3)',
            fontFamily: 'DM Sans, sans-serif' }}
        >
          © 2026 Sapien Academy
        </p>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        {/* Mobile header */}
        <div
          className="lg:hidden text-center mb-8"
        >
          <h1
            className="text-3xl font-light"
            style={{ fontFamily: 'Cormorant Garamond, serif',
              color: '#0D1B2A' }}
          >
            Sapien Academy
          </h1>
          <div
            className="mt-2 h-0.5 w-8 mx-auto"
            style={{ background: '#0BB5AD' }}
          />
        </div>

        <div className="w-full max-w-sm space-y-6">
          <div>
            <h2
              className="text-2xl font-medium"
              style={{ fontFamily: 'Cormorant Garamond, serif',
                color: '#0D1B2A' }}
            >
              {mode === 'login' ? 'Welcome back.' : 'Create account.'}
            </h2>
            <p
              className="mt-1 text-sm"
              style={{ color: '#9B9BAD',
                fontFamily: 'DM Sans, sans-serif' }}
            >
              {mode === 'login'
                ? 'Sign in to continue learning.'
                : 'Start your learning journey.'}
            </p>
          </div>

          {/* Google button */}
          <button
            onClick={handleGoogle}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-lg border text-sm font-medium transition-all hover:shadow-md"
            style={{
              border: '1px solid #E8E4DC',
              fontFamily: 'DM Sans, sans-serif',
              color: '#0D1B2A'
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t" style={{ borderColor: '#E8E4DC' }} />
            </div>
            <div className="relative flex justify-center text-xs">
              <span
                className="px-3 bg-white"
                style={{ color: '#9B9BAD',
                  fontFamily: 'DM Sans, sans-serif' }}
              >
                or continue with email
              </span>
            </div>
          </div>

          <form onSubmit={handleEmail} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label
                  className="block text-xs font-medium mb-1.5"
                  style={{ color: '#0D1B2A',
                    fontFamily: 'DM Sans, sans-serif' }}
                >
                  Full name
                </label>
                <Input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Abhijit Zimare"
                  required
                />
              </div>
            )}

            <div>
              <label
                className="block text-xs font-medium mb-1.5"
                style={{ color: '#0D1B2A',
                  fontFamily: 'DM Sans, sans-serif' }}
              >
                Email
              </label>
              <Input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </div>

            <div>
              <label
                className="block text-xs font-medium mb-1.5"
                style={{ color: '#0D1B2A',
                  fontFamily: 'DM Sans, sans-serif' }}
              >
                Password
              </label>
              <Input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
              />
            </div>

            {error && (
              <p
                className="text-xs"
                style={{
                  color: error.includes('Check your email')
                    ? '#0BB5AD' : '#DC3545',
                  fontFamily: 'DM Sans, sans-serif'
                }}
              >
                {error}
              </p>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-11"
              style={{ background: '#0D1B2A',
                fontFamily: 'DM Sans, sans-serif' }}
            >
              {loading ? 'Please wait...' : mode === 'login'
                ? 'Sign in' : 'Create account'}
            </Button>
          </form>

          <p
            className="text-center text-sm"
            style={{ color: '#9B9BAD',
              fontFamily: 'DM Sans, sans-serif' }}
          >
            {mode === 'login'
              ? "Don't have an account? "
              : 'Already have an account? '}
            <button
              onClick={() => { setMode(
                mode === 'login' ? 'register' : 'login')
                setError('') }}
              className="font-medium"
              style={{ color: '#0BB5AD' }}
            >
              {mode === 'login' ? 'Create one' : 'Sign in'}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
