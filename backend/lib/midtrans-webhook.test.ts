import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { verifyMidtransSignature, handleMidtransNotification, type MidtransNotification } from './midtrans-webhook';

const SERVER_KEY = 'test-server-key';

function signedNotification(overrides: Partial<MidtransNotification>): MidtransNotification {
  const base = {
    order_id: 'ST-u1-123',
    status_code: '200',
    gross_amount: '2600000.00',
    transaction_status: 'settlement',
    transaction_id: 'tx-1',
    ...overrides,
  };
  const signature_key = crypto
    .createHash('sha512')
    .update(base.order_id + base.status_code + base.gross_amount + SERVER_KEY)
    .digest('hex');
  return { ...base, signature_key };
}

function fakeSupabase(opts: { orderRow?: any; userRow?: any }) {
  const orderUpdates: any[] = [];
  const userUpdates: any[] = [];
  // Mutable so a test can call handleMidtransNotification twice against the same mock and
  // have the second call see the status the first call already wrote — this is what makes
  // the new conditional `.eq('status', 'pending')` guard actually testable end-to-end.
  let currentOrderStatus = opts.orderRow?.status ?? 'pending';

  return {
    orderUpdates,
    userUpdates,
    from: (table: string) => {
      if (table === 'orders') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: opts.orderRow ?? null, error: opts.orderRow ? null : { message: 'not found' } }),
            }),
          }),
          update: (patch: any) => {
            orderUpdates.push(patch);
            if (patch.status === 'paid') {
              const matchedBeforeWrite = currentOrderStatus === 'pending';
              if (matchedBeforeWrite) currentOrderStatus = 'paid';
              return {
                eq: () => ({
                  eq: () => ({
                    select: () =>
                      Promise.resolve({
                        data: matchedBeforeWrite ? [{ id: opts.orderRow?.id ?? 'order-1' }] : [],
                        error: null,
                      }),
                  }),
                }),
              };
            }
            currentOrderStatus = patch.status;
            return {
              eq: async () => ({ error: null }),
            };
          },
        };
      }
      if (table === 'users') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: opts.userRow ?? { tier: 'free', expires_at: null }, error: null }),
            }),
          }),
          update: (patch: any) => ({
            eq: async () => {
              userUpdates.push(patch);
              return { error: null };
            },
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  } as any;
}

describe('verifyMidtransSignature', () => {
  it('accepts a correctly signed notification', () => {
    const notification = signedNotification({});
    expect(verifyMidtransSignature(notification, SERVER_KEY)).toBe(true);
  });

  it('rejects a tampered notification', () => {
    const notification = signedNotification({ gross_amount: '9999999.00' });
    notification.gross_amount = '1.00';
    expect(verifyMidtransSignature(notification, SERVER_KEY)).toBe(false);
  });
});

