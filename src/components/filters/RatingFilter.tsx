import { ChevronDown, Heart } from 'lucide-react'
import { cn } from '@/lib/utils'

export type RatingFilter = 'hideDisliked' | 'favorites' | 'all'

const LABEL: Record<RatingFilter, string> = {
  hideDisliked: 'Ohne 👎',
  favorites: 'Nur ♥',
  all: 'Alle',
}

/** Filter nach eigener Bewertung. Standard: abgelehnte Studios ausblenden. */
export function RatingFilterSelect({ value, onChange }: { value: RatingFilter; onChange: (v: RatingFilter) => void }) {
  return (
    <label
      className={cn(
        'relative inline-flex h-8 shrink-0 items-center gap-1 rounded-full border pr-7 pl-2.5 text-xs font-medium shadow-xs',
        value === 'favorites' ? 'border-rose-300 bg-rose-50 text-rose-800' : 'border-foreground/20 bg-background',
      )}
      title="Nach eigener Bewertung filtern"
    >
      <Heart className={cn('size-3.5', value === 'favorites' && 'fill-rose-500 text-rose-500')} />
      <select value={value} onChange={(e) => onChange(e.target.value as RatingFilter)} aria-label="Nach Bewertung filtern" className="absolute inset-0 cursor-pointer opacity-0">
        <option value="hideDisliked">Abgelehnte ausblenden</option>
        <option value="favorites">Nur Favoriten</option>
        <option value="all">Alle (auch abgelehnte)</option>
      </select>
      <span aria-hidden>{LABEL[value]}</span>
      <ChevronDown aria-hidden className="pointer-events-none absolute right-2 size-3.5 text-muted-foreground" />
    </label>
  )
}
