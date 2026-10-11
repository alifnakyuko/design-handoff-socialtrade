'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiClient } from '@/lib/api-client';
import { UpgradeGate } from '@/components/UpgradeGate';

type PlayState =
  | { status: 'loading' }
  | { status: 'ok'; url: string; title: string }
  | { status: 'locked' }
  | { status: 'not_found' };

export default function VideoPlayerPage() {
  const params = useParams<{ id: string }>();
  const [state, setState] = useState<PlayState>({ status: 'loading' });

  useEffect(() => {
    Promise.all([apiClient.getVideoPlayUrl(params.id), apiClient.getContentById(params.id)]).then(
      ([playResult, contentResult]) => {
        if (playResult.status === 'ok') {
          const title = contentResult.status === 'ok' ? contentResult.item.title : 'Video';
          setState({ status: 'ok', url: playResult.url, title });
        } else {
          setState({ status: playResult.status });
        }
      }
    );
  }, [params.id]);

  if (state.status === 'loading') return <p className="text-brand-muted">Memuat...</p>;
  if (state.status === 'not_found') return <p className="text-brand-muted">Video tidak ditemukan.</p>;
  if (state.status === 'locked') return <UpgradeGate />;

  return (
    <div>
      <h1 className="text-2xl font-extrabold text-brand-dark mb-4">{state.title}</h1>
      <div className="aspect-video bg-black rounded-2xl overflow-hidden">
        <iframe src={state.url} className="w-full h-full" allowFullScreen title={state.title} />
      </div>
    </div>
  );
}