describe('handleMidtransNotification', () => {
  it('returns invalid_signature and makes no updates when the signature is wrong', async () => {
    const notification = signedNotification({});
    notification.signature_key = 'wrong';
    const supabase = fakeSupabase({});
    const result = await handleMidtransNotification(supabase, notification, SERVER_KEY);
    expect(result).toEqual({ status: 'invalid_signature' });
  });

  it('returns order_not_found when no order matches the midtrans order id', async () => {
    const notification = signedNotification({});
    const supabase = fakeSupabase({ orderRow: undefined });
    const result = await handleMidtransNotification(supabase, notification, SERVER_KEY);
    expect(result).toEqual({ status: 'order_not_found' });
  });

  it('marks the order paid and sets tier + expires_at on settlement from free', async () => {
    const notification = signedNotification({ transaction_status: 'settlement' });
    const supabase = fakeSupabase({
      orderRow: { id: 'order-1', user_id: 'u1', plan: 'gold', status: 'pending' },
      userRow: { tier: 'free', expires_at: null },
    });

    const result = await handleMidtransNotification(supabase, notification, SERVER_KEY);

    expect(result).toEqual({ status: 'updated' });
    expect(supabase.orderUpdates[0]).toMatchObject({ status: 'paid', midtrans_transaction_id: 'tx-1' });
    expect(supabase.userUpdates[0].tier).toBe('gold');
    expect(supabase.userUpdates[0].expires_at).not.toBeNull();
  });

  it('does not downgrade a lifetime user who buys a lower plan', async () => {
    const notification = signedNotification({ transaction_status: 'settlement' });
    const supabase = fakeSupabase({
      orderRow: { id: 'order-1', user_id: 'u1', plan: 'silver', status: 'pending' },
      userRow: { tier: 'lifetime', expires_at: null },
    });

    const result = await handleMidtransNotification(supabase, notification, SERVER_KEY);

    expect(result).toEqual({ status: 'updated' });
    expect(supabase.userUpdates[0]).toEqual({ tier: 'lifetime', expires_at: null });
  });

  it('marks the order failed and does not touch the user tier on cancel', async () => {
    const notification = signedNotification({ transaction_status: 'cancel' });
    const supabase = fakeSupabase({
      orderRow: { id: 'order-1', user_id: 'u1', plan: 'gold', status: 'pending' },
    });

    const result = await handleMidtransNotification(supabase, notification, SERVER_KEY);

    expect(result).toEqual({ status: 'updated' });
    expect(supabase.orderUpdates[0]).toEqual({ status: 'failed' });
    expect(supabase.userUpdates).toHaveLength(0);
  });

  it('returns write_failed when the paid order update fails', async () => {
    const notification = signedNotification({ transaction_status: 'settlement' });
    const orderRow = { id: 'order-1', user_id: 'u1', plan: 'gold', status: 'pending' };
    const supabase = {
      from: (table: string) => {
        if (table === 'orders') {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({ data: orderRow, error: null }),
              }),
            }),
            update: () => ({
              eq: () => ({
                eq: () => ({
                  select: () => Promise.resolve({ data: null, error: { message: 'db error' } }),
                }),
              }),
            }),
          };
        }
        if (table === 'users') {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({ data: { tier: 'free', expires_at: null }, error: null }),
              }),
            }),
            update: () => ({
              eq: async () => ({ error: null }),
            }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    } as any;

    const result = await handleMidtransNotification(supabase, notification, SERVER_KEY);
    expect(result).toEqual({ status: 'write_failed' });
  });

  it('returns write_failed and does not write a tier when reading the current tier fails', async () => {
    const notification = signedNotification({ transaction_status: 'settlement' });
    const orderRow = { id: 'order-1', user_id: 'u1', plan: 'silver', status: 'pending' };
    const userUpdates: any[] = [];
    const supabase = {
      from: (table: string) => {
        if (table === 'orders') {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({ data: orderRow, error: null }),
              }),
            }),
            update: () => ({
              eq: () => ({
                eq: () => ({
                  select: () => Promise.resolve({ data: [{ id: 'order-1' }], error: null }),
                }),
              }),
            }),
          };
        }
        if (table === 'users') {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({ data: null, error: { message: 'db error' } }),
              }),
            }),
            update: (patch: any) => ({
              eq: async () => {
                userUpdates.push(patch);
                return { error: null };
              },
            }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    } as any;

    const result = await handleMidtransNotification(supabase, notification, SERVER_KEY);
    expect(result).toEqual({ status: 'write_failed' });
    expect(userUpdates).toHaveLength(0);
  });

  it('does not grant membership time twice when Midtrans redelivers the same settlement (capture+settlement pair or a retry)', async () => {
    const notification = signedNotification({ transaction_status: 'settlement' });
    const supabase = fakeSupabase({
      orderRow: { id: 'order-1', user_id: 'u1', plan: 'gold', status: 'pending' },
      userRow: { tier: 'free', expires_at: null },
    });

    const first = await handleMidtransNotification(supabase, notification, SERVER_KEY);
    const second = await handleMidtransNotification(supabase, notification, SERVER_KEY);

    expect(first).toEqual({ status: 'updated' });
    expect(second).toEqual({ status: 'updated' }); // still acks success so Midtrans stops retrying
    expect(supabase.userUpdates).toHaveLength(1); // membership grant applied exactly once, not twice
  });

  it('ignores in-progress statuses like pending', async () => {
    const notification = signedNotification({ transaction_status: 'pending' });
    const supabase = fakeSupabase({
      orderRow: { id: 'order-1', user_id: 'u1', plan: 'gold', status: 'pending' },
    });

    const result = await handleMidtransNotification(supabase, notification, SERVER_KEY);
    expect(result).toEqual({ status: 'ignored' });
  });
});
