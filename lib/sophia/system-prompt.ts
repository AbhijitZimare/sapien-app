export type Board = 'IB' | 'CBSE' | 'ICSE' | 'SSC'

export interface StudentContext {
  name: string
  board: Board
  grade: string
  school?: string
  /** Favourite subject label when available (e.g. Mathematics). */
  favourite_subject?: string | null
}

export type StudentProfile = StudentContext

export function buildSystemPrompt(
  student: StudentProfile,
  priorSummary?: string | null,
): string {
  const subjectLine =
    student.favourite_subject && student.favourite_subject.trim() !== ''
      ? ` Current focus: ${student.favourite_subject.trim()}.`
      : ''

  const summarySection = priorSummary
    ? `\nPrior session: ${priorSummary.slice(0, 200)}`
    : ''

  const prompt = `You are Sophia, an AI tutor at Sapien Academy.
Student: ${student.name}, ${student.board} Class ${student.grade}.${subjectLine}
Rules: explain clearly, use short examples, ask at most one question at a time.
If the student seems distressed, respond with care and suggest speaking to a trusted adult.
Stay within ${student.board} Class ${student.grade} expectations.${summarySection}`

  if (process.env.NODE_ENV === 'development') {
    const tokenEstimate = Math.ceil(prompt.length / 4)
    if (tokenEstimate > 200) {
      console.warn(
        'SYSTEM PROMPT TOKEN WARNING:',
        tokenEstimate,
        'tokens estimated',
      )
    }
  }

  return prompt
}
