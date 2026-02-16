import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'

interface PageHeaderProps {
  title: string | ReactNode
  description?: string
  actions?: ReactNode
  breadcrumbs?: Array<{ label: string; to: string }>
}

export function PageHeader({ title, description, actions, breadcrumbs }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div className="min-w-0">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav className="flex items-center gap-1 text-xs text-muted-foreground mb-1.5">
            {breadcrumbs.map((crumb, index) => {
              const isLast = index === breadcrumbs.length - 1
              return (
                <span key={crumb.to} className="flex items-center gap-1">
                  {index > 0 && <span className="text-muted-foreground/50">/</span>}
                  {isLast ? (
                    <span>{crumb.label}</span>
                  ) : (
                    <Link to={crumb.to} className="hover:text-foreground transition-colors">
                      {crumb.label}
                    </Link>
                  )}
                </span>
              )
            })}
          </nav>
        )}
        <h1 className="text-xl font-semibold tracking-tight truncate">{title}</h1>
        {description && <p className="text-sm text-muted-foreground mt-0.5">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  )
}
