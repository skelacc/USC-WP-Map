import { useState } from 'react'
import { AlertTriangle, ArrowUp, Check, Heart, Pencil, ThumbsDown, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import type { EditField, Note, Rating } from '@/lib/userdata'
import { cn } from '@/lib/utils'

/** ♥ / 👎 – eigene Bewertung (je Profil). */
export function RatingButtons({ value, onChange, compact }: { value: Rating | null; onChange: (v: Rating | null) => void; compact?: boolean }) {
  return (
    <div className="flex gap-1.5" role="group" aria-label="Bewertung">
      <Button
        size={compact ? 'icon-sm' : 'sm'}
        variant="outline"
        aria-pressed={value === 'like'}
        onClick={() => onChange(value === 'like' ? null : 'like')}
        className={cn(value === 'like' && 'border-rose-300 bg-rose-50 text-rose-700')}
        title="Favorit"
      >
        <Heart className={cn(value === 'like' && 'fill-rose-500 text-rose-500')} />
        {!compact && (value === 'like' ? 'Favorit' : 'Gefällt mir')}
      </Button>
      <Button
        size={compact ? 'icon-sm' : 'sm'}
        variant="outline"
        aria-pressed={value === 'dislike'}
        onClick={() => onChange(value === 'dislike' ? null : 'dislike')}
        className={cn(value === 'dislike' && 'border-slate-400 bg-slate-100 text-slate-800')}
        title="Nicht interessant – wird ausgeblendet"
      >
        <ThumbsDown className={cn(value === 'dislike' && 'fill-slate-500')} />
        {!compact && (value === 'dislike' ? 'Abgelehnt' : 'Nicht interessant')}
      </Button>
    </div>
  )
}

export function UserHint({ hint }: { hint?: string }) {
  if (!hint) return null
  return (
    <p className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
      <AlertTriangle className="size-4 shrink-0" />
      <span className="whitespace-pre-line">
        <b>Eigener Hinweis:</b> {hint}
      </span>
    </p>
  )
}

interface NotesProps {
  notes: Note[]
  profile: string
  onAdd: (text: string) => void
  onDelete: (id: string) => void
}

/**
 * Notizen als Verlauf: eigene rechts, andere links (mit Autor). Senden über
 * den Pfeil. Löschen zweistufig: Mülleimer im Kopf → eigene Notizen
 * auswählen → „Löschen“ bestätigen.
 */
export function NotesSection({ notes, profile, onAdd, onDelete }: NotesProps) {
  const [text, setText] = useState('')
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const own = notes.filter((n) => n.author === profile)
  const send = () => {
    if (!text.trim()) return
    onAdd(text)
    setText('')
  }
  const stopSelecting = () => {
    setSelecting(false)
    setSelected([])
  }
  return (
    <section className="rounded-lg border bg-background p-3" aria-label="Notizen">
      <div className="mb-2 flex min-h-7 items-center gap-2">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase">Notizen</h4>
        <span className="ml-auto flex items-center gap-1">
          {selecting ? (
            <>
              <span className="text-xs text-muted-foreground">{selected.length} ausgewählt</span>
              <Button
                size="sm"
                variant="destructive"
                disabled={!selected.length}
                onClick={() => {
                  selected.forEach(onDelete)
                  stopSelecting()
                }}
              >
                <Trash2 /> Löschen
              </Button>
              <Button size="icon-sm" variant="ghost" aria-label="Abbrechen" title="Abbrechen" onClick={stopSelecting}>
                <X />
              </Button>
            </>
          ) : (
            own.length > 0 && (
              <Button size="icon-sm" variant="ghost" aria-label="Notizen zum Löschen auswählen" title="Notizen löschen" onClick={() => setSelecting(true)}>
                <Trash2 />
              </Button>
            )
          )}
        </span>
      </div>
      {notes.length > 0 && (
        <ul className="mb-2 flex flex-col gap-1.5">
          {notes.map((n) => {
            const mine = n.author === profile
            const on = selected.includes(n.id)
            const bubble = (
              <div
                className={cn(
                  'max-w-[85%] rounded-2xl px-3 py-1.5 text-sm',
                  mine ? 'rounded-br-sm bg-primary text-primary-foreground' : 'rounded-bl-sm bg-muted',
                  selecting && mine && on && 'ring-2 ring-destructive ring-offset-1',
                  selecting && !mine && 'opacity-50',
                )}
              >
                <p className="whitespace-pre-line">{n.text}</p>
                <p className={cn('mt-0.5 text-[11px]', mine ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
                  {!mine && `${n.author} · `}
                  {new Date(n.at).toLocaleDateString('de-DE')}
                </p>
              </div>
            )
            return (
              <li key={n.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                {selecting && mine ? (
                  <button
                    type="button"
                    className="flex max-w-full items-center justify-end gap-2 text-left"
                    aria-pressed={on}
                    onClick={() => setSelected((sel) => (on ? sel.filter((x) => x !== n.id) : [...sel, n.id]))}
                  >
                    <span className={cn('flex size-4 shrink-0 items-center justify-center rounded-full border', on && 'border-destructive bg-destructive text-white')}>
                      {on && <Check className="size-3" />}
                    </span>
                    {bubble}
                  </button>
                ) : (
                  bubble
                )}
              </li>
            )
          })}
        </ul>
      )}
      {!selecting && (
        <div className="relative">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send()
            }}
            rows={Math.min(4, Math.max(1, text.split('\n').length))}
            placeholder={notes.length ? 'Notiz hinzufügen' : 'z. B. „Massage nur mit 20 € Zuzahlung“'}
            className="block w-full resize-none rounded-2xl border bg-background py-2 pr-11 pl-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            aria-label="Neue Notiz"
          />
          <Button
            size="icon-sm"
            className="absolute right-1.5 bottom-1.5 rounded-full"
            disabled={!text.trim()}
            onClick={send}
            aria-label="Notiz speichern"
            title="Notiz speichern"
          >
            <ArrowUp />
          </Button>
        </div>
      )}
    </section>
  )
}

const FIELD_LABEL: Record<EditField, string> = {
  name: 'Name',
  street: 'Straße und Hausnummer',
  postalCode: 'PLZ',
  website: 'Website',
  phone: 'Telefon',
  hint: 'Hinweis (z. B. Zuzahlung, Einschränkungen)',
}

interface EditProps {
  current: Record<EditField, string>
  original: Record<EditField, string>
  onSave: (values: Partial<Record<EditField, string | null>>) => void
  onClose: () => void
}

/** Angaben eines Studios korrigieren. Leere Felder = Originalwert. */
export function EditDialog({ current, original, onSave, onClose }: EditProps) {
  const [values, setValues] = useState(current)
  const fields = Object.keys(FIELD_LABEL) as EditField[]
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[90dvh] flex-col gap-3 sm:max-w-md" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Angaben korrigieren</DialogTitle>
          <DialogDescription>Gilt auf allen Geräten (per Sync). Feld leeren = Angabe der Quelle verwenden.</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
          {fields.map((f) => (
            <label key={f} className="block text-xs">
              <span className="font-medium">{FIELD_LABEL[f]}</span>
              {f === 'hint' ? (
                <textarea
                  value={values[f]}
                  onChange={(e) => setValues({ ...values, [f]: e.target.value })}
                  rows={3}
                  className="mt-1 w-full resize-y rounded-md border bg-background px-2.5 py-1.5 text-sm"
                />
              ) : (
                <Input value={values[f]} placeholder={original[f] || '–'} onChange={(e) => setValues({ ...values, [f]: e.target.value })} className="mt-1" />
              )}
              {f !== 'hint' && original[f] && values[f] && values[f] !== original[f] && <span className="text-[11px] text-muted-foreground">Quelle: {original[f]}</span>}
            </label>
          ))}
        </div>
        <DialogFooter className="flex-row justify-between gap-2">
          <Button variant="ghost" onClick={() => setValues(Object.fromEntries(fields.map((f) => [f, ''])) as Record<EditField, string>)}>
            Alles zurücksetzen
          </Button>
          <Button
            onClick={() => {
              const out: Partial<Record<EditField, string | null>> = {}
              for (const f of fields) {
                const v = values[f].trim()
                if (v !== (current[f] ?? '').trim()) out[f] = v && v !== original[f] ? v : null
              }
              onSave(out)
            }}
          >
            <Pencil /> Speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
