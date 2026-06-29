import { z } from 'zod'

export const questionSchema = z.object({
  statement: z.string().min(5),
  alternatives: z.array(z.object({ letter: z.string().min(1).max(2), text: z.string().min(1) })).min(4).max(5),
  correctAnswer: z.string().min(1).max(2),
  explanation: z.string().min(3),
})
export const questionsSchema = z.object({ questions: z.array(questionSchema).min(1).max(20) })
export const flashcardsSchema = z.object({ cards: z.array(z.object({ front: z.string().min(3), back: z.string().min(3) })).min(1).max(30) })
