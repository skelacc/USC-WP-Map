import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { MatchCandidate } from '@/types/studio'

interface Props {
  candidates: MatchCandidate[]
  canEdit: boolean
  onDecide: (pair: string, decision: 'confirm' | 'reject') => Promise<void>
  onShow: (studioId: string) => void
}

/** Unsichere Zuordnungsvorschläge – bleiben getrennt, bis sie bestätigt werden. */
export function MatchReview({ candidates, canEdit, onDecide, onShow }: Props) {
  const [busy, setBusy] = useState<string | null>(null)
  if (!candidates.length) return <p className="text-sm text-muted-foreground">Keine offenen Zuordnungsvorschläge.</p>

  const decide = async (id: string, d: 'confirm' | 'reject') => {
    setBusy(id)
    try {
      await onDecide(id, d)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-2 text-sm">
      <p className="text-xs text-muted-foreground">
        Diese Paare könnten dasselbe Studio sein, sind aber nicht sicher genug für eine automatische Zusammenführung. Bis zur Entscheidung erscheinen sie
        getrennt auf der Karte.
        {!canEdit && ' Entscheidungen sind nur mit „npm run dev“ möglich (oder per Kommandozeile: npm run data:decide -- <Paar-ID> confirm|reject).'}
      </p>
      <ul className="space-y-2">
        {candidates.map((c) => (
          <li key={c.id} className="rounded-md border p-2">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button type="button" className="text-left hover:underline" onClick={() => c.urbanSportsClub.studioId && onShow(c.urbanSportsClub.studioId)}>
                <span className="block font-semibold text-blue-700">USC</span>
                {c.urbanSportsClub.name}
                <span className="block text-muted-foreground">{c.urbanSportsClub.street ?? '–'}</span>
              </button>
              <button type="button" className="text-left hover:underline" onClick={() => c.wellpass.studioId && onShow(c.wellpass.studioId)}>
                <span className="block font-semibold text-orange-700">Wellpass</span>
                {c.wellpass.name}
                <span className="block text-muted-foreground">{[c.wellpass.street, c.wellpass.postalCode].filter(Boolean).join(', ') || '–'}</span>
              </button>
            </div>
            <ul className="mt-1.5 list-disc pl-4 text-[11px] text-muted-foreground">
              {c.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
            {canEdit && (
              <div className="mt-2 flex gap-1.5">
                <Button size="xs" disabled={busy !== null} onClick={() => decide(c.id, 'confirm')}>
                  Gleiches Studio
                </Button>
                <Button size="xs" variant="outline" disabled={busy !== null} onClick={() => decide(c.id, 'reject')}>
                  Verschiedene Studios
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
