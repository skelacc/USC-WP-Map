import { useState } from 'react'
import { CheckCircle2, XCircle } from 'lucide-react'
import { uploadImportFile } from '@/lib/importApi'

const TEMPLATE = `provider,name,street,postalCode,city,district,latitude,longitude,website,sourceId,categories,sourceNote
wellpass,Beispielstudio,Musterstraße 1,10115,Berlin,Mitte,52.5321,13.3889,https://example.org,beispiel-1,Fitness|Yoga,"Wellpass Gym-Finder, 03.11.2026"
`

export function FileImport({ apiAvailable }: { apiAvailable: boolean }) {
  const [result, setResult] = useState<{ ok: boolean; message: string; errors?: string[] } | null>(null)
  const [busy, setBusy] = useState(false)

  const onFile = async (file: File) => {
    setBusy(true)
    setResult(null)
    try {
      if (file.size > 4_000_000) throw new Error('Datei ist größer als 4 MB.')
      const text = await file.text()
      const r = await uploadImportFile(file.name, text)
      const errors = (r.event?.errors as string[] | undefined) ?? []
      setResult({ ok: true, message: `${r.message}. Gespeichert als ${r.savedAs}. Jetzt unter „Aktualisieren“ die Quelle „Manuelle Dateien“ importieren.`, errors })
    } catch (e) {
      setResult({ ok: false, message: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3 text-sm">
      <p>
        Für Studios, die keine automatische Quelle liefert (z. B. aus dem offiziellen{' '}
        <a className="text-primary underline" href="https://de.egym-wellpass.com/de-de/gym-finder" target="_blank" rel="noreferrer">
          Wellpass-Gym-Finder
        </a>
        ), können CSV- oder JSON-Dateien importiert werden. Pflichtspalten: <code>provider</code> (urbanSportsClub/wellpass) und <code>name</code>. Fehlende
        Koordinaten sind erlaubt – solche Studios erscheinen nur in der Liste.
      </p>
      <a
        className="text-primary underline"
        download="studios-vorlage.csv"
        href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`}
      >
        CSV-Vorlage herunterladen
      </a>
      {apiAvailable ? (
        <label className="block">
          <span className="sr-only">Importdatei wählen</span>
          <input
            type="file"
            accept=".csv,.json,text/csv,application/json"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void onFile(f)
              e.target.value = ''
            }}
            className="block w-full text-xs file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm"
          />
        </label>
      ) : (
        <p className="rounded bg-muted p-2 text-xs">
          Ohne <code>npm run dev</code>: Datei nach <code>data/manual/import/</code> kopieren und <code>npm run data:fetch -- --sources manual</code> ausführen.
        </p>
      )}
      {result && (
        <div className={`rounded-md p-2 text-xs ${result.ok ? 'bg-emerald-50 text-emerald-900' : 'bg-red-50 text-red-900'}`}>
          <p className="flex gap-2">
            {result.ok ? <CheckCircle2 className="size-4 shrink-0" /> : <XCircle className="size-4 shrink-0" />}
            {result.message}
          </p>
          {!!result.errors?.length && (
            <ul className="mt-1 list-disc pl-5">
              {result.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
