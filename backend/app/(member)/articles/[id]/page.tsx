'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiClient, type ContentDetail } from '@/lib/api-client';
import { UpgradeGate } from '@/components/UpgradeGate';

type ReadState = { status: 'loading' } | { status: 'ok'; item: ContentDetail } | { status: 'locked' } | { status: 'not_found' };

export default function ArticleReadPage() {
  const params = useParams<{ id: string }>();
  const [state, setState] = useState<ReadState>({ status: 'loading' });

  useEffect(() => {
    apiClient.getContentById(params.id).then((result) => {
      if (result.status === 'ok') setState({ status: 'ok', item: result.item });
      else setState({ status: result.status });
    });
  }, [params.id]);

  if (state.status === 'loading') return <p className="text-brand-muted">Memuat...</p>;
  if (state.status === 'not_found') return <p className="text-brand-muted">Konten tidak ditemukan.</p>;
  if (state.status === 'locked') return <UpgradeGate />;

  const { item } = state;
  const body = typeof item.payload?.body === 'string' ? item.payload.body : JSON.stringify(item.payload, null, 2);

  return (
    <article>
      <p className="text-sm font-semibold text-brand-gold-dark uppercase">{item.type}</p>
      <h1 className="text-2xl font-extrabold text-brand-dark mt-1">{item.title}</h1>
      <p className="text-sm text-brand-muted mt-1">{new Date(item.published_at).toLocaleDateString('id-ID')}</p>
      <div className="mt-6 prose text-brand-dark whitespace-pre-wrap">{body}</div>
    </article>
  );
}
