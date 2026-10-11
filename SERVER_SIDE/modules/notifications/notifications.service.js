/**
 * Notifications service.
 * Sends SMS (Africa's Talking) and email (SendGrid).
 * All sends are idempotent via NotificationLog (eventId + channel + recipient unique index).
 * Never throws — failures are logged and recorded; they must not break business flows.
 */
import { prisma } from '../../shared/db/prisma.js';
import { sendSms } from '../../integrations/africastalking/client.js';
import { sendEmail } from '../../integrations/sendgrid/client.js';

// ── Core idempotent send ──────────────────────────────────────────────────

/**
 * Record + dispatch a notification. Idempotent on (eventId, channel, recipient).
 * @param {{ channel:'SMS'|'EMAIL', template:string, recipient:string, data:object, eventId?:string }} opts
 */
export async function sendNotification({ channel, template, recipient, data, eventId = null }) {
  // Idempotency check
  if (eventId) {
    const existing = await prisma.notificationLog.findUnique({
      where: { eventId_channel_recipient: { eventId, channel, recipient } },
    }).catch(() => null);
    if (existing && existing.status === 'SENT') return existing;
  }

  let logId;
  try {
    const log = await prisma.notificationLog.upsert({
      where: eventId
        ? { eventId_channel_recipient: { eventId, channel, recipient } }
        : { id: 'non-existent-will-create' },
      update: {},
      create: { channel, template, recipient, eventId, status: 'QUEUED' },
    }).catch(async () => {
      // If upsert fails (no eventId), just create
      return prisma.notificationLog.create({
        data: { channel, template, recipient, eventId, status: 'QUEUED' },
      });
    });
    logId = log.id;
  } catch (e) {
    console.error('[notifications] Failed to create log entry:', e.message);
  }

  try {
    let providerRef;
    if (channel === 'SMS') {
      const rendered = renderSms(template, data);
      const result = await sendSms(recipient, rendered);
      providerRef = result.messageId;
    } else if (channel === 'EMAIL') {
      const rendered = renderEmail(template, data);
      const result = await sendEmail({ to: recipient, subject: rendered.subject, html: rendered.html });
      providerRef = result.messageId;
    }

    if (logId) {
      await prisma.notificationLog.update({
        where: { id: logId },
        data: { status: 'SENT', providerRef: providerRef || null },
      }).catch(() => {});
    }
  } catch (err) {
    console.error(`[notifications] Failed to send ${channel} to ${recipient}:`, err.message);
    if (logId) {
      await prisma.notificationLog.update({
        where: { id: logId },
        data: { status: 'FAILED', error: err.message.slice(0, 500) },
      }).catch(() => {});
    }
  }
}

// ── Convenience wrappers (used by auth, orders, logistics, etc.) ──────────

export async function sendVerificationEmail(user, token) {
  const appUrl = process.env.APP_URL || process.env.APP_BASE_URL || 'http://localhost:4000';
  await sendNotification({
    channel: 'EMAIL',
    template: 'EMAIL_VERIFICATION',
    recipient: user.email,
    data: {
      firstName: user.firstName || 'Customer',
      link: `${appUrl}/verify-email/${user.id}/${token}`,
    },
  });
}

export async function sendResetPasswordEmail(email, link) {
  await sendNotification({
    channel: 'EMAIL',
    template: 'PASSWORD_RESET',
    recipient: email,
    data: { link },
  });
}

export async function sendOtpSms(phone, code) {
  await sendNotification({
    channel: 'SMS',
    template: 'OTP',
    recipient: phone,
    data: { code },
  });
}

export async function sendOrderPlacedSms(phone, orderNumber) {
  await sendNotification({
    channel: 'SMS',
    template: 'ORDER_PLACED',
    recipient: phone,
    data: { orderNumber },
  });
}

export async function sendOrderStatusSms(phone, orderNumber, statusText) {
  await sendNotification({
    channel: 'SMS',
    template: 'ORDER_STATUS',
    recipient: phone,
    data: { orderNumber, statusText },
  });
}

