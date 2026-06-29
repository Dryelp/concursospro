import type { SupabaseClient, User } from '@supabase/supabase-js'

import type { IngestEditalFileResult } from '../features/edital-upload/lib/ingest-edital-file'
import { normalizeEditalExtraction, type EditalExtraction } from './ai/edital-schema'
import type { Database, ExtractionStatus, ProjectStatus, SourceType } from './database.types'

type TypedSupabaseClient = SupabaseClient<any>

export type StudyPlanConfig = {
  projectTitle: string
  weeklyHours: number
  studyDays: number[]
  focusSubject: string
}

export type ProfilePreferences = {
  nome: string | null
  weeklyHours: number
  studyDays: number[]
  focusSubject: string
}

export type ProjectSnapshot = {
  id: string
  title: string
  board: string | null
  organization: string | null
  positionName: string | null
  examDate: string | null
  extractionStatus: ExtractionStatus
  status: ProjectStatus
  summary: string | null
  progress: number
  updatedAt: string
}

export type StudyTaskSnapshot = {
  id: string
  title: string
  scheduledFor: string
  durationMin: number
  taskType: Database['public']['Tables']['study_tasks']['Row']['task_type']
  status: Database['public']['Tables']['study_tasks']['Row']['status']
  notes: string | null
}

export type WorkspaceSnapshot = {
  profile: ProfilePreferences
  projects: ProjectSnapshot[]
  currentProject: ProjectSnapshot | null
  studyTasks: StudyTaskSnapshot[]
  extraction: EditalExtraction | null
  warnings: string[]
}

export type PersistedWorkspace = {
  project: ProjectSnapshot
  studyTasks: StudyTaskSnapshot[]
  extraction: EditalExtraction
  warnings: string[]
}

export type ReviewEdits = {
  title: string
  organization: string
  board: string
  positionName: string
  examDate: string
  summary: string
  topicsText: string
}

export type ReviewedWorkspace = {
  project: ProjectSnapshot
  studyTasks: StudyTaskSnapshot[]
  extraction: EditalExtraction
  warnings: string[]
}

const weekdayFallback = [1, 2, 3, 4, 5]

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => normalizeWhitespace(value)).filter(Boolean))]
}

function sanitizeStudyDays(studyDays: number[]): number[] {
  const normalized = [...new Set(studyDays.filter((day) => day >= 1 && day <= 7))].sort()
  return normalized.length > 0 ? normalized : weekdayFallback
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function extensionFromFileName(fileName: string): string {
  const cleanFileName = fileName.trim()
  const lastDot = cleanFileName.lastIndexOf('.')

  if (lastDot < 0 || lastDot === cleanFileName.length - 1) {
    return 'txt'
  }

  return cleanFileName.slice(lastDot + 1).toLowerCase()
}

function toHex(value: ArrayBuffer): string {
  return [...new Uint8Array(value)].map((item) => item.toString(16).padStart(2, '0')).join('')
}

async function sha256FromFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  return toHex(await crypto.subtle.digest('SHA-256', buffer))
}

function inferSourceType(result: IngestEditalFileResult): SourceType {
  if (result.classification.format === 'image') {
    return 'image'
  }

  if (result.classification.format === 'pdf') {
    return result.classification.isScannedCandidate ? 'pdf-scan' : 'pdf-textual'
  }

  return 'plain-text'
}

function monthIndexFromToken(token: string): number | null {
  const months: Record<string, number> = {
    jan: 1,
    janeiro: 1,
    fev: 2,
    fevereiro: 2,
    mar: 3,
    marco: 3,
    abril: 4,
    abr: 4,
    maio: 5,
    mai: 5,
    jun: 6,
    junho: 6,
    jul: 7,
    julho: 7,
    ago: 8,
    agosto: 8,
    set: 9,
    setembro: 9,
    out: 10,
    outubro: 10,
    nov: 11,
    novembro: 11,
    dez: 12,
    dezembro: 12,
  }

  return months[token] ?? null
}

