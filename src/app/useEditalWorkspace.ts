import { startTransition, useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'

import type { EditalExtraction } from '../lib/ai/edital-schema'
import { invokeIaExtraction } from '../lib/ai/invoke-ia-function'
import {
  loadWorkspaceSnapshot,
  persistIngestedEdital,
  saveReviewedExtraction,
  updateStudyTaskStatus,
  type ProjectSnapshot,
  type ReviewEdits,
  type StudyPlanConfig,
  type StudyTaskSnapshot,
} from '../lib/concurseiro-data'
import { supabase } from '../lib/supabase'
import {
  ingestEditalFile,
  type IngestEditalFileResult,
} from '../features/edital-upload/lib/ingest-edital-file'

type WorkspaceState = {
  busy: boolean
  dataLoading: boolean
  reviewSaving: boolean
  taskUpdatingId: string | null
  sourceLabel: string | null
  pastedText: string
  result: IngestEditalFileResult | null
  error: string | null
  notice: string | null
  recentProjects: ProjectSnapshot[]
  currentProject: ProjectSnapshot | null
  studyTasks: StudyTaskSnapshot[]
  savedExtraction: EditalExtraction | null
  savedWarnings: string[]
}

const defaultStudyPlan: StudyPlanConfig = {
  projectTitle: '',
  weeklyHours: 2,
  studyDays: [1, 2, 3, 4, 5],
  focusSubject: '',
}

const initialState: WorkspaceState = {
  busy: false,
  dataLoading: false,
  reviewSaving: false,
  taskUpdatingId: null,
  sourceLabel: null,
  pastedText: '',
  result: null,
  error: null,
  notice: null,
  recentProjects: [],
  currentProject: null,
  studyTasks: [],
  savedExtraction: null,
  savedWarnings: [],
}

export function useEditalWorkspace(session: Session | null) {
  const [state, setState] = useState<WorkspaceState>(initialState)
  const [studyPlan, setStudyPlan] = useState<StudyPlanConfig>(defaultStudyPlan)

  const loadSnapshot = useCallback(
    async (preferredProjectId?: string | null) => {
      if (!session?.user.id) {
        startTransition(() => {
          setState((current) => ({
            ...initialState,
            pastedText: current.pastedText,
            sourceLabel: current.sourceLabel,
          }))
          setStudyPlan(defaultStudyPlan)
        })
        return
      }

      setState((current) => ({
        ...current,
        dataLoading: true,
      }))

      try {
        const snapshot = await loadWorkspaceSnapshot(supabase, session.user.id, preferredProjectId)

        startTransition(() => {
          setState((current) => ({
            ...current,
            dataLoading: false,
            recentProjects: snapshot.projects,
            currentProject: snapshot.currentProject,
            studyTasks: snapshot.studyTasks,
            savedExtraction: snapshot.extraction,
            savedWarnings: snapshot.warnings,
          }))

          setStudyPlan((current) => ({
            projectTitle:
              current.projectTitle ||
              snapshot.currentProject?.title ||
              defaultStudyPlan.projectTitle,
            weeklyHours: snapshot.profile.weeklyHours,
            studyDays: snapshot.profile.studyDays,
            focusSubject: current.focusSubject || snapshot.profile.focusSubject,
          }))
        })
      } catch (error) {
        setState((current) => ({
          ...current,
          dataLoading: false,
          error:
            error instanceof Error
              ? error.message
              : 'Nao foi possivel carregar os dados do Concurseiro Pro.',
        }))
      }
    },
    [session?.user.id],
  )

  useEffect(() => {
    void loadSnapshot()
  }, [loadSnapshot])

  const processFile = useCallback(
    async (file: File) => {
      if (!session?.user) {
        setState((current) => ({
          ...current,
          error: 'Entre com email e senha para salvar o edital no seu espaco privado.',
        }))
        return
      }

      setState((current) => ({
        ...current,
        busy: true,
        sourceLabel: file.name,
        error: null,
        notice: null,
      }))

      const result = await ingestEditalFile({
        file,
        remoteExtraction: (request) => invokeIaExtraction(supabase, request),
      })

      try {
        const persisted = await persistIngestedEdital({
          supabase,
          user: session.user,
          file,
          result,
          config: studyPlan,
        })

        setState((current) => ({
          ...current,
          busy: false,
          result,
          notice: `Projeto salvo: ${persisted.project.title}. Cronograma inicial pronto para revisar.`,
          currentProject: persisted.project,
          studyTasks: persisted.studyTasks,
          savedExtraction: persisted.extraction,
          savedWarnings: persisted.warnings,
        }))

        await loadSnapshot(persisted.project.id)
      } catch (error) {
        setState((current) => ({
          ...current,
          busy: false,
          result,
          error:
            error instanceof Error
              ? error.message
              : 'O edital foi lido, mas falhou na etapa de persistencia.',
        }))
      }
    },
    [loadSnapshot, session?.user, studyPlan],
  )

  const processPastedText = useCallback(async () => {
    const normalized = state.pastedText.trim()
    if (!normalized) {
      setState((current) => ({
        ...current,
        error: 'Cole um trecho do edital antes de processar.',
      }))
      return
    }

    const file = new File([normalized], 'edital-colado.txt', {
      type: 'text/plain',
    })

    await processFile(file)
  }, [processFile, state.pastedText])

  const extraction: EditalExtraction | null =
    state.result?.extraction ?? state.savedExtraction ?? null
  const warnings = state.result?.warnings ?? state.savedWarnings

  const saveReview = useCallback(
    async (edits: ReviewEdits) => {
      if (!session?.user.id || !state.currentProject || !extraction) {
        setState((current) => ({
          ...current,
          error: 'Carregue um projeto e uma extracao antes de salvar a revisao.',
        }))
        return
      }

      setState((current) => ({
        ...current,
        reviewSaving: true,
        error: null,
        notice: null,
      }))

      try {
        const reviewed = await saveReviewedExtraction({
          supabase,
          userId: session.user.id,
          projectId: state.currentProject.id,
          currentExtraction: extraction,
          edits,
          config: studyPlan,
        })

        setState((current) => ({
          ...current,
          reviewSaving: false,
          currentProject: reviewed.project,
          studyTasks: reviewed.studyTasks,
          savedExtraction: reviewed.extraction,
          savedWarnings: reviewed.warnings,
          result: current.result
            ? {
                ...current.result,
                extraction: reviewed.extraction,
                warnings: reviewed.warnings,
              }
            : current.result,
          notice: 'Revisao salva e cronograma regenerado.',
        }))

        await loadSnapshot(reviewed.project.id)
      } catch (error) {
        setState((current) => ({
          ...current,
          reviewSaving: false,
          error:
            error instanceof Error
              ? error.message
              : 'Nao foi possivel salvar a revisao do edital.',
        }))
      }
    },
    [extraction, loadSnapshot, session?.user.id, state.currentProject, studyPlan],
  )

  const updateTaskStatus = useCallback(
    async (taskId: string, status: StudyTaskSnapshot['status']) => {
      if (!session?.user.id) {
        return
      }

      setState((current) => ({
        ...current,
        taskUpdatingId: taskId,
        error: null,
      }))

      try {
        const updatedTask = await updateStudyTaskStatus({
          supabase,
          userId: session.user.id,
          taskId,
          status,
        })

        setState((current) => ({
          ...current,
          taskUpdatingId: null,
          studyTasks: current.studyTasks.map((task) =>
            task.id === updatedTask.id ? updatedTask : task,
          ),
        }))
      } catch (error) {
        setState((current) => ({
          ...current,
          taskUpdatingId: null,
          error:
            error instanceof Error
              ? error.message
              : 'Nao foi possivel atualizar o bloco de estudo.',
        }))
      }
    },
    [session?.user.id],
  )

  return {
    ...state,
    extraction,
    warnings,
    studyPlan,
    isAuthenticated: Boolean(session?.user),
    updatePastedText: (value: string) =>
      setState((current) => ({
        ...current,
        pastedText: value,
        error: null,
      })),
    updateStudyPlan: <K extends keyof StudyPlanConfig>(key: K, value: StudyPlanConfig[K]) =>
      setStudyPlan((current) => ({
        ...current,
        [key]: value,
      })),
    toggleStudyDay: (day: number) =>
      setStudyPlan((current) => {
        const exists = current.studyDays.includes(day)
        const nextStudyDays = exists
          ? current.studyDays.filter((entry) => entry !== day)
          : [...current.studyDays, day].sort()

        return {
          ...current,
          studyDays: nextStudyDays.length > 0 ? nextStudyDays : current.studyDays,
        }
      }),
    processFile,
    processPastedText,
    saveReview,
    updateTaskStatus,
    selectProject: (projectId: string) => loadSnapshot(projectId),
    refreshWorkspace: () => loadSnapshot(state.currentProject?.id),
    resetWorkspace: () => {
      setState(initialState)
      setStudyPlan(defaultStudyPlan)
    },
  }
}
