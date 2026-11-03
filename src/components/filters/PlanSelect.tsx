import { ChevronDown } from 'lucide-react'
import { USC_PLANS, type UscPlan } from '@/lib/plans'
import { CATEGORY_META } from '@/lib/categories'

interface Props {
  value: UscPlan
  onChange: (p: UscPlan) => void
}

/** Auswahl der eigenen USC-Mitgliedschaft (native Auswahl – auf Android am bequemsten). */
export function PlanSelect({ value, onChange }: Props) {
  return (
    <label
      className="relative inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-foreground/20 bg-background pr-7 pl-2.5 text-xs font-medium shadow-xs"
      title="Deine Urban-Sports-Club-Mitgliedschaft: Studios, die erst in höheren Stufen enthalten sind, zählen nicht als USC-Studio."
    >
      <span className="font-semibold" style={{ color: CATEGORY_META.usc.color }}>
        USC
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as UscPlan)}
        aria-label="USC-Mitgliedschaft"
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {USC_PLANS.map((p) => (
          <option key={p.id} value={p.id}>
            {p.size} – {p.id}
          </option>
        ))}
        <option value="all">Alle Stufen</option>
      </select>
      <span aria-hidden>{value === 'all' ? 'alle' : USC_PLANS.find((p) => p.id === value)?.size}</span>
      <ChevronDown aria-hidden className="pointer-events-none absolute right-2 size-3.5 text-muted-foreground" />
    </label>
  )
}
