import { useEffect, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface Props {
  /** Symbol im Ruhezustand (z. B. <Trash2 />) */
  icon: ReactNode
  /** Beschriftung im Ruhezustand; leer = nur Symbol (dann ist `label` Pflicht für Screenreader) */
  children?: ReactNode
  /** Text für Screenreader/Tooltip, z. B. „Notizen löschen“ */
  label: string
  /** Text der Bestätigung, z. B. „Löschen“ */
  confirmText: string
  onConfirm: () => void
  size?: 'sm' | 'icon-sm' | 'xs'
  className?: string
  disabled?: boolean
}

/**
 * Zweistufige Schaltfläche für zerstörerische Aktionen (Entwicklungsvorgabe,
 * siehe CLAUDE.md): Erster Tipp klappt die Bestätigung auf („Löschen“ +
 * Abbrechen), erst der zweite Tipp führt aus. Klappt nach 5 s von selbst zu.
 */
export function ConfirmButton({ icon, children, label, confirmText, onConfirm, size = 'sm', className, disabled }: Props) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const t = window.setTimeout(() => setArmed(false), 5000)
    return () => window.clearTimeout(t)
  }, [armed])

  if (!armed) {
    return (
      <Button
        type="button"
        size={size}
        variant="outline"
        aria-label={children ? undefined : label}
        title={label}
        aria-expanded={false}
        disabled={disabled}
        className={className}
        onClick={() => setArmed(true)}
      >
        {icon}
        {children}
      </Button>
    )
  }
  return (
    <span className={cn('inline-flex items-center gap-1', className)} role="group" aria-label={label}>
      <Button
        type="button"
        size={size === 'icon-sm' ? 'sm' : size}
        variant="destructive"
        aria-expanded
        autoFocus
        onClick={() => {
          setArmed(false)
          onConfirm()
        }}
      >
        {icon}
        {confirmText}
      </Button>
      <Button type="button" size="icon-sm" variant="ghost" aria-label="Abbrechen" title="Abbrechen" onClick={() => setArmed(false)}>
        <X />
      </Button>
    </span>
  )
}
