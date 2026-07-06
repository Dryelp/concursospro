import { z } from 'zod'

export const questionSchema = z.object({
  statement: z.string().min(5),
  alternatives: z.array(z.object({ letter: z.string().min(1).max(2), text: z.string().min(1) })).min(2).max(5),
  correctAnswer: z.string().min(1).max(2),
  explanation: z.string().min(3),
})
export const fullSimulationQuestionSchema = questionSchema.extend({
  subjectName: z.string().min(2),
  topic: z.string().min(3).optional(),
})

function compactQuestionList<T extends z.ZodTypeAny>(
  itemSchema: T,
  max: number,
): z.ZodType<{ questions: z.infer<T>[] }> {
  return z.object({ questions: z.array(z.unknown()).min(1) })
    .transform(({ questions }) => ({
      questions: questions
        .map((question) => itemSchema.safeParse(question))
        .filter((result): result is z.SafeParseSuccess<z.infer<T>> => result.success)
        .map((result) => result.data)
        .slice(0, max),
    }))
    .refine((payload) => payload.questions.length > 0, {
      message: 'A IA nao retornou questoes completas com gabarito e explicacao.',
    }) as z.ZodType<{ questions: z.infer<T>[] }>
}

export const questionsSchema = compactQuestionList(questionSchema, 20)
export const fullSimulationQuestionsSchema: z.ZodType<{
  questions: z.infer<typeof fullSimulationQuestionSchema>[]
}> = z.object({
  questions: z.array(z.unknown()).min(1),
}).transform(({ questions }) => ({
  questions: questions
    .map((question) => fullSimulationQuestionSchema.safeParse(question))
    .filter((result): result is z.SafeParseSuccess<z.infer<typeof fullSimulationQuestionSchema>> => result.success)
    .map((result) => result.data)
    .slice(0, 60),
})).refine((payload) => payload.questions.length > 0, {
  message: 'A IA nao retornou questoes completas com materia, gabarito e explicacao.',
}) as z.ZodType<{ questions: z.infer<typeof fullSimulationQuestionSchema>[] }>
export const flashcardsSchema = z.object({ cards: z.array(z.object({ front: z.string().min(3), back: z.string().min(3) })).min(1).max(30) })
