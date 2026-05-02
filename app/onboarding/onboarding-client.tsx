'use client'

// Icons: lucide-react ONLY — no emoji, no other icon libraries

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  CircleDot,
  CornerDownLeft,
  Loader2,
  MapPin,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/client'

export function toTitleCase(str: string) {
  return str
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export async function validateCityPin(
  cityInput: string,
  pin: string,
): Promise<{
  valid: boolean
  error?: string
  isAbroad?: boolean
  state?: string
  district?: string
  resolvedCity?: string
}> {
  if (!/^\d{6}$/.test(pin)) {
    return { valid: false, error: 'Enter a valid 6-digit PIN code.' }
  }

  let data: unknown
  try {
    const res = await fetch(`https://api.postalpincode.in/pincode/${pin}`, {
      cache: 'no-store',
    })
    data = await res.json()
  } catch {
    return {
      valid: false,
      error: 'Could not verify PIN code. Check your connection.',
    }
  }

  const arr = Array.isArray(data) ? data : []
  const first = arr[0] as { Status?: string; PostOffice?: unknown[] }

  if (!first?.Status || first.Status !== 'Success') {
    return {
      valid: false,
      error: 'PIN code not found. Please check and try again.',
    }
  }

  const postOffices = first.PostOffice
  if (!postOffices || postOffices.length === 0) {
    return { valid: false, error: 'No data found for this PIN code.' }
  }

  const po = postOffices[0] as {
    Country?: string
    State?: string
    District?: string
    Division?: string
  }

  if (po.Country !== 'India') {
    return {
      valid: false,
      isAbroad: true,
      error:
        'Sapien Academy is currently available for Indian students only. Please enter an Indian city and PIN code.',
    }
  }

  const apiState = po.State || ''
  const apiDistrict = po.District || ''
  const apiDivision = po.Division || ''

  function normalize(s: string) {
    return s
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/city$/, '')
      .replace(/district$/, '')
      .replace(/municipal$/, '')
      .trim()
  }

  const inputNorm = normalize(cityInput)
  const districtNorm = normalize(apiDistrict)
  const divisionNorm = normalize(apiDivision)

  const cityMatches =
    districtNorm.includes(inputNorm) ||
    inputNorm.includes(districtNorm) ||
    divisionNorm.includes(inputNorm) ||
    inputNorm.includes(divisionNorm)

  if (!cityMatches) {
    return {
      valid: false,
      error: `This PIN code belongs to ${apiDistrict}, ${apiState} — not ${cityInput}. Please check your PIN code or city name.`,
    }
  }

  const resolvedCity = toTitleCase(apiDistrict.replace(/city$/i, '').trim())

  return {
    valid: true,
    state: apiState,
    district: apiDistrict,
    resolvedCity,
  }
}

const BOARDS = ['IB', 'CBSE', 'ICSE', 'SSC'] as const
const GRADES = ['6', '7', '8', '9', '10', '11', '12'] as const

const STEP_ORDER = [
  'name',
  'board',
  'grade',
  'city_pin',
  'school',
  'goal',
] as const

interface Props {
  userId: string
  userEmail: string
  initialName: string
}

interface FormData {
  name: string
  board: string
  grade: string
  city: string
  pinCode: string
  state: string
  district: string
  school_id: string
  school_name: string
  learning_goal: string
}

type SchoolRow = {
  id: string
  name: string
  city: string
  board: string | null
  verification_status: string | null
}

interface CityRecord {
  id: string
  name: string
  state: string | null
}

