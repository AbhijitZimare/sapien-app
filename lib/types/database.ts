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
  role: 'user' | 'assistant'
  content: string
  message_index: number
  feedback: 'positive' | 'negative' | null
  prompt_key: string | null
  was_cache_hit: boolean
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

export interface ConceptMastery {
  id: string
  user_id: string
  concept: string
  subject: string
  board: string
  grade: string
  mention_count: number
  mastery_score: number
  last_seen_at: string
  created_at: string
}

export interface Doubt {
  id: string
  user_id: string
  session_id: string
  step_title: string
  topic: string
  status: DoubtStatus
  opened_at: string
  resolved_at: string | null
}

export interface Subscription {
  id: string
  user_id: string
  plan: Plan
  status: string
  current_period_end: string | null
}

export interface CurriculumBoard {
  id: string
  code: string
  name: string
  country: string
  created_at: string
}

export interface CurriculumSubject {
  id: string
  board_id: string
  code: string
  name: string
  grade: string
  is_active: boolean
  created_at: string
}

export interface CurriculumModule {
  id: string
  subject_id: string
  name: string
  position: number
  marks_weightage: number | null
  created_at: string
}

export interface CurriculumChapter {
  id: string
  module_id: string
  name: string
  position: number
  periods: number | null
  created_at: string
}

export interface CurriculumTopic {
  id: string
  chapter_id: string
  name: string
  position: number
  is_active: boolean
  created_at: string
}

export interface CurriculumSubtopic {
  id: string
  topic_id: string
  name: string
  position: number
  depth_level: number
  is_active: boolean
  created_at: string
}

export interface CurriculumMicrotopic {
  id: string
  subtopic_id: string
  name: string
  position: number
  is_active: boolean
  created_at: string
}

export interface CurriculumTree {
  board: string
  grade: string
  subject: string
  modules: Array<{
    name: string
    marks_weightage: number | null
    chapters: Array<{
      name: string
      topics: Array<{
        name: string
        subtopics: Array<{
          name: string
          microtopics: string[]
        }>
      }>
    }>
  }>
}

export interface CurriculumNode {
  type: 'module' | 'chapter' | 'topic' | 'subtopic' | 'microtopic'
  id: string
  name: string
  path: string
  chapter: string
  module: string
}

export interface CacheEntry {
  id: string
  prompt_key: string
  response_jsonb: Record<string, unknown>
  tier: 'B' | 'C' | 'D'
  model: string
  tokens_input: number | null
  tokens_output: number | null
  thumbs_up: number
  thumbs_down: number
  created_at: string
  last_served_at: string | null
  invalidated_at: string | null
}
