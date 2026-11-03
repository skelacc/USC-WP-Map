import { CATEGORY_META } from '@/lib/categories'
import type { Category, Studio } from '@/types/studio'
import { cn } from '@/lib/utils'

export function CategorySwatch({ category, className }: { category: Category; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-block shrink-0 border-2 border-white shadow-[0_0_0_1px_rgb(0_0_0/0.3)]',
        category === 'wellpass' ? 'size-2.5 rotate-45 rounded-[2px]' : 'rounded-full',
        category === 'both' ? 'size-3.5' : category === 'usc' ? 'size-3' : '',
        className,
      )}
      style={{ background: CATEGORY_META[category].color }}
    />
  )
}

export function ProviderBadges({ studio, className }: { studio: Studio; className?: string }) {
  return (
    <span className={cn('inline-flex flex-wrap gap-1', className)}>
      {studio.providers.urbanSportsClub && (
        <span className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-white" style={{ background: CATEGORY_META.usc.color }}>
          Urban Sports Club
        </span>
      )}
      {studio.providers.wellpass && (
        <span className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-white" style={{ background: CATEGORY_META.wellpass.color }}>
          Wellpass
        </span>
      )}
    </span>
  )
}
