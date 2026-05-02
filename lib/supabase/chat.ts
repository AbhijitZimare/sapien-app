import { createClient } from '@/lib/supabase/client'
import type { ChatMessage, ChatSession } from '@/lib/types/database'

export type ChatSuccess<T> = { success: true; data: T }
export type ChatFailure = {
  success: false
  error: { code: string; message: string }
}
export type ChatResult<T> = ChatSuccess<T> | ChatFailure

function fail(code: string, message: string): ChatFailure {
  return { success: false, error: { code, message } }
}

function errMsg(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

/** Map DB row to ChatSession with safe defaults for nullable arrays. */
function rowToSession(row: Record<string, unknown>): ChatSession {
  const topics = row.topics
  const bullets = row.summary_bullets
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    name: String(row.name ?? 'New chat'),
    board: row.board != null ? String(row.board) : null,
    grade: row.grade != null ? String(row.grade) : null,
    status: String(row.status ?? 'active'),
    message_count: Number(row.message_count ?? 0),
    last_message: row.last_message != null ? String(row.last_message) : null,
    topics: Array.isArray(topics) ? (topics as string[]) : [],
    doubts_opened: Number(row.doubts_opened ?? 0),
    doubts_cleared: Number(row.doubts_cleared ?? 0),
    duration_minutes: Number(row.duration_minutes ?? 0),
    summary: row.summary != null ? String(row.summary) : null,
    summary_bullets: Array.isArray(bullets)
      ? (bullets as string[])
      : bullets == null
        ? null
        : [],
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
  }
}

function rowToMessage(row: Record<string, unknown>): ChatMessage {
  const role = row.role === 'assistant' ? 'assistant' : 'user'
  const fb = row.feedback
  const feedback: ChatMessage['feedback'] =
    fb === 'positive' || fb === 'negative' ? fb : null
  const pk = row.prompt_key
  return {
    id: String(row.id),
    session_id: String(row.session_id),
    user_id: String(row.user_id),
    role,
    content: String(row.content ?? ''),
    message_index: Number(row.message_index ?? 0),
    feedback,
    prompt_key: typeof pk === 'string' && pk.length > 0 ? pk : null,
    was_cache_hit: row.was_cache_hit === true,
    created_at: String(row.created_at ?? ''),
  }
}

export interface CreateSessionProfile {
  board: string | null
  grade: string | null
}

export async function createChatSession(
  userId: string,
  profile: CreateSessionProfile,
): Promise<ChatResult<ChatSession>> {
  try {
    const supabase = createClient()
    const now = new Date().toISOString()

    const { data: inserted, error: insertErr } = await supabase
      .from('chat_sessions')
      .insert({
        user_id: userId,
        board: profile.board,
        grade: profile.grade,
        status: 'active',
      })
      .select()
      .single()

    if (insertErr || !inserted) {
      console.error('createChatSession: insert', insertErr?.message)
      return fail('INSERT_SESSION', insertErr?.message ?? 'No row returned')
    }

    const { data: statsRow, error: statsReadErr } = await supabase
      .from('user_stats')
      .select('total_sessions')
      .eq('user_id', userId)
      .maybeSingle()

    if (statsReadErr) {
      console.error('createChatSession: read stats', statsReadErr.message)
      return fail('STATS_READ', statsReadErr.message)
    }

    if (!statsRow) {
      console.error('createChatSession: user_stats row missing for user', userId)
      return fail('STATS_MISSING', 'user_stats row not found')
    }

    const existing = statsRow as { total_sessions: number }
    const today = new Date().toISOString().split('T')[0]

    const { error: statsUpdateErr } = await supabase
      .from('user_stats')
      .update({
        total_sessions: existing.total_sessions + 1,
        last_active_date: today,
        updated_at: now,
      })
      .eq('user_id', userId)

    if (statsUpdateErr) {
      console.error('createChatSession: update stats', statsUpdateErr.message)
      return fail('STATS_UPDATE', statsUpdateErr.message)
    }

    return { success: true, data: rowToSession(inserted as Record<string, unknown>) }
  } catch (e) {
    console.error('createChatSession:', e)
    return fail('UNKNOWN', errMsg(e))
  }
}

export async function getChatSessions(
  userId: string,
): Promise<ChatResult<ChatSession[]>> {
  try {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('chat_sessions')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(20)

    if (error) {
      console.error('getChatSessions:', error.message)
      return fail('QUERY', error.message)
    }

    const rows = (data ?? []) as Record<string, unknown>[]
    return {
      success: true,
      data: rows.map(rowToSession),
    }
  } catch (e) {
    console.error('getChatSessions:', e)
    return fail('UNKNOWN', errMsg(e))
  }
}

