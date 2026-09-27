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

type Row = Record<string, any>;

type ForceError = { table: 'orders' | 'users'; when: (patch: Row | null) => boolean; error: any };
type Hook = { table: 'orders' | 'users'; mode: 'select' | 'update'; once?: boolean; fired?: boolean; fn: () => void };

// A small in-memory fake that evaluates filters against real row data (rather than a
// pre-scripted call-chain shape). This means any combination of .eq()/.in()/.is()/.not()/
// .neq()/.select()/.single() the implementation calls, in any order, is exercised by real
// predicate logic instead of needing the mock to separately mirror the exact chain depth --
// a class of bug that has bitten this test file more than once before.
function makeSupabase(
  initial: { orders: Row[]; users: Row[] },
  opts: { forceError?: ForceError[]; hooks?: Hook[] } = {}
) {
  const state = {
    orders: initial.orders.map((r) => ({ ...r })),
    users: initial.users.map((r) => ({ ...r })),
  };
  const orderUpdates: Row[] = [];
  const userUpdates: Row[] = [];

  function builder(tableName: 'orders' | 'users') {
    const filters: Array<(row: Row) => boolean> = [];
    let mode: 'select' | 'update' = 'select';
    let updatePatch: Row | null = null;
    let singleMode = false;

    const self: any = {
      select() {
        return self;
      },
      eq(col: string, val: any) {
        filters.push((row) => row[col] === val);
        return self;
      },
      neq(col: string, val: any) {
        filters.push((row) => row[col] !== val);
        return self;
      },
      lt(col: string, val: any) {
        filters.push((row) => row[col] != null && row[col] < val);
        return self;
      },
      is(col: string, val: any) {
        filters.push((row) => (val === null ? row[col] === null || row[col] === undefined : row[col] === val));
        return self;
      },
      in(col: string, vals: any[]) {
        filters.push((row) => vals.includes(row[col]));
        return self;
      },
      not(col: string, op: string, val: any) {
        if (op === 'is' && val === null) {
          filters.push((row) => row[col] !== null && row[col] !== undefined);
        } else {
          throw new Error(`fake .not() does not support op=${op}`);
        }
        return self;
      },
      update(patch: Row) {
        mode = 'update';
        updatePatch = patch;
        if (tableName === 'orders') orderUpdates.push(patch);
        if (tableName === 'users') userUpdates.push(patch);
        return self;
      },
      single() {
        singleMode = true;
        return self;
      },
      then(resolve: any, reject: any) {
        return execute().then(resolve, reject);
      },
    };

    async function execute() {
      if (mode === 'update') {
        const forced = (opts.forceError ?? []).find((f) => f.table === tableName && f.when(updatePatch));
        if (forced) {
          return { data: null, error: forced.error };
        }
      }

      const table = state[tableName];
      const matched = table.filter((row) => filters.every((f) => f(row)));

      if (mode === 'update' && updatePatch) {
        matched.forEach((row) => Object.assign(row, updatePatch));
      }

      // Snapshot the result BEFORE firing hooks: a hook simulates a concurrent write that
      // happens strictly after this call's own read/write result is already determined, not
      // one that retroactively changes what this call itself sees (that would just make the
      // "concurrent write" invisible to the very call it's supposed to race against).
      const result = singleMode
        ? { data: matched[0] ? { ...matched[0] } : null, error: matched[0] ? null : { message: 'not found' } }
        : { data: matched.map((row) => ({ ...row })), error: null };

      for (const hook of opts.hooks ?? []) {
        if (hook.table === tableName && hook.mode === mode && !(hook.once && hook.fired)) {
          hook.fired = true;
          hook.fn();
        }
      }

      return result;
    }

    return self;
  }

  return {
    orderUpdates,
    userUpdates,
    state,
    from: (table: 'orders' | 'users') => builder(table),
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
    const supabase = makeSupabase({ orders: [], users: [] });
    const result = await handleMidtransNotification(supabase, notification, SERVER_KEY);
    expect(result).toEqual({ status: 'invalid_signature' });
  });

  it('returns order_not_found when no order matches the midtrans order id', async () => {
    const notification = signedNotification({});
    const supabase = makeSupabase({ orders: [], users: [] });
    const result = await handleMidtransNotification(supabase, notification, SERVER_KEY);
    expect(result).toEqual({ status: 'order_not_found' });
  });

  it('marks the order paid and sets tier + expires_at on settlement from free', async () => {
    const notification = signedNotification({ transaction_status: 'settlement' });
    const supabase = makeSupabase({
      orders: [{ id: 'order-1', midtrans_order_id: 'ST-u1-123', user_id: 'u1', plan: 'gold', status: 'pending' }],
      users: [{ id: 'u1', tier: 'free', expires_at: null }],
    });

    const result = await handleMidtransNotification(supabase, notification, SERVER_KEY);

    expect(result).toEqual({ status: 'updated' });
    expect(supabase.state.orders[0]).toMatchObject({ status: 'paid', midtrans_transaction_id: 'tx-1' });
    expect(supabase.state.users[0].tier).toBe('gold');
    expect(supabase.state.users[0].expires_at).not.toBeNull();
  });

  it('does not downgrade a lifetime user who buys a lower plan', async () => {
    const notification = signedNotification({ transaction_status: 'settlement' });
    const supabase = makeSupabase({
      orders: [{ id: 'order-1', midtrans_order_id: 'ST-u1-123', user_id: 'u1', plan: 'silver', status: 'pending' }],
      users: [{ id: 'u1', tier: 'lifetime', expires_at: null }],
    });

    const result = await handleMidtransNotification(supabase, notification, SERVER_KEY);

    expect(result).toEqual({ status: 'updated' });
    expect(supabase.state.users[0]).toMatchObject({ tier: 'lifetime', expires_at: null });
  });

  it('marks the order failed and does not touch the user tier on cancel', async () => {
    const notification = signedNotification({ transaction_status: 'cancel' });
    const supabase = makeSupabase({
      orders: [{ id: 'order-1', midtrans_order_id: 'ST-u1-123', user_id: 'u1', plan: 'gold', status: 'pending' }],
      users: [{ id: 'u1', tier: 'free', expires_at: null }],
    });

    const result = await handleMidtransNotification(supabase, notification, SERVER_KEY);

    expect(result).toEqual({ status: 'updated' });
    expect(supabase.state.orders[0].status).toBe('failed');
    expect(supabase.state.users[0]).toEqual({ id: 'u1', tier: 'free', expires_at: null });
  });

  it('ignores in-progress statuses like pending', async () => {
    const notification = signedNotification({ transaction_status: 'pending' });
    const supabase = makeSupabase({
      orders: [{ id: 'order-1', midtrans_order_id: 'ST-u1-123', user_id: 'u1', plan: 'gold', status: 'pending' }],
      users: [{ id: 'u1', tier: 'free', expires_at: null }],
    });

    const result = await handleMidtransNotification(supabase, notification, SERVER_KEY);
    expect(result).toEqual({ status: 'ignored' });
  });

  it('returns write_failed when reading the current tier fails', async () => {
    const notification = signedNotification({ transaction_status: 'settlement' });
    const supabase = makeSupabase({
      orders: [{ id: 'order-1', midtrans_order_id: 'ST-u1-123', user_id: 'u1', plan: 'silver', status: 'pending' }],
      users: [], // no matching user row -> the .single() read fails
    });

    const result = await handleMidtransNotification(supabase, notification, SERVER_KEY);
    expect(result).toEqual({ status: 'write_failed' });
    // The order transitioned to 'paid' inside grantMembership's caller before the grant was
    // attempted -- but since the grant failed, it must have been reverted back to 'pending'.
    expect(supabase.state.orders[0].status).toBe('pending');
  });

  it('returns write_failed when the paid order update fails', async () => {
    const notification = signedNotification({ transaction_status: 'settlement' });
    const supabase = makeSupabase(
      {
        orders: [{ id: 'order-1', midtrans_order_id: 'ST-u1-123', user_id: 'u1', plan: 'gold', status: 'pending' }],
        users: [{ id: 'u1', tier: 'free', expires_at: null }],
      },
      { forceError: [{ table: 'orders', when: (patch) => patch?.status === 'paid', error: { message: 'db error' } }] }
    );

    const result = await handleMidtransNotification(supabase, notification, SERVER_KEY);
    expect(result).toEqual({ status: 'write_failed' });
    expect(supabase.userUpdates).toHaveLength(0);
  });

  it('does not grant membership time twice when Midtrans redelivers the same settlement (capture+settlement pair or a retry)', async () => {
    const notification = signedNotification({ transaction_status: 'settlement' });
    const supabase = makeSupabase({
      orders: [{ id: 'order-1', midtrans_order_id: 'ST-u1-123', user_id: 'u1', plan: 'gold', status: 'pending' }],
      users: [{ id: 'u1', tier: 'free', expires_at: null }],
    });

    const first = await handleMidtransNotification(supabase, notification, SERVER_KEY);
    const second = await handleMidtransNotification(supabase, notification, SERVER_KEY);

    expect(first).toEqual({ status: 'updated' });
    expect(second).toEqual({ status: 'updated' }); // still acks success so Midtrans stops retrying
    expect(supabase.userUpdates).toHaveLength(1); // membership grant applied exactly once, not twice
  });

  it('grants membership after a denied payment is retried and succeeds under the same order_id', async () => {
    const supabase = makeSupabase({
      orders: [{ id: 'order-1', midtrans_order_id: 'ST-u1-123', user_id: 'u1', plan: 'gold', status: 'pending' }],
      users: [{ id: 'u1', tier: 'free', expires_at: null }],
    });

    const denyResult = await handleMidtransNotification(supabase, signedNotification({ transaction_status: 'deny' }), SERVER_KEY);
    expect(denyResult).toEqual({ status: 'updated' });
    expect(supabase.state.orders[0].status).toBe('failed');
    expect(supabase.state.users[0].tier).toBe('free');

    const settleResult = await handleMidtransNotification(
      supabase,
      signedNotification({ transaction_status: 'settlement', transaction_id: 'tx-2' }),
      SERVER_KEY
    );
    expect(settleResult).toEqual({ status: 'updated' });
    expect(supabase.state.orders[0].status).toBe('paid');
    expect(supabase.state.users[0].tier).toBe('gold');
  });

  it('a late failure notification cannot overwrite an order that already succeeded', async () => {
    const supabase = makeSupabase({
      orders: [{ id: 'order-1', midtrans_order_id: 'ST-u1-123', user_id: 'u1', plan: 'gold', status: 'pending' }],
      users: [{ id: 'u1', tier: 'free', expires_at: null }],
    });

    const settleResult = await handleMidtransNotification(supabase, signedNotification({ transaction_status: 'settlement' }), SERVER_KEY);
    expect(settleResult).toEqual({ status: 'updated' });
    expect(supabase.state.orders[0].status).toBe('paid');

    const lateExpireResult = await handleMidtransNotification(
      supabase,
      signedNotification({ transaction_status: 'expire' }),
      SERVER_KEY
    );
    expect(lateExpireResult).toEqual({ status: 'updated' });
    // The order stays 'paid' -- the late 'expire' notification must not flip it to 'failed'.
    expect(supabase.state.orders[0].status).toBe('paid');
    expect(supabase.state.users[0].tier).toBe('gold');
  });

  it('reverts the order to pending (instead of leaving it stuck paid) when the membership grant fails', async () => {
    const notification = signedNotification({ transaction_status: 'settlement' });
    const supabase = makeSupabase(
      {
        orders: [{ id: 'order-1', midtrans_order_id: 'ST-u1-123', user_id: 'u1', plan: 'gold', status: 'pending' }],
        users: [{ id: 'u1', tier: 'free', expires_at: null }],
      },
      { forceError: [{ table: 'users', when: (patch) => patch?.tier != null, error: { message: 'db error' } }] }
    );

    const result = await handleMidtransNotification(supabase, notification, SERVER_KEY);

    expect(result).toEqual({ status: 'write_failed' });
    expect(supabase.state.orders[0].status).toBe('pending');
    expect(supabase.state.users[0].tier).toBe('free');
  });

  it('does not silently overwrite a concurrent order for the same user; retries against fresh state', async () => {
    // Simulates two near-simultaneous orders for the same user: right after this
    // notification's grant logic reads the user row (free, no expiry), a concurrent order
    // for the same user is applied (as if another webhook call already granted 'silver').
    // The optimistic write for THIS notification must lose that race, detect it, and retry
    // against the fresh ('silver') state rather than blindly overwriting it.
    const supabase = makeSupabase(
      {
        orders: [{ id: 'order-1', midtrans_order_id: 'ST-u1-123', user_id: 'u1', plan: 'gold', status: 'pending' }],
        users: [{ id: 'u1', tier: 'free', expires_at: null }],
      },
      {
        hooks: [
          {
            table: 'users',
            mode: 'select',
            once: true,
            fn: () => {
              const silverExpiry = new Date(Date.now() + 100 * 24 * 60 * 60 * 1000).toISOString();
              supabase.state.users[0].tier = 'silver';
              supabase.state.users[0].expires_at = silverExpiry;
            },
          },
        ],
      }
    );

    const result = await handleMidtransNotification(supabase, signedNotification({ transaction_status: 'settlement' }), SERVER_KEY);

    expect(result).toEqual({ status: 'updated' });
    // Two attempts: the first optimistic write (against the stale 'free' read) must have
    // lost the race and been retried against the fresh 'silver' state.
    expect(supabase.userUpdates).toHaveLength(2);
    expect(supabase.state.users[0].tier).toBe('gold'); // final state reflects the retry's upgrade from silver, not free
  });

  it('optimistic concurrency guard matches on the exact stored expires_at value, including sub-millisecond precision', async () => {
    // Real Postgres/PostgREST timestamptz values can carry microsecond precision (e.g.
    // "...123456Z"), which `new Date(x).toISOString()` always collapses to millisecond
    // precision when re-serialized. If the optimistic-concurrency filter re-serialized the
    // read value instead of reusing the exact raw string, it would never match such a row
    // and the grant would fail forever for that user (this happened with a manually
    // SQL-backfilled expires_at, which is exactly what this project's own deployment docs
    // recommend for legacy users -- see the spec's "Deployment Note").
    const future = new Date(Date.now() + 100 * 24 * 60 * 60 * 1000);
    const roundTripped = future.toISOString(); // e.g. "...T01:02:03.123Z"
    const microPrecisionExpiry = `${roundTripped.slice(0, -1)}456Z`; // "...T01:02:03.123456Z" -- extra digits `new Date(...).toISOString()` would silently drop

    const supabase = makeSupabase({
      orders: [{ id: 'order-1', midtrans_order_id: 'ST-u1-123', user_id: 'u1', plan: 'gold', status: 'pending' }],
      users: [{ id: 'u1', tier: 'silver', expires_at: microPrecisionExpiry }],
    });

    const result = await handleMidtransNotification(supabase, signedNotification({ transaction_status: 'settlement' }), SERVER_KEY);

    expect(result).toEqual({ status: 'updated' });
    expect(supabase.state.users[0].tier).toBe('gold');
    expect(supabase.userUpdates).toHaveLength(1); // matched and wrote on the first attempt, no spurious retry
  });
});
