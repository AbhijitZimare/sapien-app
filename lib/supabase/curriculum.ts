import { createAdminClient } from '@/lib/supabase/admin'
import type {
  CurriculumBoard,
  CurriculumChapter,
  CurriculumMicrotopic,
  CurriculumModule,
  CurriculumNode,
  CurriculumSubtopic,
  CurriculumSubject,
  CurriculumTopic,
  CurriculumTree,
} from '@/lib/types/database'

const curriculumCache = new Map<string, CurriculumTree>()

function cacheKey(boardCode: string, grade: string, subjectCode: string): string {
  return `${boardCode.trim().toUpperCase()}-${grade.trim()}-${subjectCode
    .trim()
    .toUpperCase()}`
}

export async function getCurriculumTree(
  boardCode: string,
  grade: string,
  subjectCode: string,
): Promise<CurriculumTree | null> {
  const key = cacheKey(boardCode, grade, subjectCode)
  const cached = curriculumCache.get(key)
  if (cached) return cached

  try {
    const admin = createAdminClient()

    const { data: boardData, error: boardError } = await admin
      .from('curriculum_boards')
      .select('*')
      .eq('code', boardCode.trim().toUpperCase())
      .maybeSingle()

    if (boardError || !boardData) return null
    const board = boardData as CurriculumBoard

    const { data: subjectData, error: subjectError } = await admin
      .from('curriculum_subjects')
      .select('*')
      .eq('board_id', board.id)
      .eq('grade', grade.trim())
      .eq('code', subjectCode.trim().toUpperCase())
      .eq('is_active', true)
      .maybeSingle()

    if (subjectError || !subjectData) return null
    const subject = subjectData as CurriculumSubject

    const { data: modulesData, error: modulesError } = await admin
      .from('curriculum_modules')
      .select('*')
      .eq('subject_id', subject.id)
      .order('position', { ascending: true })

    if (modulesError) return null
    const modules = (modulesData ?? []) as CurriculumModule[]

    const treeModules: CurriculumTree['modules'] = []

    for (const moduleRow of modules) {
      const { data: chaptersData, error: chaptersError } = await admin
        .from('curriculum_chapters')
        .select('*')
        .eq('module_id', moduleRow.id)
        .order('position', { ascending: true })

      if (chaptersError) return null
      const chapters = (chaptersData ?? []) as CurriculumChapter[]

      const treeChapters: CurriculumTree['modules'][number]['chapters'] = []

      for (const chapterRow of chapters) {
        const { data: topicsData, error: topicsError } = await admin
          .from('curriculum_topics')
          .select('*')
          .eq('chapter_id', chapterRow.id)
          .eq('is_active', true)
          .order('position', { ascending: true })

        if (topicsError) return null
        const topics = (topicsData ?? []) as CurriculumTopic[]
        const treeTopics: CurriculumTree['modules'][number]['chapters'][number]['topics'] =
          []

        for (const topicRow of topics) {
          const { data: subtopicsData, error: subtopicsError } = await admin
            .from('curriculum_subtopics')
            .select('*')
            .eq('topic_id', topicRow.id)
            .eq('is_active', true)
            .order('position', { ascending: true })

          if (subtopicsError) return null
          const subtopics = (subtopicsData ?? []) as CurriculumSubtopic[]

          const treeSubtopics: CurriculumTree['modules'][number]['chapters'][number]['topics'][number]['subtopics'] =
            []

          for (const subtopicRow of subtopics) {
            const { data: microData, error: microError } = await admin
              .from('curriculum_microtopics')
              .select('*')
              .eq('subtopic_id', subtopicRow.id)
              .eq('is_active', true)
              .order('position', { ascending: true })

            if (microError) return null
            const microtopics = (microData ?? []) as CurriculumMicrotopic[]

            treeSubtopics.push({
              name: subtopicRow.name,
              microtopics: microtopics.map((m) => m.name),
            })
          }

          treeTopics.push({
            name: topicRow.name,
            subtopics: treeSubtopics,
          })
        }

        treeChapters.push({
          name: chapterRow.name,
          topics: treeTopics,
        })
      }

      treeModules.push({
        name: moduleRow.name,
        marks_weightage: moduleRow.marks_weightage,
        chapters: treeChapters,
      })
    }

    const tree: CurriculumTree = {
      board: board.code,
      grade: subject.grade,
      subject: subject.name,
      modules: treeModules,
    }

    curriculumCache.set(key, tree)
    return tree
  } catch {
    return null
  }
}

