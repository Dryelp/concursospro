import { z } from 'zod'

export const materiaSchema = z.object({
  nome: z.string().trim().min(3).max(200),
  peso: z.coerce.number().int().min(1).max(5).default(1),
  topicos: z.array(z.string().trim().min(2).max(300)).max(100).default([]),
})

export const materiasResponseSchema = z.object({
  materias: z.array(materiaSchema).min(1).max(50),
})

export type MateriaExtraida = z.infer<typeof materiaSchema>