function toIsoDate(value: string | null | undefined): string | null {
  if (!value) {
    return null
  }

  const normalized = value
    .normalize('NFD')
    .replace(/\p{Mark}/gu, '')
    .toLowerCase()
    .trim()

  if (!normalized) {
    return null
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return normalized
  }

  const numericMatch = normalized.match(/^(\d{1,2})[/. -](\d{1,2})[/. -](\d{2,4})$/)
  if (numericMatch) {
    const day = Number.parseInt(numericMatch[1], 10)
    const month = Number.parseInt(numericMatch[2], 10)
    const yearValue = Number.parseInt(numericMatch[3], 10)
    const year = yearValue < 100 ? 2000 + yearValue : yearValue

    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day
        .toString()
        .padStart(2, '0')}`
    }
  }

  const textMatch = normalized.match(
    /(\d{1,2})\s*(?:de\s+)?([a-z]+)\s*(?:de\s+)?(\d{4})/,
  )
  if (textMatch) {
    const day = Number.parseInt(textMatch[1], 10)
    const month = monthIndexFromToken(textMatch[2])
    const year = Number.parseInt(textMatch[3], 10)

    if (month) {
      return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day
        .toString()
        .padStart(2, '0')}`
    }
  }

  return null
}

function buildProjectTitle(result: IngestEditalFileResult, config: StudyPlanConfig): string {
  const customTitle = normalizeWhitespace(config.projectTitle)
  if (customTitle) {
    return customTitle
  }

  const extraction = result.extraction
  const opportunityRole = extraction.opportunities[0]?.role
  const organization = extraction.institution.name

  if (opportunityRole && organization) {
    return `${opportunityRole} - ${organization}`
  }

  if (extraction.title) {
    return extraction.title
  }

  return result.classification.fileName.replace(/\.[^.]+$/, '')
}

type SubjectDraft = {
  name: string
  syllabus: string[]
  priority: number
}

function buildSubjectDrafts(
  extraction: EditalExtraction,
  focusSubject: string,
): SubjectDraft[] {
  const normalizedFocus = focusSubject
    .normalize('NFD')
    .replace(/\p{Mark}/gu, '')
    .toLowerCase()
    .trim()

  const explicitSubjects = extraction.subjects.flatMap((subject) => {
    if (subject.role) {
      return [
        {
          name: subject.role,
          syllabus: uniqueStrings(subject.topics),
        },
      ]
    }

    return uniqueStrings(subject.topics).map((topic) => ({
      name: topic,
      syllabus: [topic],
    }))
  })

  const fallbackNames = uniqueStrings([
    normalizedFocus ? focusSubject : '',
    extraction.opportunities[0]?.role ?? '',
    extraction.organizer.name ?? '',
  ]).map((name) => ({
    name,
    syllabus: [name],
  }))

  const subjects = (explicitSubjects.length > 0 ? explicitSubjects : fallbackNames).filter(
    (subject) => subject.name.length >= 3,
  )

  if (subjects.length === 0) {
    return [
      {
        name: 'Leitura integral do edital',
        syllabus: ['Leitura integral do edital'],
        priority: 3,
      },
    ]
  }

  return subjects.map((subject) => {
    const normalizedName = subject.name
      .normalize('NFD')
      .replace(/\p{Mark}/gu, '')
      .toLowerCase()
    const priority = normalizedFocus && normalizedName.includes(normalizedFocus) ? 5 : 3

    return {
      name: subject.name,
      syllabus: uniqueStrings(subject.syllabus.length > 0 ? subject.syllabus : [subject.name]),
      priority,
    }
  })
}

function todayAtLocalMidnight(): Date {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return today
}

function addDays(baseDate: Date, days: number): Date {
  const value = new Date(baseDate)
  value.setDate(value.getDate() + days)
  return value
}

