import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const protectedPaths = ['/dashboard', '/learn', '/profile', '/onboarding']
  const isProtected = protectedPaths.some((path) =>
    request.nextUrl.pathname.startsWith(path),
  )

  if (isProtected && !user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  async function onboardingComplete(): Promise<boolean | null> {
    if (!user) return null
    const { data: profile } = await supabase
      .from('student_profiles')
      .select('onboarding_complete')
      .eq('user_id', user.id)
      .maybeSingle()
    return profile?.onboarding_complete === true
  }

  const path = request.nextUrl.pathname

  if (path === '/login' && user) {
    const ready = await onboardingComplete()
    const url = request.nextUrl.clone()
    url.pathname = ready === true ? '/learn' : '/onboarding'
    return NextResponse.redirect(url)
  }

  if (path === '/' && user) {
    const ready = await onboardingComplete()
    const url = request.nextUrl.clone()
    url.pathname = ready === true ? '/learn' : '/onboarding'
    return NextResponse.redirect(url)
  }

  if (path.startsWith('/onboarding') && user) {
    const ready = await onboardingComplete()
    if (ready === true) {
      const url = request.nextUrl.clone()
      url.pathname = '/learn'
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
