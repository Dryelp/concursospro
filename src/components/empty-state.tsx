import type { LucideIcon } from 'lucide-react'

type EmptyStateProps = {
  icon: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex min-h-[280px] flex-col items-center justify-center px-4 py-12 text-center">
      <div className="mb-4 flex size-14 items-center justify-center rounded-2xl border border-atlas-400/20 bg-atlas-400/10 text-atlas-400">
        <Icon className="size-6" />
      </div>
      <h2 className="font-display text-base font-bold">{title}</h2>
      {description ? (
        <p className="mt-1 max-w-sm text-sm leading-6 text-slate-500">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  )
}