function toIsoCalendarDate(date: Date): string {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function toIsoWeekday(date: Date): number {
  const day = date.getDay()
  return day === 0 ? 7 : day
}

function buildUpcomingStudyDates(studyDays: number[], totalSlots: number): Date[] {
  const validStudyDays = sanitizeStudyDays(studyDays)
  const dates: Date[] = []
  let cursor = todayAtLocalMidnight()
  let safety = 0

  while (dates.length < totalSlots && safety < 90) {
    if (validStudyDays.includes(toIsoWeekday(cursor))) {
      dates.push(new Date(cursor))
    }

    cursor = addDays(cursor, 1)
    safety += 1
  }

  return dates
}

type CreatedSubject = {
  id: string
  name: string
}

function buildTaskRows(input: {
  projectId: string
  userId: string
  subjects: CreatedSubject[]
  weeklyHours: number
  studyDays: number[]
  focusSubject: string
  examDate: string | null
}): Database['public']['Tables']['study_tasks']['Insert'][] {
  const subjects = input.subjects.length > 0 ? input.subjects : [{ id: null, name: 'Plano geral' }]
  const prioritizedSubjects = [...subjects].sort((left, right) => {
    const leftFocused = left.name.toLowerCase().includes(input.focusSubject.toLowerCase().trim())
    const rightFocused = right.name.toLowerCase().includes(input.focusSubject.toLowerCase().trim())
    return Number(rightFocused) - Number(leftFocused)
  })

  const validStudyDays = sanitizeStudyDays(input.studyDays)
  const totalSlots = clamp(validStudyDays.length * 2, 6, 14)
  const minutesPerPrimaryBlock = clamp(
    Math.round((Math.max(4, input.weeklyHours) * 60) / validStudyDays.length),
    50,
    150,
  )

  const dates = buildUpcomingStudyDates(validStudyDays, totalSlots)
  const rows: Database['public']['Tables']['study_tasks']['Insert'][] = []

  dates.forEach((date, index) => {
    const subject = prioritizedSubjects[index % prioritizedSubjects.length]
    const scheduledFor = toIsoCalendarDate(date)
    const distanceToExam =
      input.examDate && /^\d{4}-\d{2}-\d{2}$/.test(input.examDate)
        ? Math.round(
            (new Date(`${input.examDate}T00:00:00`).getTime() - date.getTime()) / 86400000,
          )
        : null

    rows.push({
      project_id: input.projectId,
      subject_id: subject.id,
      user_id: input.userId,
      title: `Estudo profundo: ${subject.name}`,
      notes:
        distanceToExam !== null
          ? `Bloco guiado considerando ${distanceToExam} dias ate a prova.`
          : 'Bloco guiado pela primeira leitura do edital.',
      scheduled_for: scheduledFor,
      duration_min: minutesPerPrimaryBlock,
      task_type: index % 4 === 3 ? 'questions' : 'study',
      source: 'ai',
      status: 'pending',
      confidence: 0.72,
    })

    if (index % 2 === 1) {
      rows.push({
        project_id: input.projectId,
        subject_id: subject.id,
        user_id: input.userId,
        title: `Revisao ativa: ${subject.name}`,
        notes: 'Reforco curto para consolidar a memoria do bloco anterior.',
        scheduled_for: scheduledFor,
        duration_min: 30,
        task_type: 'revision',
        source: 'ai',
        status: 'pending',
        confidence: 0.66,
      })
    }
  })

  return rows
}

function extractionWarningsFromStructuredData(value: unknown): string[] {
  if (!value || typeof value !== 'object') {
    return []
  }

  const maybeWarnings = (value as { warnings?: unknown }).warnings
  if (!Array.isArray(maybeWarnings)) {
    return []
  }

  return maybeWarnings.filter((item): item is string => typeof item === 'string')
}

function extractionFromStructuredData(value: unknown): EditalExtraction | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const structured = value as { extraction?: unknown }
  const extractionSource = structured.extraction ?? value

  try {
    return normalizeEditalExtraction(extractionSource)
  } catch {
    return null
  }
}

