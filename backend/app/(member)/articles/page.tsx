'use client';

import { useEffect, useState } from 'react';
import { apiClient, type ContentListItem } from '@/lib/api-client';
import { ContentCard } from '@/components/ContentCard';

export default function ArticleListPage() {
  const [items, setItems] = useState<ContentListItem[] | null>(null);

  useEffect(() => {
    Promise.all([apiClient.listContent('article'), apiClient.listContent('watchlist')]).then(
      ([articles, watchlists]) => {
        const merged = [...articles, ...watchlists].sort((a, b) => {
          const aDate = 'published_at' in a ? a.published_at : '';
          const bDate = 'published_at' in b ? b.published_at : '';
          return bDate.localeCompare(aDate);
        });
        setItems(merged);
      }
    );
  }, []);

  if (!items) return <p className="text-brand-muted">Memuat...</p>;

  return (
    <div>
      <h1 className="text-2xl font-extrabold text-brand-dark">Artikel & Watchlist</h1>
      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        {items.map((item) => (
          <ContentCard key={item.id} item={item} hrefBase="/articles" />
        ))}
        {items.length === 0 && <p className="text-brand-muted">Belum ada artikel atau watchlist.</p>}
      </div>
    </div>
  );
}
