import type { ReactNode } from 'react'

type MetricCardProps = {
  label: string
  value: string
  change: string
  tone?: 'default' | 'highlight'
  icon?: ReactNode
}

export function MetricCard({
  label,
  value,
  change,
  tone = 'default',
  icon,
}: MetricCardProps) {
  return (
    <article className={`metric-card metric-card--${tone}`}>
      <div className="metric-card__header">
        <span>{label}</span>
        {icon ? <span className="metric-card__icon">{icon}</span> : null}
      </div>
      <strong>{value}</strong>
      <p>{change}</p>
    </article>
  )
}