function mapProjectRow(
  row: Database['public']['Tables']['exam_projects']['Row'],
): ProjectSnapshot {
  return {
    id: row.id,
    title: row.title,
    board: row.board,
    organization: row.organization,
    positionName: row.position_name,
    examDate: row.exam_date,
    extractionStatus: row.extraction_status,
    status: row.status,
    summary: row.summary,
    progress: row.progress,
    updatedAt: row.updated_at,
  }
}

function mapTaskRow(
  row: Database['public']['Tables']['study_tasks']['Row'],
): StudyTaskSnapshot {
  return {
    id: row.id,
    title: row.title,
    scheduledFor: row.scheduled_for,
    durationMin: row.duration_min,
    taskType: row.task_type,
    status: row.status,
    notes: row.notes,
  }
}

function defaultProfilePreferences(): ProfilePreferences {
  return {
    nome: null,
    weeklyHours: 12,
    studyDays: weekdayFallback,
    focusSubject: '',
  }
}

function assertSuccess(error: { message: string } | null, step: string) {
  if (error) {
    throw new Error(`${step}: ${error.message}`)
  }
}

export async function loadWorkspaceSnapshot(
  supabase: TypedSupabaseClient,
  userId: string,
  preferredProjectId?: string | null,
): Promise<WorkspaceSnapshot> {
  const [{ data: profileRow, error: profileError }, { data: projectRows, error: projectError }] =
    await Promise.all([
      supabase
        .from('profiles')
        .select('nome, hours_per_week, study_days, study_goal')
        .eq('id', userId)
        .maybeSingle(),
      supabase
        .from('exam_projects')
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(5),
    ])

  assertSuccess(profileError, 'Falha ao carregar perfil')
  assertSuccess(projectError, 'Falha ao carregar projetos')

  const projects = (projectRows ?? []).map(mapProjectRow)
  const currentProject =
    projects.find((project) => project.id === preferredProjectId) ?? projects[0] ?? null

  if (!currentProject) {
    return {
      profile: profileRow
        ? {
            nome: profileRow.nome,
            weeklyHours: profileRow.hours_per_week,
            studyDays: sanitizeStudyDays(profileRow.study_days),
            focusSubject: profileRow.study_goal ?? '',
          }
        : defaultProfilePreferences(),
      projects: [],
      currentProject: null,
      studyTasks: [],
      extraction: null,
      warnings: [],
    }
  }

  const today = toIsoCalendarDate(todayAtLocalMidnight())
  const [
    { data: taskRows, error: taskError },
    { data: extractionRows, error: extractionError },
  ] = await Promise.all([
    supabase
      .from('study_tasks')
      .select('*')
      .eq('project_id', currentProject.id)
      .gte('scheduled_for', today)
      .order('scheduled_for', { ascending: true })
      .limit(8),
    supabase
      .from('edital_extraction_runs')
      .select('structured_data')
      .eq('project_id', currentProject.id)
      .order('created_at', { ascending: false })
      .limit(1),
  ])

  assertSuccess(taskError, 'Falha ao carregar cronograma')
  assertSuccess(extractionError, 'Falha ao carregar extração')

  const latestStructuredData = extractionRows?.[0]?.structured_data ?? null
  const extraction = extractionFromStructuredData(latestStructuredData)
  const warnings = extractionWarningsFromStructuredData(latestStructuredData)

  return {
    profile: profileRow
      ? {
          nome: profileRow.nome,
          weeklyHours: profileRow.hours_per_week,
          studyDays: sanitizeStudyDays(profileRow.study_days),
          focusSubject: profileRow.study_goal ?? '',
        }
      : defaultProfilePreferences(),
    projects,
    currentProject,
    studyTasks: (taskRows ?? []).map(mapTaskRow),
    extraction,
    warnings,
  }
}

