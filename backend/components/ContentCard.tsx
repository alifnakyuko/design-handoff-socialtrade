import Link from 'next/link';
import type { ContentListItem } from '@/lib/api-client';

const TIER_LABEL: Record<string, string> = {
  free: 'Gratis',
  silver: 'Silver',
  gold: 'Gold',
  platinum: 'Platinum',
  lifetime: 'Lifetime',
};

export function ContentCard({ item, hrefBase }: { item: ContentListItem; hrefBase: string }) {
  if (item.locked) {
    return (
      <div className="p-5 bg-white rounded-2xl shadow-sm opacity-60">
        <h3 className="font-bold text-brand-dark">{item.title}</h3>
        <p className="text-sm text-brand-muted mt-1">
          Perlu paket {TIER_LABEL[item.required_tier] ?? item.required_tier}+
        </p>
      </div>
    );
  }

  return (
    <Link href={`${hrefBase}/${item.id}`} className="block p-5 bg-white rounded-2xl shadow-sm hover:shadow-md">
      <h3 className="font-bold text-brand-dark">{item.title}</h3>
      <p className="text-sm text-brand-muted mt-1">
        {new Date(item.published_at).toLocaleDateString('id-ID')}
      </p>
    </Link>
  );
}