function schoolVerificationBadge(status: string | null | undefined) {
  const s = status ?? ''
  if (s === 'verified') {
    return (
      <span className="inline-flex items-center gap-1 text-xs" style={{ color: '#0BB5AD' }}>
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
        Verified school
      </span>
    )
  }
  if (s === 'pending') {
    return (
      <span className="inline-flex items-center gap-1 text-xs" style={{ color: '#F0A500' }}>
        <CircleDot className="h-3.5 w-3.5" aria-hidden />
        Verification pending
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" style={{ color: '#9B9BAD' }}>
      <CircleDot className="h-3.5 w-3.5" aria-hidden />
      Add your school
    </span>
  )
}

export default function OnboardingClient({
  userId,
  userEmail,
  initialName,
}: Props) {
  const [step, setStep] = useState(0)
  const [direction, setDirection] = useState<'forward' | 'back'>('forward')
  const [animating, setAnimating] = useState(false)
  const [saving, setSaving] = useState(false)

  const [schools, setSchools] = useState<SchoolRow[]>([])
  const [schoolSearch, setSchoolSearch] = useState('')
  const [showSchoolDropdown, setShowSchoolDropdown] = useState(false)

  const [form, setForm] = useState<FormData>({
    name: initialName,
    board: '',
    grade: '',
    city: '',
    pinCode: '',
    state: '',
    district: '',
    school_id: '',
    school_name: '',
    learning_goal: '',
  })

  const [schoolEntryMode, setSchoolEntryMode] = useState<
    null | 'list' | 'manual'
  >(null)

  const [cityValidation, setCityValidation] = useState<
    'idle' | 'loading' | 'valid' | 'error' | 'abroad'
  >('idle')
  const [cityError, setCityError] = useState('')
  const [cityData, setCityData] = useState<{
    state: string
    district: string
  } | null>(null)

  const [cityQuery, setCityQuery] = useState('')
  const [citySuggestions, setCitySuggestions] = useState<CityRecord[]>([])
  const [showCityDropdown, setShowCityDropdown] = useState(false)

  const [schoolNotice, setSchoolNotice] = useState<string | null>(null)

  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)
  const validatingCityRef = useRef(false)
  const advanceFromCityPinTimerRef = useRef<number | null>(null)
  /** Prevents duplicate validate calls for the same normalized city+PIN after success. */
  const cityValidatedKeyRef = useRef<string | null>(null)

  useEffect(
    () => () => {
      if (advanceFromCityPinTimerRef.current != null) {
        window.clearTimeout(advanceFromCityPinTimerRef.current)
      }
    },
    [],
  )

  const STEPS = useMemo(
    () =>
      [
        {
          id: 'name',
          question: "What's your name?",
          subtitle: 'How should Sophia address you?',
          canSkip: false,
          isValid: () => form.name.trim().length >= 2,
        },
        {
          id: 'board',
          question: 'Which board are you on?',
          subtitle: 'This shapes your entire curriculum.',
          canSkip: false,
          isValid: () => form.board !== '',
        },
        {
          id: 'grade',
          question: 'What class are you in?',
          subtitle: 'We will tailor every explanation to your level.',
          canSkip: false,
          isValid: () => form.grade !== '',
        },
        {
          id: 'city_pin',
          question: 'Which city are you in?',
          subtitle: 'Your city and 6-digit PIN help us localize content.',
          canSkip: false,
          isValid: () => cityValidation === 'valid',
        },
        {
          id: 'school',
          question: 'Which school?',
          subtitle:
            'School verification helps us connect you with your teachers.',
          canSkip: false,
          isValid: () => form.school_name.trim().length >= 1,
        },
        {
          id: 'goal',
          question: 'What is your learning goal?',
          subtitle: 'Tell Sophia what you want to achieve.',
          canSkip: true,
          isValid: () => form.learning_goal.trim().length >= 5,
        },
      ] as const,
    [
      form.board,
      form.grade,
      form.name,
      form.pinCode,
      form.school_name,
      form.learning_goal,
      cityValidation,
    ],
  )

  const currentStep = STEPS[step]
  if (!currentStep) return null

  const progress = (step / STEPS.length) * 100

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 400)
    return () => clearTimeout(t)
  }, [step])

  /** Sync city search helper when landing on step */
  useEffect(() => {
    if (STEP_ORDER[step] === 'city_pin') {
      setCityQuery((q) => (q ? q : form.city || ''))
    }
  }, [step, form.city])

  /** Cities autocomplete — min 2 chars */
  useEffect(() => {
    if (cityQuery.length < 2) {
      setCitySuggestions([])
      setShowCityDropdown(false)
      return
    }

    const timeout = setTimeout(() => {
      void (async () => {
        const supabase = createClient()
        const { data } = await supabase
          .from('cities')
          .select('id, name, state')
          .ilike('name', `%${cityQuery}%`)
          .limit(12)
        setCitySuggestions((data || []) as CityRecord[])
        setShowCityDropdown(true)
      })()
    }, 200)

    return () => clearTimeout(timeout)
  }, [cityQuery])

  /** School search filtered by city */
  useEffect(() => {
    if (schoolSearch.length < 2) {
      setSchools([])
      setShowSchoolDropdown(false)
      return
    }

    const timeout = setTimeout(() => {
      void (async () => {
        const supabase = createClient()
        let q = supabase
          .from('schools')
          .select('id, name, city, board, verification_status')
          .ilike('name', `%${schoolSearch}%`)
          .limit(8)

        if (form.city.trim()) {
          q = q.ilike('city', `%${toTitleCase(form.city)}%`)
        }

        const { data } = await q
        setSchools((data || []) as SchoolRow[])
        setShowSchoolDropdown(true)
      })()
    }, 300)

    return () => clearTimeout(timeout)
  }, [schoolSearch, form.city])

  useEffect(() => {
    if (STEP_ORDER[step] === 'school') {
      setSchoolNotice(null)
      setSchoolEntryMode(null)
      setSchoolSearch('')
    }
  }, [step])

  const resolveSchoolVerificationForSave = (): string => {
    if (!form.school_name.trim()) return 'unverified'
    if (schoolEntryMode === 'manual') return 'pending'
    if (!form.school_id) return 'pending'
    const row = schools.find((s) => s.id === form.school_id)
    const vs = row?.verification_status ?? 'pending'
    if (vs === 'verified') return 'verified'
    return 'pending'
  }

  const handleCityValidation = useCallback(async () => {
    if (validatingCityRef.current) return
    if (STEP_ORDER[step] !== 'city_pin') return

    const key = `${form.city.trim()}|${form.pinCode}`
    if (cityValidatedKeyRef.current === key) return

    validatingCityRef.current = true
    setCityValidation('loading')
    setCityError('')

    try {
      const result = await validateCityPin(form.city, form.pinCode)

      if (result.valid && result.resolvedCity && result.state && result.district) {
        const resolved = result.resolvedCity

        cityValidatedKeyRef.current = `${resolved}|${form.pinCode}`

        setCityData({
          state: result.state,
          district: result.district,
        })
        setForm((f) => ({
          ...f,
          city: resolved,
          state: result.state ?? '',
          district: result.district ?? '',
        }))
        setCityQuery(resolved)

        const supabase = createClient()
        const { error: upsertErr } = await supabase.from('cities').upsert(
          {
            name: toTitleCase(resolved),
            district: result.district,
            state: result.state,
            country: 'India',
            pincode: form.pinCode,
            verified: false,
          },
          { onConflict: 'name,state', ignoreDuplicates: true },
        )

        if (upsertErr) {
          console.warn('City already exists or upsert skipped:', upsertErr.message)
        }

        setCityValidation('valid')

        if (advanceFromCityPinTimerRef.current != null) {
          window.clearTimeout(advanceFromCityPinTimerRef.current)
        }
        advanceFromCityPinTimerRef.current = window.setTimeout(() => {
          advanceFromCityPinTimerRef.current = null
          setDirection('forward')
          setAnimating(true)
          window.setTimeout(() => {
            setStep((s) => (s < STEP_ORDER.length - 1 ? s + 1 : s))
            setAnimating(false)
          }, 250)
        }, 800)
        return
      }

      if (result.isAbroad) {
        setCityValidation('abroad')
        setCityError(result.error || '')
        return
      }

      setCityValidation('error')
      setCityError(result.error || 'Validation failed.')
    } finally {
      validatingCityRef.current = false
    }
  }, [form.city, form.pinCode, step])

  useEffect(() => {
    if (form.pinCode.length !== 6) return
    if (form.city.trim().length < 2) return
    if (STEP_ORDER[step] !== 'city_pin') return
    const key = `${form.city.trim()}|${form.pinCode}`
    if (cityValidatedKeyRef.current === key) return
    void handleCityValidation()
  }, [form.pinCode, form.city, step, handleCityValidation])

  function resetCityValidation() {
    setCityValidation('idle')
    setCityError('')
    setCityData(null)
    cityValidatedKeyRef.current = null
  }

  async function insertManualSchool(displayName: string) {
    const supabase = createClient()
    const title = toTitleCase(displayName)
    const payload = {
      name: title,
      city: toTitleCase(form.city),
      state: form.state || null,
      board: form.board || null,
      verification_status: 'pending' as const,
    }

    const { data, error } = await supabase
      .from('schools')
      .insert(payload)
      .select('id')

    let schoolId = data?.[0]?.id as string | undefined

    if (error) {
      console.error('School insert error:', JSON.stringify(error, null, 2))
      const { data: found } = await supabase
        .from('schools')
        .select('id')
        .eq('name', title)
        .ilike('city', `%${toTitleCase(form.city)}%`)
        .maybeSingle()
      schoolId = found?.id
    }

    setForm((f) => ({
      ...f,
      school_name: title,
      school_id: schoolId || '',
    }))
    setSchoolEntryMode('manual')
    setSchoolSearch('')
    setShowSchoolDropdown(false)
    setSchoolNotice(
      'Your school has been added. We will verify it soon — you can start learning now.',
    )
  }

  function selectSchoolFromList(row: SchoolRow) {
    setForm((f) => ({
      ...f,
      school_id: row.id,
      school_name: row.name,
    }))
    setSchoolEntryMode('list')
    setSchoolSearch('')
    setShowSchoolDropdown(false)
    setSchoolNotice(
      row.verification_status === 'verified'
        ? 'School selected. Verified school.'
        : 'School selected. Verification in progress.',
    )
  }

  function goNext() {
    if (animating) return
    if (step < STEPS.length - 1) {
      setDirection('forward')
      setAnimating(true)
      window.setTimeout(() => {
        setStep((s) => s + 1)
        setAnimating(false)
      }, 250)
    } else {
      // Last step — finish onboarding
      void handleFinish()
    }
  }

  function goBack() {
    if (animating || step === 0) return
    setDirection('back')
    setAnimating(true)
    window.setTimeout(() => {
      setStep((s) => s - 1)
      setAnimating(false)
    }, 250)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      const s = STEPS[step]
      if (!s) return
      if (s.id === 'city_pin' && cityValidation !== 'valid') return
      if (s.isValid() || s.canSkip) goNext()
    }
  }

  async function handleFinish() {
    if (saving) return
    setSaving(true)

    try {
      const supabase = createClient()
      const schoolVer = resolveSchoolVerificationForSave()

      const payload = {
        name: form.name.trim() || initialName.trim() || 'Student',
        board: form.board,
        grade: form.grade,
        city: toTitleCase(form.city),
        pin_code: form.pinCode || null,
        state: form.state || null,
        school_id: form.school_id || null,
        school_name: form.school_name
          ? toTitleCase(form.school_name)
          : null,
        learning_goal: form.learning_goal.trim() || null,
        school_verification_status: schoolVer,
        onboarding_complete: true,
        updated_at: new Date().toISOString(),
      }

      const { error } = await supabase
        .from('student_profiles')
        .update(payload)
        .eq('user_id', userId)

      if (error) {
        console.error('Onboarding save error:', error.message)
        setSaving(false)
        return
      }

      window.location.href = '/learn'
    } catch (err) {
      console.error('Onboarding finish error:', err)
      setSaving(false)
    }
  }

  void userEmail

  const canContinue =
    currentStep.isValid() || currentStep.canSkip || saving

  const validateCityInputsReady =
    form.city.trim().length >= 2 && /^\d{6}$/.test(form.pinCode)

  const isLastStep = step === STEPS.length - 1

  return (
    <div
      id="main-content"
      className="flex min-h-screen flex-col outline-none"
      style={{ background: '#FAFAF8' }}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="application"
      aria-label="Onboarding questionnaire"
    >
      <div
        className="fixed top-0 right-0 left-0 z-50 h-0.5"
        style={{ background: '#E8E4DC' }}
      >
        <div
          className="h-full transition-all duration-500 ease-out"
          style={{
            width: `${progress}%`,
            background: '#0BB5AD',
          }}
        />
      </div>

      {step > 0 ? (
        <button
          type="button"
          onClick={() => void goBack()}
          className="fixed top-6 left-6 z-40 flex items-center gap-2 text-sm transition-opacity hover:opacity-70"
          style={{
            color: '#9B9BAD',
            fontFamily: 'DM Sans, sans-serif',
          }}
        >
          <ArrowLeft size={16} aria-hidden />
          Back
        </button>
      ) : null}

      <div
        className="fixed top-6 right-6 z-40 text-sm"
        style={{
          color: '#9B9BAD',
          fontFamily: 'DM Sans, sans-serif',
        }}
      >
        {step + 1} / {STEPS.length}
      </div>

      <div className="flex flex-1 items-center justify-center px-6 py-20">
        <div
          className="w-full max-w-lg"
          style={{
            opacity: animating ? 0 : 1,
            transform: animating
              ? direction === 'forward'
                ? 'translateY(-16px)'
                : 'translateY(16px)'
              : 'translateY(0)',
            transition: 'opacity 250ms ease, transform 250ms ease',
          }}
        >
          <h1
            className="mb-3 text-4xl leading-tight font-light"
            style={{
              fontFamily: 'Cormorant Garamond, serif',
              color: '#0D1B2A',
            }}
          >
            {currentStep.question}
          </h1>
          <p
            className="mb-10 text-base"
            style={{
              color: '#9B9BAD',
              fontFamily: 'DM Sans, sans-serif',
            }}
          >
            {currentStep.subtitle}
          </p>

          {currentStep.id === 'name' ? (
            <input
              ref={inputRef as React.RefObject<HTMLInputElement>}
              type="text"
              value={form.name}
              onChange={(e) =>
                setForm((f) => ({ ...f, name: e.target.value }))
              }
              placeholder="Your full name"
              className="w-full border-0 border-b-2 bg-transparent pb-3 text-2xl font-light transition-colors outline-none"
              style={{
                fontFamily: 'Cormorant Garamond, serif',
                color: '#0D1B2A',
                borderColor: form.name ? '#0BB5AD' : '#E8E4DC',
                caretColor: '#0BB5AD',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = '#0BB5AD'
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = form.name
                  ? '#0BB5AD'
                  : '#E8E4DC'
              }}
            />
          ) : null}

          {currentStep.id === 'board' ? (
            <div className="grid grid-cols-2 gap-3">
              {BOARDS.map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => {
                    setForm((f) => ({ ...f, board: b }))
                    window.setTimeout(() => goNext(), 300)
                  }}
                  className="rounded-2xl border-2 py-5 text-lg font-medium transition-all"
                  style={{
                    fontFamily: 'Cormorant Garamond, serif',
                    background: form.board === b ? '#0D1B2A' : 'white',
                    color: form.board === b ? 'white' : '#0D1B2A',
                    borderColor: form.board === b ? '#0D1B2A' : '#E8E4DC',
                    transform: form.board === b ? 'scale(1.02)' : 'scale(1)',
                  }}
                >
                  {b}
                </button>
              ))}
            </div>
          ) : null}

          {currentStep.id === 'grade' ? (
            <div className="flex flex-wrap gap-3">
              {GRADES.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => {
                    setForm((f) => ({ ...f, grade: g }))
                    window.setTimeout(() => goNext(), 300)
                  }}
                  className="h-16 w-16 rounded-2xl border-2 text-xl font-medium transition-all"
                  style={{
                    fontFamily: 'Cormorant Garamond, serif',
                    background: form.grade === g ? '#0D1B2A' : 'white',
                    color: form.grade === g ? 'white' : '#0D1B2A',
                    borderColor: form.grade === g ? '#0D1B2A' : '#E8E4DC',
                    transform: form.grade === g ? 'scale(1.05)' : 'scale(1)',
                  }}
                >
                  {g}
                </button>
              ))}
            </div>
          ) : null}

          {currentStep.id === 'city_pin' ? (
            <div className="relative space-y-6">
              <div className="relative">
                <label
                  className="mb-2 block text-xs font-medium"
                  style={{ color: '#0D1B2A', fontFamily: 'DM Sans, sans-serif' }}
                >
                  City
                </label>
                <input
                  ref={inputRef as React.RefObject<HTMLInputElement>}
                  type="text"
                  value={cityQuery}
                  onChange={(e) => {
                    const v = e.target.value
                    setCityQuery(v)
                    setForm((f) => ({ ...f, city: v }))
                    resetCityValidation()
                  }}
                  placeholder="Start typing…"
                  className="w-full border-0 border-b-2 bg-transparent pb-3 text-xl font-light outline-none transition-colors"
                  style={{
                    fontFamily: 'Cormorant Garamond, serif',
                    color: '#0D1B2A',
                    borderColor: form.city ? '#0BB5AD' : '#E8E4DC',
                    caretColor: '#0BB5AD',
                  }}
                />
                {showCityDropdown && citySuggestions.length > 0 ? (
                  <div
                    className="absolute top-full right-0 left-0 z-50 mt-1 max-h-48 overflow-auto rounded-xl border shadow-lg"
                    style={{
                      borderColor: '#E8E4DC',
                      background: 'white',
                    }}
                  >
                    {citySuggestions.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setForm((f) => ({
                            ...f,
                            city: c.name,
                            state: c.state ?? f.state,
                          }))
                          setCityQuery(c.name)
                          setShowCityDropdown(false)
                          resetCityValidation()
                        }}
                        className="flex w-full flex-col px-4 py-3 text-left text-sm hover:bg-muted/60"
                      >
                        <span style={{ color: '#0D1B2A', fontFamily: 'DM Sans, sans-serif' }}>
                          {c.name}
                        </span>
                        {c.state ? (
                          <span className="text-xs" style={{ color: '#9B9BAD' }}>
                            {c.state}
                          </span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <div>
                <label
                  className="mb-2 block text-xs font-medium"
                  style={{ color: '#0D1B2A', fontFamily: 'DM Sans, sans-serif' }}
                >
                  PIN code
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={form.pinCode}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, '').slice(0, 6)
                    setForm((f) => ({ ...f, pinCode: digits }))
                    resetCityValidation()
                  }}
                  placeholder="6 digits"
                  className="w-full border-0 border-b-2 bg-transparent pb-3 text-xl font-light outline-none transition-colors tracking-widest"
                  style={{
                    fontFamily: 'DM Sans, sans-serif',
                    color: '#0D1B2A',
                    borderColor: form.pinCode.length === 6 ? '#0BB5AD' : '#E8E4DC',
                    caretColor: '#0BB5AD',
                  }}
                />
              </div>

              {cityValidation === 'valid' && cityData ? (
                <div
                  className="mt-4 flex items-center gap-2"
                  style={{
                    color: '#0BB5AD',
                    fontFamily: 'DM Sans, sans-serif',
                    fontSize: '14px',
                  }}
                >
                  <Check size={16} aria-hidden />
                  <span>
                    {form.city}, {cityData.state}
                  </span>
                </div>
              ) : null}

              {cityValidation === 'abroad' ? (
                <div
                  className="mt-4 flex items-start gap-3 rounded-xl p-4"
                  style={{
                    background: 'rgba(240,165,0,0.08)',
                    border: '1px solid rgba(240,165,0,0.3)',
                  }}
                >
                  <MapPin
                    size={16}
                    style={{ color: '#F0A500', marginTop: '2px', flexShrink: 0 }}
                    aria-hidden
                  />
                  <p
                    style={{
                      color: '#0D1B2A',
                      fontFamily: 'DM Sans, sans-serif',
                      fontSize: '13px',
                      lineHeight: '1.6',
                    }}
                  >
                    {cityError}
                  </p>
                </div>
              ) : null}

              {cityValidation === 'error' ? (
                <p className="mt-3 text-sm" style={{ color: '#DC3545', fontFamily: 'DM Sans, sans-serif' }}>
                  {cityError}
                </p>
              ) : null}

              {validateCityInputsReady && cityValidation !== 'valid' ? (
                <button
                  type="button"
                  disabled={cityValidation === 'loading'}
                  onClick={() => void handleCityValidation()}
                  className="inline-flex items-center gap-2 rounded-2xl px-6 py-3 text-sm font-medium transition-opacity hover:opacity-90 disabled:pointer-events-none"
                  style={{
                    background:
                      cityValidation === 'loading'
                        ? '#C8C8CC'
                        : '#0D1B2A',
                    color: cityValidation === 'loading' ? '#6B7280' : 'white',
                    fontFamily: 'DM Sans, sans-serif',
                    opacity: cityValidation === 'loading' ? 0.95 : 1,
                  }}
                >
                  {cityValidation === 'loading' ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : null}
                  Validate
                </button>
              ) : null}
            </div>
          ) : null}

          {currentStep.id === 'school' ? (
            <div className="space-y-4">
              <div className="relative">
                <input
                  ref={inputRef as React.RefObject<HTMLInputElement>}
                  type="text"
                  value={schoolSearch || form.school_name}
                  onChange={(e) => {
                    const v = e.target.value
                    setSchoolSearch(v)
                    setForm((f) => ({
                      ...f,
                      school_name: v,
                      school_id: '',
                    }))
                    setSchoolEntryMode(null)
                  }}
                  placeholder="Search your school..."
                  className="w-full border-0 border-b-2 bg-transparent pb-3 text-xl transition-colors outline-none"
                  style={{
                    fontFamily: 'DM Sans, sans-serif',
                    color: '#0D1B2A',
                    borderColor: form.school_name ? '#0BB5AD' : '#E8E4DC',
                    caretColor: '#0BB5AD',
                  }}
                />

                {showSchoolDropdown && schoolSearch.length >= 2 ? (
                  <div
                    className="absolute top-full right-0 left-0 z-50 mt-2 overflow-hidden rounded-2xl"
                    style={{
                      background: 'white',
                      boxShadow: '0 8px 32px rgba(13,27,42,0.12)',
                      border: '1px solid #E8E4DC',
                    }}
                  >
                    {schools.map((school) => (
                      <button
                        key={school.id}
                        type="button"
                        onClick={() => selectSchoolFromList(school)}
                        className="flex w-full items-start justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-muted/60"
                      >
                        <div>
                          <div
                            className="text-sm font-medium"
                            style={{ color: '#0D1B2A', fontFamily: 'DM Sans, sans-serif' }}
                          >
                            {school.name}
                          </div>
                          <div
                            className="mt-0.5 text-xs"
                            style={{ color: '#9B9BAD', fontFamily: 'DM Sans, sans-serif' }}
                          >
                            {school.city}
                          </div>
                          <div className="mt-2">
                            {schoolVerificationBadge(school.verification_status)}
                          </div>
                        </div>
                        <ArrowRight size={14} style={{ color: '#9B9BAD' }} aria-hidden />
                      </button>
                    ))}

                    <button
                      type="button"
                      onClick={() => void insertManualSchool(schoolSearch)}
                      className="w-full px-5 py-4 text-left transition-colors"
                      style={{
                        borderTop:
                          schools.length > 0 ? '1px solid #E8E4DC' : undefined,
                        color: '#0BB5AD',
                        fontFamily: 'DM Sans, sans-serif',
                        fontSize: '13px',
                      }}
                    >
                      + Add &quot;
                      {schoolSearch}
                      &quot; as my school
                    </button>
                  </div>
                ) : null}
              </div>

              {schoolNotice ? (
                <p
                  className="text-sm leading-relaxed"
                  style={{ color: '#0BB5AD', fontFamily: 'DM Sans, sans-serif' }}
                >
                  {schoolNotice}
                </p>
              ) : null}

              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs uppercase tracking-wide" style={{ color: '#9B9BAD' }}>
                  Your selection:
                </span>
                <Badge variant="outline" className="border-[#E8E4DC]">
                  {schoolEntryMode === 'manual'
                    ? 'New school (pending)'
                    : form.school_name
                      ? 'Registered school'
                      : 'None'}
                </Badge>
                {schoolEntryMode !== null || form.school_name
                  ? schoolVerificationBadge(
                      schoolEntryMode === 'manual'
                        ? 'pending'
                        : (schools.find((s) => s.id === form.school_id)
                            ?.verification_status ??
                          ('pending' as string)),
                    )
                  : null}
              </div>
            </div>
          ) : null}

          {currentStep.id === 'goal' ? (
            <textarea
              ref={inputRef as React.RefObject<HTMLTextAreaElement>}
              value={form.learning_goal}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  learning_goal: e.target.value,
                }))
              }
              placeholder="e.g. Score 7 in IB Math AA HL"
              rows={2}
              className="w-full resize-none border-0 border-b-2 bg-transparent pb-3 text-xl font-light transition-colors outline-none"
              style={{
                fontFamily: 'Cormorant Garamond, serif',
                color: '#0D1B2A',
                borderColor: form.learning_goal ? '#0BB5AD' : '#E8E4DC',
                caretColor: '#0BB5AD',
              }}
            />
          ) : null}

          <div className="mt-10 flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={() => {
                if (isLastStep) {
                  void handleFinish()
                } else {
                  goNext()
                }
              }}
              disabled={!canContinue || saving || (currentStep.id === 'city_pin' && cityValidation !== 'valid')}
              className="flex items-center gap-3 rounded-2xl px-8 py-4 text-sm font-medium transition-all disabled:opacity-40"
              style={{
                background: canContinue ? '#0D1B2A' : '#E8E4DC',
                color: canContinue ? 'white' : '#9B9BAD',
                fontFamily: 'DM Sans, sans-serif',
              }}
            >
              {saving ? (
                'Setting up your account...'
              ) : isLastStep ? (
                <>
                  <Check size={16} aria-hidden />
                  Start learning
                </>
              ) : currentStep.canSkip && !currentStep.isValid() ? (
                'Skip'
              ) : (
                <>
                  Continue
                  <ArrowRight size={16} aria-hidden />
                </>
              )}
            </button>

            {currentStep.canSkip === true ? (
              <span
                className="inline-flex items-center gap-1 text-xs"
                style={{
                  color: '#9B9BAD',
                  fontFamily: 'DM Sans, sans-serif',
                }}
              >
                Press Enter{' '}
                <CornerDownLeft className="inline h-3.5 w-3.5" aria-hidden /> to{' '}
                continue or skip on this step
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="pb-8 text-center">
        <p
          className="text-xs"
          style={{
            color: '#C8C8CC',
            fontFamily: 'DM Sans, sans-serif',
          }}
        >
          Sapien Academy · Where Thinking Grows.
        </p>
      </div>
    </div>
  )
}