export async function persistIngestedEdital(input: {
  supabase: TypedSupabaseClient
  user: User
  file: File
  result: IngestEditalFileResult
  config: StudyPlanConfig
}): Promise<PersistedWorkspace> {
  const { supabase, user, file, result, config } = input
  const weeklyHours = clamp(Math.round(config.weeklyHours || 12), 4, 60)
  const studyDays = sanitizeStudyDays(config.studyDays)
  const focusSubject = normalizeWhitespace(config.focusSubject)
  const projectTitle = buildProjectTitle(result, config)
  const examDate = toIsoDate(result.extraction.exam.examDate)
  const sourceType = inferSourceType(result)
  const extractionStatus: ExtractionStatus =
    result.warnings.length > 0 || result.extraction.confidence < 0.82 ? 'review' : 'ready'
  const progress = extractionStatus === 'ready' ? 26 : 18

  const { error: profileUpsertError } = await supabase.from('profiles').upsert(
    {
      id: user.id,
      nome: user.user_metadata.nome ?? user.email?.split('@')[0] ?? null,
      hours_per_week: weeklyHours,
      study_days: studyDays,
      study_goal: focusSubject || null,
    },
    { onConflict: 'id' },
  )
  assertSuccess(profileUpsertError, 'Falha ao salvar preferencias do perfil')

  const { data: projectRow, error: projectError } = await supabase
    .from('exam_projects')
    .insert({
      user_id: user.id,
      title: projectTitle,
      organization: result.extraction.institution.name,
      board: result.extraction.organizer.name,
      position_name: result.extraction.opportunities[0]?.role ?? null,
      exam_date: examDate,
      source_type: sourceType,
      status: 'ready',
      extraction_status: extractionStatus,
      progress,
      study_hours_per_week: weeklyHours,
      study_days: studyDays,
      focus_subject: focusSubject || null,
      summary: result.extraction.summary ?? null,
    })
    .select('*')
    .single()
  assertSuccess(projectError, 'Falha ao criar projeto do concurso')
  if (!projectRow) {
    throw new Error('Falha ao criar projeto do concurso: resposta vazia do banco.')
  }

  const sha256 = await sha256FromFile(file)
  const extension = extensionFromFileName(file.name)
  const storagePath = `${user.id}/${projectRow.id}/${sha256}.${extension}`
  const artifactPath = `${user.id}/${projectRow.id}/${sha256}-extraction.json`

  const { error: fileUploadError } = await supabase.storage
    .from('edital-private')
    .upload(storagePath, file, {
      upsert: false,
      contentType: file.type || 'application/octet-stream',
    })
  assertSuccess(fileUploadError, 'Falha ao enviar edital para o storage privado')

  const artifactPayload = {
    projectTitle,
    provider: result.provider,
    warnings: result.warnings,
    classification: result.classification,
    extraction: result.extraction,
    heuristicExtraction: result.heuristicExtraction,
    pageCount: result.pageCount,
  }

  const { error: artifactUploadError } = await supabase.storage
    .from('ai-artifacts-private')
    .upload(
      artifactPath,
      new Blob([JSON.stringify(artifactPayload, null, 2)], {
        type: 'application/json',
      }),
      {
        upsert: false,
        contentType: 'application/json',
      },
    )
  assertSuccess(artifactUploadError, 'Falha ao salvar artefato da extração')

  const { data: editalFileRow, error: editalFileError } = await supabase
    .from('edital_files')
    .insert({
      project_id: projectRow.id,
      user_id: user.id,
      original_name: file.name,
      mime_type: file.type || 'application/octet-stream',
      size_bytes: file.size,
      sha256,
      storage_path: storagePath,
      source_type: sourceType,
      status: 'ready',
    })
    .select('*')
    .single()
  assertSuccess(editalFileError, 'Falha ao registrar arquivo do edital')
  if (!editalFileRow) {
    throw new Error('Falha ao registrar arquivo do edital: resposta vazia do banco.')
  }

  const structuredData = {
    extraction: result.extraction,
    warnings: result.warnings,
    provider: result.provider,
    classification: result.classification,
    pageCount: result.pageCount,
  }

  const { data: extractionRunRow, error: extractionRunError } = await supabase
    .from('edital_extraction_runs')
    .insert({
      edital_file_id: editalFileRow.id,
      project_id: projectRow.id,
      user_id: user.id,
      status: extractionStatus,
      model: result.provider === 'heuristic' ? null : result.provider,
      prompt_version: 'v1',
      classifier: `${result.classification.format}:${result.classification.documentKind}`,
      summary_md: result.extraction.summary ?? null,
      structured_data: structuredData,
      artifact_path: artifactPath,
      raw_text: result.textContent,
      tokens_in: 0,
      tokens_out: 0,
      estimated_cost: 0,
    })
    .select('*')
    .single()
  assertSuccess(extractionRunError, 'Falha ao registrar extração do edital')
  if (!extractionRunRow) {
    throw new Error('Falha ao registrar extração do edital: resposta vazia do banco.')
  }

  const subjectDrafts = buildSubjectDrafts(result.extraction, focusSubject)
  const { data: subjectRows, error: subjectError } = await supabase
    .from('subjects')
    .insert(
      subjectDrafts.map((subject) => ({
        project_id: projectRow.id,
        user_id: user.id,
        name: subject.name,
        priority: subject.priority,
        origin: 'extracted',
        source_pages: [],
        confidence: result.extraction.confidence,
        topic_count: subject.syllabus.length,
        mastery: 0,
        syllabus: subject.syllabus,
      })),
    )
    .select('id, name')
  assertSuccess(subjectError, 'Falha ao salvar disciplinas iniciais')

  const createdSubjects = (subjectRows ?? []).map((row) => ({
    id: row.id,
    name: row.name,
  }))

  const taskRows = buildTaskRows({
    projectId: projectRow.id,
    userId: user.id,
    subjects: createdSubjects,
    weeklyHours,
    studyDays,
    focusSubject,
    examDate,
  })

  const { data: insertedTasks, error: taskError } = await supabase
    .from('study_tasks')
    .insert(taskRows)
    .select('*')
  assertSuccess(taskError, 'Falha ao gerar cronograma inicial')

  const sectionRows = [
    ...(result.extraction.summary
      ? [
          {
            extraction_run_id: extractionRunRow.id,
            project_id: projectRow.id,
            user_id: user.id,
            section_title: 'Resumo executivo',
            page_from: null,
            page_to: null,
            confidence: result.extraction.confidence,
            content: result.extraction.summary,
          },
        ]
      : []),
    ...result.extraction.evidence.slice(0, 8).map((evidence) => ({
      extraction_run_id: extractionRunRow.id,
      project_id: projectRow.id,
      user_id: user.id,
      section_title: evidence.field,
      page_from: evidence.page,
      page_to: evidence.page,
      confidence: result.extraction.confidence,
      content: evidence.excerpt,
    })),
  ]

  if (sectionRows.length > 0) {
    const { error: sectionError } = await supabase.from('edital_sections').insert(sectionRows)
    assertSuccess(sectionError, 'Falha ao registrar trechos auditaveis do edital')
  }

  const insertedTaskSnapshots = (insertedTasks ?? []).map(mapTaskRow)

  const reviewRows = createdSubjects.slice(0, 4).map((subject, index) => ({
    project_id: projectRow.id,
    subject_id: subject.id,
    study_task_id: insertedTasks?.[index]?.id ?? null,
    user_id: user.id,
    title: `Revisar ${subject.name}`,
    next_review_at: toIsoCalendarDate(addDays(todayAtLocalMidnight(), index + 1)),
    last_reviewed_at: null,
    interval_days: index + 1,
    ease_factor: 2.5,
    status: 'active' as const,
  }))

  if (reviewRows.length > 0) {
    const { error: reviewError } = await supabase.from('review_items').insert(reviewRows)
    assertSuccess(reviewError, 'Falha ao criar revisoes iniciais')
  }

  return {
    project: mapProjectRow(projectRow),
    studyTasks: insertedTaskSnapshots,
    extraction: result.extraction,
    warnings: result.warnings,
  }
}

