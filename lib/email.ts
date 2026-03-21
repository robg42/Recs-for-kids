import { Resend } from 'resend';

let _client: Resend | null = null;

function getClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  if (!_client) _client = new Resend(apiKey);
  return _client;
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://adventures.robgregg.com';
const FROM_EMAIL = process.env.FROM_EMAIL ?? 'adventures@robgregg.com';

export async function sendMagicLink(email: string, token: string): Promise<boolean> {
  const client = getClient();
  if (!client) {
    console.warn('[email] No Resend API key — magic link:', `${APP_URL}/auth/verify?token=${token}`);
    return false;
  }

  const link = `${APP_URL}/auth/verify?token=${encodeURIComponent(token)}`;

  try {
    const { error } = await client.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: "Your link to Family Adventures 🗺️",
      html: `
        <div style="font-family: 'Helvetica Neue', sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
          <h1 style="font-size: 28px; font-weight: 800; color: #1C1917; margin: 0 0 8px;">
            🗺️ Family Adventures
          </h1>
          <p style="font-size: 16px; color: #78716C; margin: 0 0 32px;">
            Here's your sign-in link. It expires in 15 minutes.
          </p>
          <a href="${link}" style="
            display: inline-block;
            background: #F97316;
            color: #ffffff;
            font-size: 16px;
            font-weight: 700;
            text-decoration: none;
            padding: 16px 32px;
            border-radius: 14px;
          ">
            Open Family Adventures →
          </a>
          <p style="font-size: 13px; color: #A8A29E; margin: 32px 0 0;">
            If you didn't request this, you can safely ignore it.
          </p>
        </div>
      `,
    });

    if (error) {
      console.error('[email] Send error:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[email] Unexpected error:', err);
    return false;
  }
}
