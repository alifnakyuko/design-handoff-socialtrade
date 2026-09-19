declare module 'midtrans-client' {
  interface SnapCreateTransactionParams {
    transaction_details: { order_id: string; gross_amount: number };
    customer_details?: { email?: string; [key: string]: unknown };
    [key: string]: unknown;
  }

  interface SnapCreateTransactionResult {
    token: string;
    redirect_url: string;
    [key: string]: unknown;
  }

  class Snap {
    constructor(options: { isProduction: boolean; serverKey: string; clientKey: string });
    createTransaction(params: SnapCreateTransactionParams): Promise<SnapCreateTransactionResult>;
  }

  const midtransClient: { Snap: typeof Snap };
  export default midtransClient;
}
