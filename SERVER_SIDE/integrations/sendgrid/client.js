/**
 * SendGrid email integration.
 * Fake mode: logs to console. Live mode: sends via @sendgrid/mail.
 */
import { getConfig } from '../../shared/config/index.js';

/**
 * Send a transactional email.
 * @param {{ to: string, subject: string, html: string, text?: string, attachments?: Array }} opts
 */
export async function sendEmail({ to, subject, html, text, attachments = [] }) {
  const config = getConfig();
  const mode = config.INTEGRATIONS_MODE || 'fake';

  if (mode !== 'live') {
    console.log(`[SENDGRID FAKE] To: ${to} | Subject: ${subject}`);
    return { messageId: `fake_${Date.now()}` };
  }

  const sgMail = (await import('@sendgrid/mail')).default;
  sgMail.setApiKey(config.SENDGRID_API_KEY);

  const msg = {
    to,
    from: config.EMAIL_FROM || 'orders@myspares.co.ke',
    subject,
    html,
    text: text || html.replace(/<[^>]+>/g, ''),
    attachments: attachments.map(a => ({
      content: a.content.toString('base64'),
      filename: a.filename,
      type: a.type || 'application/octet-stream',
      disposition: 'attachment',
    })),
  };

  const [response] = await sgMail.send(msg);
  return { messageId: response.headers['x-message-id'] };
}
