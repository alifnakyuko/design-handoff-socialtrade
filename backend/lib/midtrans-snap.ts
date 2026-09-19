import midtransClient from 'midtrans-client';

export interface SnapClient {
  createTransaction(params: {
    orderId: string;
    grossAmount: number;
    customerEmail: string;
  }): Promise<{ token: string; redirectUrl: string }>;
}

export function createMidtransSnapClient(): SnapClient {
  const serverKey = process.env.MIDTRANS_SERVER_KEY;
  const clientKey = process.env.MIDTRANS_CLIENT_KEY;
  if (!serverKey || !clientKey) {
    throw new Error('MIDTRANS_SERVER_KEY and MIDTRANS_CLIENT_KEY must be set');
  }

  const snap = new midtransClient.Snap({
    isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
    serverKey,
    clientKey,
  });

  return {
    async createTransaction({ orderId, grossAmount, customerEmail }) {
      const transaction = await snap.createTransaction({
        transaction_details: { order_id: orderId, gross_amount: grossAmount },
        customer_details: { email: customerEmail },
      });
      return { token: transaction.token, redirectUrl: transaction.redirect_url };
    },
  };
}
