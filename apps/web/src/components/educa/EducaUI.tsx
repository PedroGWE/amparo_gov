import { type ReactNode } from 'react'
import { BookOpen, Loader2, Search } from 'lucide-react'

export function Panel({
  title,
  description,
  action,
  children,
  className = '',
}: {
  title: string
  description?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`edu-panel ${className}`}>
      <div className="edu-panel-heading">
        <div>
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}
export function EmptyState({
  title,
  text,
  action,
}: {
  title: string
  text: string
  action?: ReactNode
}) {
  return (
    <div className="edu-empty">
      <span className="edu-empty-icon">
        <BookOpen />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  )
}
export function Loading({ text = 'Carregando...' }: { text?: string }) {
  return (
    <div role="status" className="edu-loading">
      <Loader2 className="animate-spin" size={20} />
      {text}
    </div>
  )
}
export function Field({
  name,
  label,
  type = 'text',
  required = true,
  ...props
}: {
  name: string
  label: string
  type?: string
  required?: boolean
  placeholder?: string
  min?: number
  max?: number
  maxLength?: number
  defaultValue?: string
}) {
  return (
    <label className="edu-field">
      <span>
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </span>
      <input className="input" name={name} type={type} required={required} {...props} />
    </label>
  )
}
export function SearchField({
  value,
  onChange,
  placeholder = 'Buscar...',
  label = 'Buscar',
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  label?: string
}) {
  return (
    <label className="edu-search">
      <Search size={18} />
      <span className="sr-only">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type="search"
      />
    </label>
  )
}
export function Badge({ children, tone = 'blue' }: { children: ReactNode; tone?: string }) {
  return <span className={`edu-badge edu-tone-${tone}`}>{children}</span>
}
