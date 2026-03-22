import nodemailer from 'nodemailer';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://adventures.robgregg.com';

function getTransporter() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;

  if (!user || !pass) return null;

  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });
}

export async function sendMagicLink(email: string, token: string): Promise<boolean> {
  const transporter = getTransporter();

  if (!transporter) {
    // Never log the token — only note that a link was generated
    console.warn('[email] Gmail credentials not set — magic link generated for:', email, '(token withheld from logs)');
    return false;
  }

  const link = `${APP_URL}/api/auth/verify?token=${encodeURIComponent(token)}`;
  const from = process.env.GMAIL_USER;

  try {
    await transporter.sendMail({
      from: `"Adventure Time! 🗺️" <${from}>`,
      to: email,
      subject: 'Your sign-in link for Adventure Time!',
      html: `
        <div style="font-family: 'Helvetica Neue', sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
          <h1 style="font-size: 28px; font-weight: 800; color: #1C1917; margin: 0 0 8px;">
            🗺️ Adventure Time!
          </h1>
          <p style="font-size: 16px; color: #78716C; margin: 0 0 32px;">
            Here's your sign-in link. It expires in 15 minutes and can only be used once.
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
            Open Adventure Time! →
          </a>
          <p style="font-size: 13px; color: #A8A29E; margin: 32px 0 0;">
            If you didn't request this, you can safely ignore it.
          </p>
        </div>
      `,
      text: `Sign in to Adventure Time!\n\nClick this link (expires in 15 minutes):\n${link}\n\nIf you didn't request this, ignore this email.`,
    });
    return true;
  } catch (err) {
    console.error('[email] Failed to send to:', email, (err as Error).message);
    return false;
  }
}
