import { useRef, useState } from 'react'
import { Download, Link2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Decision } from '@/lib/merges'
import type { MatchCandidate } from '@/types/studio'

interface Props {
  candidates: MatchCandidate[]
  decisions: Decision[]
  onImportDecisions: (d: Decision[]) => void
  onMerge: (c: MatchCandidate) => void
  onReject: (pair: string) => void
  onShow: (studioId: string) => void
}

/** Unsichere Zuordnungsvorschläge + eigene Entscheidungen (Export/Import). */
export function MatchReview({ candidates, decisions, onImportDecisions, onMerge, onReject, onShow }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [note, setNote] = useState<string | null>(null)

  const exportFile = () => {
    const blob = new Blob([JSON.stringify(decisions, null, 1)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'match_decisions.json'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const importFile = async (f: File) => {
    try {
      const data = JSON.parse(await f.text())
      if (!Array.isArray(data) || !data.every((d) => d && typeof d.pair === 'string' && ['confirm', 'reject'].includes(d.decision))) {
        throw new Error('Unerwartetes Format')
      }
      const merged = new Map(decisions.map((d) => [d.pair, d]))
      for (const d of data as Decision[]) merged.set(d.pair, d)
      onImportDecisions([...merged.values()])
      setNote(`${data.length} Entscheidungen übernommen.`)
    } catch (e) {
      setNote(`Import fehlgeschlagen: ${(e as Error).message}`)
    }
  }

  return (
    <div className="space-y-3 text-sm">
      <div className="rounded-md border p-2 text-xs">
        <p>
          <b>Deine Entscheidungen: {decisions.length}</b> – im Browser dieses Geräts gespeichert. Für andere Geräte oder dauerhaft im Projekt: exportieren
          und als <code>data/manual/match_decisions.json</code> committen (unter <code>npm run dev</code> passiert das automatisch).
        </p>
        <div className="mt-2 flex gap-1.5">
          <Button size="sm" variant="outline" onClick={exportFile} disabled={!decisions.length}>
            <Download /> Exportieren
          </Button>
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload /> Importieren
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void importFile(f)
              e.target.value = ''
            }}
          />
        </div>
        {note && <p className="mt-1">{note}</p>}
      </div>

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
