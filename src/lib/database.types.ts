export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]
type Table<Row, Insert, Update = Partial<Insert>> = { Row: Row; Insert: Insert; Update: Update; Relationships: [] }

export type ProjectStatus = 'draft' | 'processing' | 'ready' | 'archived'
export type ExtractionStatus = 'pending' | 'processing' | 'review' | 'ready' | 'failed'
export type TaskStatus = 'pending' | 'done' | 'skipped' | 'delayed'
export type TaskType = 'study' | 'revision' | 'questions' | 'mock' | 'material'

export type Database = {
  public: {
    Tables: {
      profiles: Table<{
        id: string; nome: string | null; hours_per_week: number; study_days: number[]
        focus_mode: string; exam_stage: string; study_goal: string | null
        created_at: string; updated_at: string
      }, {
        id: string; nome?: string | null; hours_per_week?: number; study_days?: number[]
        focus_mode?: string; exam_stage?: string; study_goal?: string | null
      }>
      exam_projects: Table<{
        id: string; user_id: string; title: string; organization: string | null
        board: string | null; position_name: string | null; exam_date: string | null
        source_type: 'pdf-textual' | 'pdf-scan' | 'image' | 'plain-text'
        status: ProjectStatus; extraction_status: ExtractionStatus; progress: number
        study_hours_per_week: number; study_days: number[]; focus_subject: string | null
        summary: string | null; created_at: string; updated_at: string
      }, {
        id?: string; user_id: string; title: string; organization?: string | null
        board?: string | null; position_name?: string | null; exam_date?: string | null
        source_type?: 'pdf-textual' | 'pdf-scan' | 'image' | 'plain-text'
        status?: ProjectStatus; extraction_status?: ExtractionStatus; progress?: number
        study_hours_per_week?: number; study_days?: number[]; focus_subject?: string | null
        summary?: string | null
      }>
      subjects: Table<{
        id: string; project_id: string; user_id: string; name: string; weight: number | null
        priority: number; origin: 'manual' | 'extracted' | 'merged'; source_pages: number[]
        confidence: number | null; topic_count: number; mastery: number; syllabus: Json
        created_at: string; updated_at: string
      }, {
        id?: string; project_id: string; user_id: string; name: string; weight?: number | null
        priority?: number; origin?: 'manual' | 'extracted' | 'merged'; source_pages?: number[]
        confidence?: number | null; topic_count?: number; mastery?: number; syllabus?: Json
      }>
      study_tasks: Table<{
        id: string; project_id: string; subject_id: string | null; user_id: string; title: string
        notes: string | null; scheduled_for: string; duration_min: number; task_type: TaskType
        source: 'manual' | 'ai' | 'carry-over'; status: TaskStatus; confidence: number | null
        created_at: string; updated_at: string
      }, {
        id?: string; project_id: string; subject_id?: string | null; user_id: string; title: string
        notes?: string | null; scheduled_for: string; duration_min?: number; task_type?: TaskType
        source?: 'manual' | 'ai' | 'carry-over'; status?: TaskStatus; confidence?: number | null
      }>
      review_items: Table<{
        id: string; project_id: string; subject_id: string | null; study_task_id: string | null
        user_id: string; title: string; next_review_at: string; last_reviewed_at: string | null
        interval_days: number; ease_factor: number; status: 'active' | 'done' | 'archived'
        repetitions: number; last_score: number | null
        created_at: string; updated_at: string
      }, {
        id?: string; project_id: string; subject_id?: string | null; study_task_id?: string | null
        user_id: string; title: string; next_review_at: string; last_reviewed_at?: string | null
        interval_days?: number; ease_factor?: number; status?: 'active' | 'done' | 'archived'
        repetitions?: number; last_score?: number | null
      }>
      flashcard_decks: Table<{
        id: string; project_id: string; subject_id: string | null; user_id: string
        name: string; description: string | null; created_at: string; updated_at: string
      }, {
        id?: string; project_id: string; subject_id?: string | null; user_id: string
        name: string; description?: string | null
      }>
      flashcards: Table<{
        id: string; deck_id: string; project_id: string; subject_id: string | null; user_id: string
        front: string; back: string; next_review_at: string | null; last_reviewed_at: string | null
        interval_days: number; ease_factor: number; suspended: boolean; created_at: string; updated_at: string
        repetitions: number; last_score: number | null
      }, {
        id?: string; deck_id: string; project_id: string; subject_id?: string | null; user_id: string
        front: string; back: string; next_review_at?: string | null; last_reviewed_at?: string | null
        interval_days?: number; ease_factor?: number; suspended?: boolean
        repetitions?: number; last_score?: number | null
      }>
      materials: Table<{
        id: string; project_id: string; subject_id: string | null; user_id: string; title: string
        type: 'file' | 'link' | 'note' | 'ai-summary'; storage_path: string | null
        url: string | null; content_md: string | null; created_at: string; updated_at: string
      }, {
        id?: string; project_id: string; subject_id?: string | null; user_id: string; title: string
        type: 'file' | 'link' | 'note' | 'ai-summary'; storage_path?: string | null
        url?: string | null; content_md?: string | null
      }>
      mock_questions: Table<{
        id: string; project_id: string; subject_id: string | null; user_id: string
        statement: string; alternatives: Json; correct_answer: string; explanation: string | null
        difficulty: 'facil' | 'medio' | 'dificil'; topic: string | null
        selected_answer: string | null; is_correct: boolean | null; answered_at: string | null
        created_at: string; updated_at: string
      }, {
        id?: string; project_id: string; subject_id?: string | null; user_id: string
        statement: string; alternatives: Json; correct_answer: string; explanation?: string | null
        difficulty?: 'facil' | 'medio' | 'dificil'; topic?: string | null
        selected_answer?: string | null; is_correct?: boolean | null; answered_at?: string | null
        updated_at?: string
      }>
      chat_messages: Table<{
        id: string; project_id: string; user_id: string; role: 'user' | 'assistant'
        content: string; created_at: string
      }, {
        id?: string; project_id: string; user_id: string; role: 'user' | 'assistant'; content: string
      }>
      edital_files: Table<Record<string, unknown>, Record<string, unknown>>
      edital_extraction_runs: Table<Record<string, unknown>, Record<string, unknown>>
      edital_sections: Table<Record<string, unknown>, Record<string, unknown>>
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

export type ExamProject = Database['public']['Tables']['exam_projects']['Row']
export type Subject = Database['public']['Tables']['subjects']['Row']
export type StudyTask = Database['public']['Tables']['study_tasks']['Row']
export type ReviewItem = Database['public']['Tables']['review_items']['Row']
export type Flashcard = Database['public']['Tables']['flashcards']['Row']
export type Material = Database['public']['Tables']['materials']['Row']
export type MockQuestion = Database['public']['Tables']['mock_questions']['Row']
export type ChatMessage = Database['public']['Tables']['chat_messages']['Row']