export async function getChatMessages(
  sessionId: string,
  userId: string,
): Promise<ChatResult<ChatMessage[]>> {
  try {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('session_id', sessionId)
      .eq('user_id', userId)
      .order('message_index', { ascending: true })

    if (error) {
      console.error('getChatMessages:', error.message)
      return fail('QUERY', error.message)
    }

    const rows = (data ?? []) as Record<string, unknown>[]
    return {
      success: true,
      data: rows.map(rowToMessage),
    }
  } catch (e) {
    console.error('getChatMessages:', e)
    return fail('UNKNOWN', errMsg(e))
  }
}

export interface SaveMessageParams {
  sessionId: string
  userId: string
  role: 'user' | 'assistant'
  content: string
  messageIndex: number
}

export async function saveMessage(
  params: SaveMessageParams,
): Promise<ChatResult<ChatMessage>> {
  const { sessionId, userId, role, content, messageIndex } = params
  try {
    const supabase = createClient()

    const { data: inserted, error: insertErr } = await supabase
      .from('chat_messages')
      .insert({
        session_id: sessionId,
        user_id: userId,
        role,
        content,
        message_index: messageIndex,
      })
      .select()
      .single()

    if (insertErr || !inserted) {
      console.error('saveMessage: insert', insertErr?.message)
      return fail('INSERT_MESSAGE', insertErr?.message ?? 'No row returned')
    }

    const { data: sessionRow, error: sessErr } = await supabase
      .from('chat_sessions')
      .select('message_count')
      .eq('id', sessionId)
      .eq('user_id', userId)
      .maybeSingle()

    if (sessErr) {
      console.error('saveMessage: read session', sessErr.message)
      return fail('SESSION_READ', sessErr.message)
    }

    const prevCount = sessionRow?.message_count ?? 0
    const lastPreview = content.slice(0, 100)
    const now = new Date().toISOString()

    const { error: updErr } = await supabase
      .from('chat_sessions')
      .update({
        last_message: lastPreview,
        message_count: prevCount + 1,
        updated_at: now,
      })
      .eq('id', sessionId)
      .eq('user_id', userId)

    if (updErr) {
      console.error('saveMessage: update session', updErr.message)
      return fail('SESSION_UPDATE', updErr.message)
    }

    return {
      success: true,
      data: rowToMessage(inserted as Record<string, unknown>),
    }
  } catch (e) {
    console.error('saveMessage:', e)
    return fail('UNKNOWN', errMsg(e))
  }
}

export async function updateSessionName(
  sessionId: string,
  userId: string,
  name: string,
): Promise<ChatResult<void>> {
  const trimmed = name.trim().slice(0, 50)
  if (!trimmed) return { success: true, data: undefined }
  try {
    const supabase = createClient()

    const { data: current, error: readErr } = await supabase
      .from('chat_sessions')
      .select('name')
      .eq('id', sessionId)
      .eq('user_id', userId)
      .maybeSingle()

    if (readErr) {
      console.error('updateSessionName: read', readErr.message)
      return fail('READ', readErr.message)
    }

    const currentName = String(current?.name ?? '').trim()
    if (currentName !== 'New chat') {
      return { success: true, data: undefined }
    }

    const { error } = await supabase
      .from('chat_sessions')
      .update({ name: trimmed, updated_at: new Date().toISOString() })
      .eq('id', sessionId)
      .eq('user_id', userId)

    if (error) {
      console.error('updateSessionName:', error.message)
      return fail('UPDATE', error.message)
    }

    return { success: true, data: undefined }
  } catch (e) {
    console.error('updateSessionName:', e)
    return fail('UNKNOWN', errMsg(e))
  }
}

export async function archiveSession(
  sessionId: string,
  userId: string,
): Promise<ChatResult<void>> {
  try {
    const supabase = createClient()
    const { error } = await supabase
      .from('chat_sessions')
      .update({
        status: 'archived',
        updated_at: new Date().toISOString(),
      })
      .eq('id', sessionId)
      .eq('user_id', userId)

    if (error) {
      console.error('archiveSession:', error.message)
      return fail('UPDATE', error.message)
    }

    return { success: true, data: undefined }
  } catch (e) {
    console.error('archiveSession:', e)
    return fail('UNKNOWN', errMsg(e))
  }
}
