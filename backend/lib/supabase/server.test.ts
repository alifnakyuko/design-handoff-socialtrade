import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('next/headers', () => ({
  cookies: () => ({
    getAll: () => [],
    set: vi.fn(),
  }),
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn((url: string, key: string) => ({ url, key })),
}));

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('createServerSupabase', () => {
  it('creates a client using the public env vars', async () => {
    const { createServerSupabase } = await import('./server');
    const client = createServerSupabase() as unknown as { url: string; key: string };
    expect(client.url).toBe('https://example.supabase.co');
    expect(client.key).toBe('anon-key');
  });
});