export async function saveReviewedExtraction(input: {
  supabase: TypedSupabaseClient
  userId: string
  projectId: string
  currentExtraction: EditalExtraction
  edits: ReviewEdits
  config: StudyPlanConfig
}): Promise<ReviewedWorkspace> {
  const { supabase, userId, projectId, currentExtraction, edits, config } = input
  const title = normalizeWhitespace(edits.title) || currentExtraction.title || 'Concurso sem titulo'
  const organization = normalizeWhitespace(edits.organization)
  const board = normalizeWhitespace(edits.board)
  const positionName = normalizeWhitespace(edits.positionName)
  const examDate = toIsoDate(edits.examDate) ?? toIsoDate(currentExtraction.exam.examDate)
  const summary = normalizeWhitespace(edits.summary)
  const topics = uniqueStrings(
    edits.topicsText
      .split(/\r?\n|;/)
      .map((topic) => topic.replace(/^[-*]\s*/, '')),
  ).slice(0, 80)

  const reviewedExtraction = normalizeEditalExtraction({
    ...currentExtraction,
    title,
    summary: summary || currentExtraction.summary,
    institution: {
      ...currentExtraction.institution,
      name: organization || currentExtraction.institution.name,
    },
    organizer: {
      ...currentExtraction.organizer,
      name: board || currentExtraction.organizer.name,
    },
    exam: {
      ...currentExtraction.exam,
      examDate: edits.examDate || currentExtraction.exam.examDate,
    },
    opportunities: positionName
      ? [
          {
            role: positionName,
            specialty: currentExtraction.opportunities[0]?.specialty ?? null,
            vacancies: currentExtraction.opportunities[0]?.vacancies ?? null,
            reserveVacancies: currentExtraction.opportunities[0]?.reserveVacancies ?? null,
            salary: currentExtraction.opportunities[0]?.salary ?? null,
            workload: currentExtraction.opportunities[0]?.workload ?? null,
            location: currentExtraction.opportunities[0]?.location ?? null,
            requirements: currentExtraction.opportunities[0]?.requirements ?? [],
          },
          ...currentExtraction.opportunities.slice(1),
        ]
      : currentExtraction.opportunities,
    subjects:
      topics.length > 0
        ? [
            {
              role: positionName || currentExtraction.subjects[0]?.role,
              topics,
            },
          ]
        : currentExtraction.subjects,
    warnings: currentExtraction.warnings.filter(
      (warning) => !/heuristica local|conteudo programatico/i.test(warning),
    ),
    confidence: Math.max(currentExtraction.confidence, 0.9),
  })

  const { data: latestRun, error: latestRunError } = await supabase
    .from('edital_extraction_runs')
    .select('id, structured_data')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  assertSuccess(latestRunError, 'Falha ao localizar extracao para revisao')

  const structuredData = {
    ...((latestRun?.structured_data && typeof latestRun.structured_data === 'object'
      ? latestRun.structured_data
      : {}) as Record<string, unknown>),
    extraction: reviewedExtraction,
    warnings: reviewedExtraction.warnings,
    reviewedAt: new Date().toISOString(),
    reviewedBy: userId,
  }

  const [{ data: projectRow, error: projectError }, { error: runError }] = await Promise.all([
    supabase
      .from('exam_projects')
      .update({
        title,
        organization: organization || reviewedExtraction.institution.name,
        board: board || reviewedExtraction.organizer.name,
        position_name: positionName || (reviewedExtraction.opportunities[0]?.role ?? null),
        exam_date: examDate,
        extraction_status: 'ready',
        status: 'ready',
        progress: 46,
        study_hours_per_week: clamp(Math.round(config.weeklyHours || 12), 4, 60),
        study_days: sanitizeStudyDays(config.studyDays),
        focus_subject: normalizeWhitespace(config.focusSubject) || null,
        summary: reviewedExtraction.summary,
      })
      .eq('id', projectId)
      .eq('user_id', userId)
      .select('*')
      .single(),
    latestRun
      ? supabase
          .from('edital_extraction_runs')
          .update({
            status: 'ready',
            structured_data: structuredData,
            summary_md: reviewedExtraction.summary,
          })
          .eq('id', latestRun.id)
          .eq('user_id', userId)
      : Promise.resolve({ error: null }),
  ])
  assertSuccess(projectError, 'Falha ao salvar revisao do projeto')
  assertSuccess(runError, 'Falha ao salvar revisao da extracao')
  if (!projectRow) {
    throw new Error('Falha ao salvar revisao: resposta vazia do banco.')
  }

  const subjectDrafts = buildSubjectDrafts(reviewedExtraction, config.focusSubject)
  const today = toIsoCalendarDate(todayAtLocalMidnight())

  const [{ error: taskDeleteError }, { error: subjectDeleteError }] = await Promise.all([
    supabase
      .from('study_tasks')
      .delete()
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .neq('status', 'done')
      .eq('source', 'ai')
      .gte('scheduled_for', today),
    supabase.from('subjects').delete().eq('project_id', projectId).eq('user_id', userId),
  ])
  assertSuccess(taskDeleteError, 'Falha ao limpar cronograma anterior')
  assertSuccess(subjectDeleteError, 'Falha ao limpar disciplinas anteriores')

  const { data: subjectRows, error: subjectError } = await supabase
    .from('subjects')
    .insert(
      subjectDrafts.map((subject) => ({
        project_id: projectId,
        user_id: userId,
        name: subject.name,
        priority: subject.priority,
        origin: 'manual',
        source_pages: [],
        confidence: reviewedExtraction.confidence,
        topic_count: subject.syllabus.length,
        mastery: 0,
        syllabus: subject.syllabus,
      })),
    )
    .select('id, name')
  assertSuccess(subjectError, 'Falha ao recriar disciplinas revisadas')

  const createdSubjects = (subjectRows ?? []).map((row) => ({
    id: row.id,
    name: row.name,
  }))

  const taskRows = buildTaskRows({
    projectId,
    userId,
    subjects: createdSubjects,
    weeklyHours: clamp(Math.round(config.weeklyHours || 12), 4, 60),
    studyDays: sanitizeStudyDays(config.studyDays),
    focusSubject: normalizeWhitespace(config.focusSubject),
    examDate,
  })

  const { data: insertedTasks, error: taskError } = await supabase
    .from('study_tasks')
    .insert(taskRows)
    .select('*')
  assertSuccess(taskError, 'Falha ao regenerar cronograma revisado')

  return {
    project: mapProjectRow(projectRow),
    studyTasks: (insertedTasks ?? []).map(mapTaskRow),
    extraction: reviewedExtraction,
    warnings: reviewedExtraction.warnings,
  }
}

export async function updateStudyTaskStatus(input: {
  supabase: TypedSupabaseClient
  userId: string
  taskId: string
  status: StudyTaskSnapshot['status']
}): Promise<StudyTaskSnapshot> {
  const { data, error } = await input.supabase
    .from('study_tasks')
    .update({ status: input.status })
    .eq('id', input.taskId)
    .eq('user_id', input.userId)
    .select('*')
    .single()

  assertSuccess(error, 'Falha ao atualizar bloco de estudo')
  if (!data) {
    throw new Error('Falha ao atualizar bloco de estudo: resposta vazia do banco.')
  }

  return mapTaskRow(data)
}
