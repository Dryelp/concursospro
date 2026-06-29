# ConcurseiroPro

Aplicativo pessoal de estudos para concursos publicos, migrado do HTML original
para `Next.js 14 + TypeScript + Tailwind`, com Supabase e IA via Edge Function.

## Modulos

- dashboard diario com estatisticas, contagem regressiva e sessoes
- editais com parser local e extracao assistida por IA
- cronograma por materia, disponibilidade e data da prova
- revisoes e flashcards com repeticao espacada SM-2
- simulados gerados por IA
- materiais em Markdown
- tutor Professor Atlas
- configuracoes de rotina e preferencias

## Arquitetura

- Supabase Auth com sessao SSR
- Postgres com RLS e ownership por usuario
- Server Actions para mutacoes
- uma unica integracao de IA em `src/lib/ia.ts`
- timeout de 25 segundos, retry e validacao Zod
- Gemini como provedor principal e OpenRouter como fallback
- Netlify com `@netlify/plugin-nextjs`

## Ambiente do frontend

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

As chaves dos provedores de IA nunca ficam no frontend ou no Netlify. Configure
`GEMINI_API_KEY` e, opcionalmente, `OPENROUTER_API_KEY` nos secrets das Edge
Functions do projeto Supabase.

## Comandos

```powershell
npm.cmd install
npm.cmd run test
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
npm.cmd run dev
```

## Validacao

Validado em 25/06/2026:

- 5 testes automatizados aprovados
- TypeScript sem erros
- ESLint sem avisos ou erros
- build de producao aprovado
- rotas privadas redirecionando usuarios sem sessao para `/login`
