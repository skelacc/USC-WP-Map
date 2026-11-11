import { useState } from 'react'
import { AlertTriangle, Heart, Pencil, ThumbsDown, Trash2 } from 'lucide-react'
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

/** Notizen zu einem Studio (geteilt per Sync, mit Autor und Datum). */
export function NotesSection({ notes, profile, onAdd, onDelete }: NotesProps) {
  const [text, setText] = useState('')
  return (
    <div>
      <h4 className="mb-1 text-xs font-semibold text-muted-foreground uppercase">Notizen</h4>
      {notes.length > 0 && (
        <ul className="mb-2 space-y-1.5">
          {notes.map((n) => (
            <li key={n.id} className="rounded-md border bg-muted/40 p-2 text-xs">
              <p className="whitespace-pre-line">{n.text}</p>
              <p className="mt-1 flex items-center text-[11px] text-muted-foreground">
                {n.author} · {new Date(n.at).toLocaleDateString('de-DE')}
                {n.author === profile && (
                  <button type="button" className="ml-auto inline-flex items-center gap-0.5 hover:text-foreground" onClick={() => onDelete(n.id)} aria-label="Notiz löschen">
                    <Trash2 className="size-3" /> löschen
                  </button>
                )}
              </p>
            </li>
          ))}
        </ul>
      )}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        placeholder="z. B. „Massage nur mit 20 € Zuzahlung (laut Website)“"
        className="w-full resize-y rounded-md border bg-background px-2.5 py-1.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        aria-label="Neue Notiz"
      />
      <div className="mt-1 flex justify-end">
        <Button
          size="sm"
          disabled={!text.trim()}
          onClick={() => {
            onAdd(text)
            setText('')
          }}
        >
          Notiz speichern
        </Button>
      </div>
    </div>
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
