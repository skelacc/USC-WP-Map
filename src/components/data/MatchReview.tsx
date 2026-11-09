import { Link2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Decision } from '@/lib/merges'
import type { MatchCandidate } from '@/types/studio'

interface Props {
  candidates: MatchCandidate[]
  decisions: Decision[]
  onMerge: (c: MatchCandidate) => void
  onReject: (pair: string) => void
  onShow: (studioId: string) => void
}

/** Unsichere Zuordnungsvorschläge + eigene Entscheidungen (Export/Import). */
export function MatchReview({ candidates, decisions, onMerge, onReject, onShow }: Props) {
  return (
    <div className="space-y-3 text-sm">
      <p className="text-xs text-muted-foreground">
        Deine Entscheidungen: {decisions.length}. Synchronisieren zwischen Geräten unter „Sync“.
      </p>

      {!candidates.length ? (
        <p className="text-sm text-muted-foreground">Keine offenen Zuordnungsvorschläge.</p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Diese Paare könnten dasselbe Studio sein. Bis zu deiner Entscheidung erscheinen sie getrennt. Beliebige andere Studios lassen sich in der
            Detailansicht über „Zusammenführen…“ verbinden.
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
                <p className="mt-1.5 text-[11px] text-muted-foreground">{c.reasons.join(' · ')}</p>
                <div className="mt-2 flex gap-1.5">
                  <Button size="sm" onClick={() => onMerge(c)}>
                    <Link2 /> Zusammenführen…
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => onReject(c.id)}>
                    Verschieden
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