export async function sendRiderAssignedSms(phone, jobNumber, details) {
  await sendNotification({
    channel: 'SMS',
    template: 'RIDER_JOB_ASSIGNED',
    recipient: phone,
    data: { jobNumber, ...details },
  });
}

export async function sendCollectionCodeSms(phone, code, supplierName) {
  await sendNotification({
    channel: 'SMS',
    template: 'COLLECTION_CODE',
    recipient: phone,
    data: { code, supplierName },
  });
}

export async function sendDeliveryOutForDeliverySms(phone, orderNumber, riderName, riderPhone) {
  await sendNotification({
    channel: 'SMS',
    template: 'OUT_FOR_DELIVERY',
    recipient: phone,
    data: { orderNumber, riderName, riderPhone },
  });
}

export async function sendReadyForCollectionSms(phone, orderNumber) {
  await sendNotification({
    channel: 'SMS',
    template: 'READY_FOR_COLLECTION',
    recipient: phone,
    data: { orderNumber },
  });
}

export async function sendPaymentLinkSms(phone, link, amountCents) {
  await sendNotification({
    channel: 'SMS',
    template: 'PAYMENT_LINK',
    recipient: phone,
    data: { link, amount: (amountCents / 100).toFixed(0) },
  });
}

export async function sendLowStockAlertEmail(email, products) {
  await sendNotification({
    channel: 'EMAIL',
    template: 'LOW_STOCK_ALERT',
    recipient: email,
    data: { products },
  });
}

// ── Template renderers ────────────────────────────────────────────────────

const SMS_TEMPLATES = {
  OTP: (d) => `MySpares: Your OTP is ${d.code}. Valid for 5 minutes. Do not share.`,
  ORDER_PLACED: (d) => `MySpares: Your order ${d.orderNumber} has been placed! We'll update you as we process it.`,
  ORDER_STATUS: (d) => `MySpares: Order ${d.orderNumber} update — ${d.statusText}`,
  RIDER_JOB_ASSIGNED: (d) => `MySpares: New job ${d.jobNumber} assigned. Check the app for details.`,
  COLLECTION_CODE: (d) => `MySpares: Your collection code for ${d.supplierName} is ${d.code}. Present this to the supplier.`,
  OUT_FOR_DELIVERY: (d) => `MySpares: Your order is on the way! Rider: ${d.riderName} (${d.riderPhone}). Order: ${d.orderNumber}`,
  READY_FOR_COLLECTION: (d) => `MySpares: Your order ${d.orderNumber} is ready for collection at our hub.`,
  PAYMENT_LINK: (d) => `MySpares: Pay KES ${d.amount} for your order: ${d.link}`,
  LOW_STOCK_ALERT: (d) => `MySpares: ${d.products?.length || 0} product(s) are running low on stock.`,
  DEFAULT: (d) => `MySpares notification.`,
};

const EMAIL_TEMPLATES = {
  EMAIL_VERIFICATION: (d) => ({
    subject: 'Verify your MySpares account',
    html: `<p>Hi ${d.firstName},</p><p>Click <a href="${d.link}">here</a> to verify your email.</p><p>Link expires in 24 hours.</p>`,
  }),
  PASSWORD_RESET: (d) => ({
    subject: 'Reset your MySpares password',
    html: `<p>Click <a href="${d.link}">here</a> to reset your password.</p><p>This link expires in 1 hour.</p><p>If you did not request this, ignore this email.</p>`,
  }),
  LOW_STOCK_ALERT: (d) => ({
    subject: 'MySpares: Low Stock Alert',
    html: `<p>The following products are running low:</p><ul>${(d.products || []).map(p => `<li>${p.name} — ${p.available} left</li>`).join('')}</ul>`,
  }),
  DEFAULT: () => ({ subject: 'MySpares notification', html: '<p>You have a notification from MySpares.</p>' }),
};

function renderSms(template, data) {
  const fn = SMS_TEMPLATES[template] || SMS_TEMPLATES.DEFAULT;
  return fn(data);
}

function renderEmail(template, data) {
  const fn = EMAIL_TEMPLATES[template] || EMAIL_TEMPLATES.DEFAULT;
  return fn(data);
}
