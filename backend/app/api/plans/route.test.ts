import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({}),
}));

const listActivePlansMock = vi.fn();
vi.mock('@/lib/plans', () => ({
  listActivePlans: (...args: any[]) => listActivePlansMock(...args),
}));

import { GET } from './route';

describe('GET /api/plans', () => {
  it('returns the active plan list, no auth required', async () => {
    const plans = [{ code: 'silver', name: 'Silver', tierLevel: 1, price: 1500000, strikePrice: null, durationDays: 120 }];
    listActivePlansMock.mockResolvedValueOnce(plans);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ plans });
  });
});