export async function getCurriculumNodes(
  boardCode: string,
  grade: string,
  subjectCode: string,
): Promise<CurriculumNode[]> {
  try {
    const tree = await getCurriculumTree(boardCode, grade, subjectCode)
    if (!tree) return []

    const nodes: CurriculumNode[] = []

    for (const moduleItem of tree.modules) {
      nodes.push({
        type: 'module',
        id: `module:${moduleItem.name}`,
        name: moduleItem.name,
        path: moduleItem.name,
        chapter: '',
        module: moduleItem.name,
      })

      for (const chapterItem of moduleItem.chapters) {
        const chapterPath = `${moduleItem.name} > ${chapterItem.name}`
        nodes.push({
          type: 'chapter',
          id: `chapter:${chapterItem.name}`,
          name: chapterItem.name,
          path: chapterPath,
          chapter: chapterItem.name,
          module: moduleItem.name,
        })

        for (const topicItem of chapterItem.topics) {
          const topicPath = `${chapterPath} > ${topicItem.name}`
          nodes.push({
            type: 'topic',
            id: `topic:${topicItem.name}`,
            name: topicItem.name,
            path: topicPath,
            chapter: chapterItem.name,
            module: moduleItem.name,
          })

          for (const subtopicItem of topicItem.subtopics) {
            const subtopicPath = `${topicPath} > ${subtopicItem.name}`
            nodes.push({
              type: 'subtopic',
              id: `subtopic:${subtopicItem.name}`,
              name: subtopicItem.name,
              path: subtopicPath,
              chapter: chapterItem.name,
              module: moduleItem.name,
            })

            for (const microtopicName of subtopicItem.microtopics) {
              nodes.push({
                type: 'microtopic',
                id: `microtopic:${microtopicName}`,
                name: microtopicName,
                path: `${subtopicPath} > ${microtopicName}`,
                chapter: chapterItem.name,
                module: moduleItem.name,
              })
            }
          }
        }
      }
    }

    return nodes
  } catch {
    return []
  }
}

function normalizeWords(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

export function findCurriculumNode(
  conceptName: string,
  nodes: CurriculumNode[],
): CurriculumNode | null {
  const needle = conceptName.trim().toLowerCase()
  if (!needle || nodes.length === 0) return null

  for (const node of nodes) {
    if (node.name.trim().toLowerCase() === needle) {
      return node
    }
  }

  for (const node of nodes) {
    const nodeName = node.name.trim().toLowerCase()
    if (needle.includes(nodeName) || nodeName.includes(needle)) {
      return node
    }
  }

  const needleWords = normalizeWords(needle)
  let best: { node: CurriculumNode; score: number } | null = null

  for (const node of nodes) {
    const nodeWords = normalizeWords(node.name)
    if (nodeWords.length === 0 || needleWords.length === 0) continue

    let overlap = 0
    for (const w of needleWords) {
      if (nodeWords.includes(w)) overlap += 1
    }
    const denom = Math.max(nodeWords.length, needleWords.length)
    const score = overlap / denom

    if (score >= 0.5 && (!best || score > best.score)) {
      best = { node, score }
    }
  }

  return best?.node ?? null
}

export async function getChapterTopics(
  boardCode: string,
  grade: string,
  subjectCode: string,
  chapterName: string,
): Promise<CurriculumTopic[]> {
  try {
    const tree = await getCurriculumTree(boardCode, grade, subjectCode)
    if (!tree) return []

    const needle = chapterName.trim().toLowerCase()
    for (const moduleItem of tree.modules) {
      const chapter = moduleItem.chapters.find((c) =>
        c.name.toLowerCase().includes(needle),
      )
      if (!chapter) continue

      return chapter.topics.map((t, idx) => ({
        id: `topic:${moduleItem.name}:${chapter.name}:${t.name}`,
        chapter_id: `chapter:${chapter.name}`,
        name: t.name,
        position: idx + 1,
        is_active: true,
        created_at: '',
      }))
    }

    return []
  } catch {
    return []
  }
}

export async function getPrerequisites(
  subtopicId: string,
): Promise<CurriculumSubtopic[]> {
  try {
    const admin = createAdminClient()
    const { data: prereqRows, error: prereqError } = await admin
      .from('curriculum_prerequisites')
      .select('requires_subtopic_id')
      .eq('subtopic_id', subtopicId)

    if (prereqError || !prereqRows || prereqRows.length === 0) return []

    const ids = prereqRows
      .map((r) => (r as { requires_subtopic_id?: string }).requires_subtopic_id)
      .filter((id): id is string => Boolean(id))

    if (ids.length === 0) return []

    const { data: subtopics, error: subtopicsError } = await admin
      .from('curriculum_subtopics')
      .select('*')
      .in('id', ids)

    if (subtopicsError || !subtopics) return []
    return subtopics as CurriculumSubtopic[]
  } catch {
    return []
  }
}
