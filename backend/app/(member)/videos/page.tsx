'use client';

import { useEffect, useState } from 'react';
import { apiClient, type ContentListItem } from '@/lib/api-client';
import { ContentCard } from '@/components/ContentCard';

export default function VideoListPage() {
  const [items, setItems] = useState<ContentListItem[] | null>(null);

  useEffect(() => {
    apiClient.listContent('video').then(setItems);
  }, []);

  if (!items) return <p className="text-brand-muted">Memuat...</p>;

  return (
    <div>
      <h1 className="text-2xl font-extrabold text-brand-dark">Video Kelas</h1>
      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        {items.map((item) => (
          <ContentCard key={item.id} item={item} hrefBase="/videos" />
        ))}
        {items.length === 0 && <p className="text-brand-muted">Belum ada video.</p>}
      </div>
    </div>
  );
}
