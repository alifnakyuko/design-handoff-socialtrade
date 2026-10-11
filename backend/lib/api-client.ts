export type Plan = {
  code: 'silver' | 'gold' | 'platinum' | 'lifetime';
  name: string;
  tierLevel: number;
  price: number;
  strikePrice: number | null;
  durationDays: number | null;
};

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  tier: 'free' | 'silver' | 'gold' | 'platinum' | 'lifetime';
  expiresAt: string | null;
  isAdmin: boolean;
};

export type ContentListItem =
  | {
      id: string;
      type: 'watchlist' | 'video' | 'article';
      title: string;
      required_tier: string;
      locked: false;
      payload: Record<string, unknown>;
      published_at: string;
    }
  | { id: string; type: 'watchlist' | 'video' | 'article'; title: string; required_tier: string; locked: true };

export type ContentDetail = {
  id: string;
  type: 'watchlist' | 'video' | 'article';
  title: string;
  required_tier: string;
  payload: Record<string, unknown>;
  published_at: string;
};

async function parseJson<T>(res: Response): Promise<T> {
  const body = await res.json();
  if (!res.ok) {
    throw new Error(typeof body?.error === 'string' ? body.error : `Request failed (${res.status})`);
  }
  return body as T;
}

export const apiClient = {
  async getPlans(): Promise<Plan[]> {
    const res = await fetch('/api/plans');
    const body = await parseJson<{ plans: Plan[] }>(res);
    return body.plans;
  },

  async getMe(): Promise<CurrentUser | null> {
    const res = await fetch('/api/me');
    if (res.status === 401) return null;
    return parseJson<CurrentUser>(res);
  },

  async listContent(type?: 'watchlist' | 'video' | 'article'): Promise<ContentListItem[]> {
    const qs = type ? `?type=${type}` : '';
    const res = await fetch(`/api/content${qs}`);
    const body = await parseJson<{ items: ContentListItem[] }>(res);
    return body.items;
  },

  async getContentById(id: string): Promise<{ status: 'ok'; item: ContentDetail } | { status: 'locked' } | { status: 'not_found' }> {
    const res = await fetch(`/api/content/${id}`);
    if (res.status === 404) return { status: 'not_found' };
    if (res.status === 403) return { status: 'locked' };
    const body = await parseJson<{ item: ContentDetail }>(res);
    return { status: 'ok', item: body.item };
  },

  async getVideoPlayUrl(id: string): Promise<{ status: 'ok'; url: string } | { status: 'locked' } | { status: 'not_found' }> {
    const res = await fetch(`/api/videos/${id}/play`);
    if (res.status === 404) return { status: 'not_found' };
    if (res.status === 403) return { status: 'locked' };
    const body = await parseJson<{ url: string }>(res);
    return { status: 'ok', url: body.url };
  },

  async validatePromo(
    code: string,
    plan: Plan['code']
  ): Promise<{ valid: true; discountPct: number; finalPrice: number } | { valid: false }> {
    const res = await fetch('/api/promo/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, plan }),
    });
    return parseJson(res);
  },

  async checkout(
    plan: Plan['code'],
    promoCode?: string
  ): Promise<{ status: 'ok'; orderId: string; token: string; redirectUrl: string } | { status: 'invalid_promo' }> {
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan, promoCode }),
    });
    if (res.status === 400) {
      const body = await res.json();
      if (body?.error?.includes('promo')) return { status: 'invalid_promo' };
      throw new Error(body?.error ?? 'Checkout failed');
    }
    return parseJson(res);
  },

  async signup(email: string, password: string, name: string): Promise<{ userId: string }> {
    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
    });
    return parseJson(res);
  },
};
