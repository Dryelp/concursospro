import type { ReactNode } from 'react'

type SurfaceCardProps = {
  eyebrow?: string
  title: string
  description?: string
  children: ReactNode
  className?: string
}

export function SurfaceCard({
  eyebrow,
  title,
  description,
  children,
  className,
}: SurfaceCardProps) {
  const classes = ['surface-card', className].filter(Boolean).join(' ')

  return (
    <article className={classes}>
      <header className="surface-card__header">
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h2>{title}</h2>
        {description ? <p className="surface-card__description">{description}</p> : null}
      </header>
      {children}
    </article>
  )
}
