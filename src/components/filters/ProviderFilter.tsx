import { CATEGORIES, CATEGORY_META } from '@/lib/categories'
import type { CategoryFilter } from '@/lib/filter'
import type { Category } from '@/types/studio'
import { cn } from '@/lib/utils'
import { CategorySwatch } from '../ProviderBadges'

interface Props {
  value: CategoryFilter
  counts: Record<Category, number>
  onChange: (v: CategoryFilter) => void
}

/** Drei Umschalter – einzeln oder kombiniert. Gleichzeitig die Legende. */
export function ProviderFilter({ value, counts, onChange }: Props) {
  return (
    <div role="group" aria-label="Anbieter filtern" className="flex gap-1.5">
      {CATEGORIES.map((c) => {
        const active = value[c]
        return (
          <button
            key={c}
            type="button"
            aria-pressed={active}
            onClick={() => onChange({ ...value, [c]: !active })}
            onDoubleClick={() => onChange({ both: false, usc: false, wellpass: false, [c]: true })}
            title={`${CATEGORY_META[c].label} ein-/ausblenden (Doppelklick: nur diese Kategorie)`}
            className={cn(
              'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-2 text-xs sm:px-2.5 font-medium transition-colors select-none',
              active ? 'border-foreground/20 bg-background text-foreground shadow-xs' : 'border-dashed border-border bg-muted/60 text-muted-foreground opacity-70',
            )}
          >
            <CategorySwatch category={c} className={active ? '' : 'grayscale'} />
            <span className="sm:hidden">{CATEGORY_META[c].short}</span>
            <span className="hidden sm:inline">{CATEGORY_META[c].label}</span>
            <span className="tabular-nums text-muted-foreground">{counts[c]}</span>
          </button>
        )
      })}
    </div>
  )
}
