import { AlertTriangle, Info } from 'lucide-react'
import type { TileState } from '@/hooks/useDataset'
import type { Dataset } from '@/types/studio'

function fmt(iso?: string) {
  if (!iso) return 'unbekannt'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('de-DE', { dateStyle: 'medium' })
}

function Note({ warn, title, children }: { warn?: boolean; title: string; children: React.ReactNode }) {
  return (
    <li className={`flex gap-2 rounded-md border p-2.5 ${warn ? 'border-amber-300 bg-amber-50/60' : ''}`}>
      {warn ? <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" /> : <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
      <div>
        <p className="font-medium">{title}</p>
        <div className="mt-0.5 text-xs text-muted-foreground">{children}</div>
      </div>
    </li>
  )
}

/** Wichtige Hinweise zur Aussagekraft der Daten. */
export function InfoPanel({ dataset, tiles }: { dataset: Dataset | null; tiles?: TileState }) {
  const wp = dataset?.sources.find((s) => s.id === 'wellpass')
  const wpThirdParty = !wp || wp.kind !== 'official'
  const usc = dataset?.sources.find((s) => s.id === 'usc')
  const wpCount = wp?.count ?? dataset?.studios.filter((s) => s.providerDetails.wellpass).length ?? 0
  const total = (dataset?.studios.length ?? 0) - (tiles?.loadedStudios ?? 0) + (tiles?.index?.total ?? 0)
  const uscDetails = dataset?.studios.find((s) => s.providerDetails.urbanSportsClub?.detailsFetchedAt)?.providerDetails.urbanSportsClub?.detailsFetchedAt

  return (
    <div className="space-y-3 text-sm">
      <p className="text-xs text-muted-foreground">
        Privates Projekt, alle Angaben ohne Gewähr. Vor einem Besuch bitte in der App des Anbieters prüfen.
      </p>
      <ul className="space-y-2">
        {wpThirdParty && (
          <Note warn title={`Wellpass-Daten unvollständig (${wpCount} Studios)`}>
            Die Wellpass-Studios stammen von Fair for Fitness (Drittquelle). Der Preisvergleich ordnet Wellpass nur bei Studios zu, die er selbst erfasst hat.
            Ein Studio, das hier nicht als Wellpass markiert ist, kann trotzdem dabei sein. Vollständiger: einmaliger Abgleich mit dem offiziellen Gym-Finder
            (siehe README, „Wellpass-Daten aus dem Gym-Finder“).
          </Note>
        )}
        {!wpThirdParty && (
          <Note title={`Wellpass: ${wpCount.toLocaleString('de-DE')} Studios in ganz Deutschland`}>
            Aus dem offiziellen Gym-Finder (Stand {fmt(wp?.fetchedAt)}). Position, Aktivitäten und Plus1 stammen direkt von Wellpass, Adressen liefert der
            Gym-Finder aber nicht. Sie kommen von Urban Sports Club oder Fair for Fitness. In Berlin wurden die übrigen aus der Kartenposition ermittelt
            (OpenStreetMap) und sind mit „ca.“ gekennzeichnet.
          </Note>
        )}
        <Note warn title="Außerhalb Berlins nur Wellpass">
          Urban Sports Club wird nur für Berlin geladen. Außerhalb erscheinen alle Studios als „Nur Wellpass“, auch wenn sie ebenfalls bei USC sind. Der Filter
          „Beide“ zeigt dort nichts – bitte „Nur Wellpass“ einschalten.
        </Note>
        <Note warn title="USC-Limits gelten für Privatmitgliedschaften">
          Die angezeigten Stufen, Besuchs- und Aktivitätslimits (z. B. „Massage: M 0, L 1×/Monat“) sind die Werte für private Mitgliedschaften. Bei einer
          Firmenmitgliedschaft können sie abweichen; maßgeblich ist die USC-App.
        </Note>
        <Note title="Was bedeutet „Plus“?">
          Plus-Angebote bei Urban Sports Club sind nur mit Plus-Check-ins nutzbar (in der Regel ab L). Standardmäßig sind sie ausgeblendet; über den Filter
          „Plus“ lassen sie sich einblenden.
        </Note>
        <Note title="Aktivitäten & Stufen">
          Der Aktivitätsfilter zeigt nur Studios, in denen die Aktivität mit deiner Stufe buchbar ist. Ein Studio kann mit M nutzbar sein, eine bestimmte
          Aktivität dort aber erst ab L (z. B. Massage in Yoga-Studios). Die Details zeigen das je Aktivität.
        </Note>
        <Note title="Zusammenführung von Studios">
          Gleiche Studios bei beiden Anbietern werden automatisch und bewusst vorsichtig zusammengeführt. Unsichere Fälle erscheinen als „Ähnlich wie …“ und
          bleiben getrennt, bis du entscheidest. Deine Entscheidungen gelten zuerst nur auf diesem Gerät. Mit „Sync“ kommen sie auf alle Geräte.
        </Note>
        <Note title="Lücken in den Daten">
          Einige Studios haben keine Postleitzahl oder keine Koordinaten. Letztere erscheinen nur in der Liste, nicht auf der Karte. Positionen werden nie
          geschätzt, ohne sie als ungefähr zu kennzeichnen.
        </Note>
      </ul>
      <div className="rounded-md bg-muted p-2.5 text-xs">
        <p className="font-medium">Datenstand</p>
        <p>Studios gesamt: {dataset ? total.toLocaleString('de-DE') : '–'} · erzeugt am {fmt(dataset?.generatedAt)}</p>
        <p>Urban Sports Club: Standorte {fmt(usc?.fetchedAt)}, Details (Plus, Limits) {fmt(uscDetails ?? undefined)}</p>
        <p>
          Wellpass: {fmt(wp?.fetchedAt)} ({wpThirdParty ? 'Fair for Fitness' : 'offizieller Gym-Finder'})
        </p>
        <p className="mt-1">
          Karte und ungefähre Adressen © OpenStreetMap-Mitwirkende. {wpThirdParty ? 'Wellpass-Zuordnung: Fair for Fitness.' : 'Ergänzende Adressen: Fair for Fitness.'}
        </p>
      </div>
    </div>
  )
}
