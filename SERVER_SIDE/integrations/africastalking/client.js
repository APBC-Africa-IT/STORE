/**
 * Africa's Talking SMS integration.
 * Fake mode: logs to console. Live mode: calls AT API via africastalking npm.
 */
import { getConfig } from '../../shared/config/index.js';

let _atInstance = null;

function getAt() {
  if (_atInstance) return _atInstance;
  const config = getConfig();
  const AT = (await import('africastalking')).default;
  _atInstance = AT({ username: config.AT_USERNAME, apiKey: config.AT_API_KEY });
  return _atInstance;
}

/**
 * Send an SMS via Africa's Talking.
 * @param {string} to   - E.164 phone number(s), comma-separated or array
 * @param {string} text - SMS body (≤160 chars preferred)
 * @returns {Promise<{messageId:string, status:string}>}
 */
export async function sendSms(to, text) {
  const config = getConfig();
  const mode = config.INTEGRATIONS_MODE || 'fake';
  const recipients = Array.isArray(to) ? to : [to];

  if (mode !== 'live') {
    console.log(`[AT SMS FAKE] To: ${recipients.join(', ')} | ${text}`);
    return { messageId: `fake_${Date.now()}`, status: 'Success' };
  }

  const AfricasTalking = (await import('africastalking')).default;
  const at = AfricasTalking({ username: config.AT_USERNAME, apiKey: config.AT_API_KEY });
  const sms = at.SMS;

  const result = await sms.send({
    to: recipients,
    message: text,
    from: config.AT_SENDER_ID || 'MYSPARES',
  });

  const msgData = result?.SMSMessageData?.Recipients?.[0];
  return {
    messageId: msgData?.messageId || `at_${Date.now()}`,
    status: msgData?.status || 'Unknown',
  };
}
