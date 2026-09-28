import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({}),
}));

const validatePromoMock = vi.fn();
vi.mock('@/lib/promo', () => ({
  validatePromo: (...args: any[]) => validatePromoMock(...args),
}));

import { POST } from './route';

function makeRequest(body: any): Request {
  return new Request('http://localhost/api/promo/validate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/promo/validate', () => {
  it('returns 400 when code is missing', async () => {
    const response = await POST(makeRequest({ plan: 'silver' }));
    expect(response.status).toBe(400);
  });

  it('returns 400 when plan is not a valid plan code', async () => {
    const response = await POST(makeRequest({ code: 'HEMAT10', plan: 'not-a-plan' }));
    expect(response.status).toBe(400);
  });

  it('returns valid:true with discount and price for a valid code', async () => {
    validatePromoMock.mockResolvedValueOnce({ valid: true, code: 'HEMAT10', discountPct: 10, finalPrice: 1_350_000 });

    const response = await POST(makeRequest({ code: 'HEMAT10', plan: 'silver' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ valid: true, discountPct: 10, finalPrice: 1_350_000 });
    expect(validatePromoMock).toHaveBeenCalledWith(expect.anything(), 'HEMAT10', 'silver');
  });

  it('returns valid:false for an invalid or expired code', async () => {
    validatePromoMock.mockResolvedValueOnce({ valid: false });

    const response = await POST(makeRequest({ code: 'EXPIRED', plan: 'silver' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ valid: false });
  });
});
