'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';
import { createBrowserSupabase } from '@/lib/supabase/browser';

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await apiClient.signup(email, password, name);
      const supabase = createBrowserSupabase();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;
      router.push('/pilih-paket');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mendaftar');
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-brand-cream flex items-center justify-center px-6">
      <form onSubmit={handleSubmit} className="w-full max-w-sm bg-white rounded-2xl p-8 shadow-sm">
        <h1 className="text-2xl font-extrabold text-brand-dark mb-6">Daftar Akun</h1>
        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
        <label className="block text-sm font-semibold text-brand-dark mb-1">Nama</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="w-full mb-4 px-4 py-2 border border-brand-cream-dark rounded-lg"
        />
        <label className="block text-sm font-semibold text-brand-dark mb-1">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full mb-4 px-4 py-2 border border-brand-cream-dark rounded-lg"
        />
        <label className="block text-sm font-semibold text-brand-dark mb-1">Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          className="w-full mb-6 px-4 py-2 border border-brand-cream-dark rounded-lg"
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 bg-brand-gold text-brand-dark font-bold rounded-full disabled:opacity-50"
        >
          {loading ? 'Memproses...' : 'Daftar'}
        </button>
        <p className="mt-4 text-sm text-brand-muted text-center">
          Sudah punya akun?{' '}
          <Link href="/login" className="text-brand-gold-dark font-semibold">
            Masuk
          </Link>
        </p>
      </form>
    </main>
  );
}
