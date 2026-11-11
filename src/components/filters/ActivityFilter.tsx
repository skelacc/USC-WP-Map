import { useMemo, useState } from 'react'
import { Check, ChevronDown, CirclePlus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { foldText } from '@/lib/search'
import { cn } from '@/lib/utils'

const chip = 'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium select-none'

interface Props {
  value: string[]
  onChange: (v: string[]) => void
  counts: Map<string, number>
  planLabel: string
}

/** Auswahl einer oder mehrerer Aktivitäten (ODER-Verknüpfung). */
export function ActivityFilter({ value, onChange, counts, planLabel }: Props) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const all = useMemo(() => {
    const names = new Set([...counts.keys(), ...value])
    return [...names].sort((a, b) => a.localeCompare(b, 'de'))
  }, [counts, value])
  const shown = all.filter((a) => !q.trim() || foldText(a).includes(foldText(q)))
  const label = value.length === 0 ? 'Aktivität' : value.length === 1 ? value[0] : `${value.length} Aktivitäten`
  const toggle = (a: string) => onChange(value.includes(a) ? value.filter((x) => x !== a) : [...value, a])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <span className="inline-flex shrink-0">
        <DialogTrigger asChild>
          <button
            type="button"
            className={cn(chip, value.length ? 'border-foreground bg-foreground text-background' : 'border-foreground/20 bg-background shadow-xs', value.length && 'rounded-r-none pr-2')}
          >
            {label}
            {!value.length && <ChevronDown className="size-3.5 text-muted-foreground" />}
          </button>
        </DialogTrigger>
        {value.length > 0 && (
          <button type="button" onClick={() => onChange([])} aria-label="Aktivitätsfilter entfernen" className={cn(chip, 'rounded-l-none border-l-0 border-foreground bg-foreground px-1.5 text-background')}>
            <X className="size-3.5" />
          </button>
        )}
      </span>
      <DialogContent className="flex max-h-[85dvh] flex-col gap-3 sm:max-w-md" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Aktivitäten</DialogTitle>
          <DialogDescription>
            Zeigt Studios, in denen mindestens eine gewählte Aktivität mit deiner USC-Stufe {planLabel} buchbar ist (bzw. bei Wellpass angeboten wird). Zahl = passende Studios.
          </DialogDescription>
        </DialogHeader>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Aktivität suchen, z. B. Massage" aria-label="Aktivität suchen" />
        <ul className="min-h-0 flex-1 divide-y overflow-y-auto rounded-md border">
          {shown.map((a) => {
            const on = value.includes(a)
            const n = counts.get(a) ?? 0
            return (
              <li key={a}>
                <button type="button" onClick={() => toggle(a)} className={cn('flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-muted', n === 0 && !on && 'text-muted-foreground')}>
                  <span className={cn('flex size-4 items-center justify-center rounded border', on && 'border-foreground bg-foreground text-background')}>{on && <Check className="size-3" />}</span>
                  <span className="flex-1">{a}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">{n}</span>
                </button>
              </li>
            )
          })}
        </ul>
        <DialogFooter className="flex-row justify-between gap-2">
          <Button variant="ghost" onClick={() => onChange([])} disabled={!value.length}>
            Zurücksetzen
          </Button>
          <Button onClick={() => setOpen(false)}>Fertig</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Plus-Angebote (USC, nur mit Plus-Check-in) ein-/ausblenden. Standard: aus. */
export function PlusToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      aria-pressed={value}
      onClick={() => onChange(!value)}
      title="USC-Plus-Angebote (nur mit Plus-Check-in) anzeigen"
      className={cn(chip, value ? 'border-foreground/20 bg-background shadow-xs' : 'border-dashed bg-muted/60 text-muted-foreground')}
    >
      <CirclePlus className="size-3.5" />
      Plus {value ? 'an' : 'aus'}
    </button>
  )
}
