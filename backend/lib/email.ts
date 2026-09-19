import { Resend } from 'resend';

export interface EmailClient {
  send(params: { to: string[]; subject: string; html: string }): Promise<void>;
}

export function createResendEmailClient(): EmailClient {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('RESEND_API_KEY must be set');
  }
  const resend = new Resend(apiKey);
  return {
    async send({ to, subject, html }) {
      await resend.emails.send({ from: 'Social Trade <notifikasi@socialtrade.id>', to, subject, html });
    },
  };
}
