/**
 * Zod-validated environment config.
 * The process exits immediately on boot if any required var is missing.
 * Import `config` everywhere — never read process.env directly in business logic.
 */
import { z } from 'zod';
import dotenv from 'dotenv';
dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(5002),

  // Database
  DATABASE_URL: z.string().url(),
  PG_URI: z.string().optional(), // legacy Sequelize — kept for backward compat

  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // JWT
  JWT_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().default(900),           // 15 min
  REFRESH_TTL_CUSTOMER_DAYS: z.coerce.number().default(30),
  REFRESH_TTL_STAFF_HOURS: z.coerce.number().default(12),

  // Encryption / OTP
  FIELD_ENCRYPTION_KEY: z.string().min(64),  // 32 bytes hex = 64 chars
  OTP_HMAC_SECRET: z.string().min(16),

  // CORS
  CORS_ORIGINS: z.string().default('http://localhost:5173,http://localhost:5174,http://localhost:5175'),
  ADMIN_IP_ALLOWLIST: z.string().default(''), // comma-separated CIDRs; empty = disabled

  // Integrations
  INTEGRATIONS_MODE: z.enum(['live', 'fake']).default('fake'),

  // M-Pesa
  MPESA_ENV: z.enum(['sandbox', 'production']).default('sandbox'),
  MPESA_CONSUMER_KEY: z.string().default(''),
  MPESA_CONSUMER_SECRET: z.string().default(''),
  MPESA_SHORTCODE: z.string().default('174379'),
  MPESA_PASSKEY: z.string().default(''),
  MPESA_CALLBACK_SECRET: z.string().default('changeme'),
  MPESA_B2C_INITIATOR: z.string().default(''),
  MPESA_B2C_SECURITY_CREDENTIAL: z.string().default(''),
  MPESA_ALLOWED_IPS: z.string().default(''),

  // Stripe
  STRIPE_SECRET_KEY: z.string().default('sk_test_placeholder'),
  STRIPE_WEBHOOK_SECRET: z.string().default('whsec_placeholder'),

  // Africa's Talking
  AT_USERNAME: z.string().default('sandbox'),
  AT_API_KEY: z.string().default('placeholder'),
  AT_SENDER_ID: z.string().default('MYSPARES'),

  // SendGrid
  SENDGRID_API_KEY: z.string().default('placeholder'),
  EMAIL_USER: z.string().default(''),
  EMAIL_PASS: z.string().default(''),

  // Logging / Observability
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  DOCS_ENABLED: z.string().default('true'),
});

function parseConfig() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('❌  Invalid environment configuration:');
    result.error.errors.forEach(e => {
      console.error(`   ${e.path.join('.')}: ${e.message}`);
    });
    process.exit(1);
  }
  return result.data;
}

export const config = parseConfig();
export default config;
