export type Board = 'IB' | 'CBSE' | 'ICSE' | 'SSC'
export type Plan = 'free' | 'family' | 'school'
export type MessageRole = 'user' | 'assistant'
export type DoubtStatus = 'open' | 'got_it' | 'not_yet'

export interface StudentProfile {
  id: string
  user_id: string
  name: string
  email: string | null
  phone: string | null
  phone_verified: boolean
  grade: string | null
  board: Board | null
  school_name: string | null
  house_name: string | null
  city: string | null
  pin_code: string | null
  state: string | null
  country: string
  learning_goal: string | null
  favourite_subject: string | null
  target_exam_year: string | null
  cover_style: string
  photo_url: string | null
  onboarding_complete: boolean
  created_at: string
  updated_at: string
}

export interface ChatSession {
  id: string
  user_id: string
  name: string
  board: string | null
  grade: string | null
  status: string
  message_count: number
  last_message: string | null
  topics: string[]
  doubts_opened: number
  doubts_cleared: number
  duration_minutes: number
  summary: string | null
  summary_bullets: string[] | null
  created_at: string
  updated_at: string
}

export interface ChatMessage {
  id: string
  session_id: string
  user_id: string
  role: MessageRole
  content: string
  message_index: number
  feedback: 'positive' | 'negative' | null
  created_at: string
}

export interface UserStats {
  user_id: string
  total_sessions: number
  total_minutes: number
  doubts_cleared: number
  topics_explored: number
  current_streak: number
  longest_streak: number
  last_active_date: string | null
  updated_at: string
}
