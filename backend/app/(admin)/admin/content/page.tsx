'use client';

import { useEffect, useState } from 'react';
import { adminApiClient, type AdminContentItem } from '@/lib/api-client';

const TIERS = ['free', 'silver', 'gold', 'platinum', 'lifetime'];
const TYPES = ['video', 'article', 'watchlist'] as const;

type FormState = {
  id: string | null;
  type: (typeof TYPES)[number];
  title: string;
  required_tier: string;
  providerAssetId: string;
  body: string;
};

const EMPTY_FORM: FormState = { id: null, type: 'article', title: '', required_tier: 'free', providerAssetId: '', body: '' };

export default function AdminContentPage() {
  const [items, setItems] = useState<AdminContentItem[] | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  async function reload() {
    setItems(await adminApiClient.listContent());
  }

  useEffect(() => {
    reload();
  }, []);

  function startEdit(item: AdminContentItem) {
    setForm({
      id: item.id,
      type: item.type,
      title: item.title,
      required_tier: item.required_tier,
      providerAssetId: typeof item.payload.provider_asset_id === 'string' ? item.payload.provider_asset_id : '',
      body: typeof item.payload.body === 'string' ? item.payload.body : '',
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const payload = form.type === 'video' ? { provider_asset_id: form.providerAssetId } : { body: form.body };
    try {
      if (form.id) {
        await adminApiClient.updateContent(form.id, { title: form.title, required_tier: form.required_tier, payload });
      } else {
        await adminApiClient.createContent({ type: form.type, title: form.title, required_tier: form.required_tier, payload });
      }
      setForm(EMPTY_FORM);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan konten');
    }
  }

  async function handleDelete(id: string) {
    await adminApiClient.deleteContent(id);
    setConfirmDeleteId(null);
    await reload();
  }

  return (
    <div>
      <h1 className="text-2xl font-extrabold text-brand-dark">Kelola Konten</h1>

      <form onSubmit={handleSubmit} className="mt-6 p-6 bg-white rounded-2xl shadow-sm max-w-lg">
        <h2 className="font-bold text-brand-dark mb-4">{form.id ? 'Edit Konten' : 'Konten Baru'}</h2>
        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

        <label className="block text-sm font-semibold text-brand-dark mb-1">Tipe</label>
        <select
          value={form.type}
          disabled={form.id !== null}
          onChange={(e) => setForm({ ...form, type: e.target.value as FormState['type'] })}
          className="w-full mb-4 px-4 py-2 border border-brand-cream-dark rounded-lg disabled:bg-brand-cream-dark"
        >
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        <label className="block text-sm font-semibold text-brand-dark mb-1">Judul</label>
        <input
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          required
          className="w-full mb-4 px-4 py-2 border border-brand-cream-dark rounded-lg"
        />

        <label className="block text-sm font-semibold text-brand-dark mb-1">Tier Minimal</label>
        <select
          value={form.required_tier}
          onChange={(e) => setForm({ ...form, required_tier: e.target.value })}
          className="w-full mb-4 px-4 py-2 border border-brand-cream-dark rounded-lg"
        >
          {TIERS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        {form.type === 'video' ? (
          <>
            <label className="block text-sm font-semibold text-brand-dark mb-1">YouTube Video ID</label>
            <input
              value={form.providerAssetId}
              onChange={(e) => setForm({ ...form, providerAssetId: e.target.value })}
              required
              className="w-full mb-4 px-4 py-2 border border-brand-cream-dark rounded-lg"
            />
          </>
        ) : (
          <>
            <label className="block text-sm font-semibold text-brand-dark mb-1">Isi</label>
            <textarea
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              rows={6}
              className="w-full mb-4 px-4 py-2 border border-brand-cream-dark rounded-lg"
            />
          </>
        )}

        <div className="flex gap-2">
          <button type="submit" className="px-6 py-2 bg-brand-gold text-brand-dark font-bold rounded-full">
            {form.id ? 'Simpan Perubahan' : 'Publish'}
          </button>
          {form.id && (
            <button
              type="button"
              onClick={() => setForm(EMPTY_FORM)}
              className="px-6 py-2 bg-brand-cream-dark text-brand-dark font-semibold rounded-full"
            >
              Batal
            </button>
          )}
        </div>
      </form>

      <div className="mt-8 space-y-2">
        {items === null && <p className="text-brand-muted">Memuat...</p>}
        {items?.map((item) => (
          <div key={item.id} className="p-4 bg-white rounded-2xl shadow-sm flex items-center justify-between">
            <div>
              <p className="font-bold text-brand-dark">{item.title}</p>
              <p className="text-sm text-brand-muted">
                {item.type} · {item.required_tier}
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => startEdit(item)} className="text-sm font-semibold text-brand-gold-dark">
                Edit
              </button>
              {confirmDeleteId === item.id ? (
                <button onClick={() => handleDelete(item.id)} className="text-sm font-semibold text-red-600">
                  Yakin hapus?
                </button>
              ) : (
                <button onClick={() => setConfirmDeleteId(item.id)} className="text-sm font-semibold text-red-600">
                  Hapus
                </button>
              )}
            </div>
          </div>
        ))}
        {items?.length === 0 && <p className="text-brand-muted">Belum ada konten.</p>}
      </div>
    </div>
  );
}
