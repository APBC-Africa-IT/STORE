import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

loadEnv({ quiet: true }); // reads .env (never overrides variables that are already set)

const bool = z
  .enum(['true', 'false'])
  .default('true')
  .transform((v) => v === 'true');

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((value) => value.split(',').map((o) => o.trim()).filter(Boolean)),

  // Auth
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  REFRESH_TTL_DAYS_CUSTOMER: z.coerce.number().int().positive().default(30),
  REFRESH_TTL_HOURS_STAFF: z.coerce.number().int().positive().default(12),
  REQUIRE_STAFF_2FA: bool,

  // Security
  FIELD_ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, 'base64').length === 32, 'FIELD_ENCRYPTION_KEY must be 32 bytes, base64-encoded'),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  RATE_LIMIT_LOGIN_MAX: z.coerce.number().int().positive().default(10),

  // Integrations: "fake" = simulated providers (local dev + tests), "live" = real APIs
  INTEGRATIONS_MODE: z.enum(['fake', 'live']).default('fake'),
  PUBLIC_API_BASE_URL: z.url().default('http://localhost:4000'), // where Safaricom sends callbacks

  // M-Pesa Daraja
  MPESA_ENV: z.enum(['sandbox', 'production']).default('sandbox'),
  MPESA_CONSUMER_KEY: z.string().default(''),
  MPESA_CONSUMER_SECRET: z.string().default(''),
  MPESA_SHORTCODE: z.string().default('174379'), // Paybill, or Till "store number"
  MPESA_PARTY_B: z.string().optional(), // Till number for Buy Goods; defaults to the shortcode
  MPESA_PASSKEY: z.string().default(''),
  MPESA_TRANSACTION_TYPE: z.enum(['CustomerPayBillOnline', 'CustomerBuyGoodsOnline']).default('CustomerPayBillOnline'),
  MPESA_CALLBACK_SECRET: z.string().min(24, 'MPESA_CALLBACK_SECRET must be at least 24 characters'),
  MPESA_ALLOWED_IPS: z
    .string()
    .default('')
    .transform((v) => v.split(',').map((ip) => ip.trim()).filter(Boolean)),
}).superRefine((env, ctx) => {
  if (env.INTEGRATIONS_MODE === 'live') {
    for (const key of ['MPESA_CONSUMER_KEY', 'MPESA_CONSUMER_SECRET', 'MPESA_PASSKEY'] as const) {
      if (!env[key]) ctx.addIssue({ code: 'custom', path: [key], message: `${key} is required when INTEGRATIONS_MODE=live` });
    }
  }
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  console.error(z.prettifyError(parsed.error));
  process.exit(1);
}

export const config = parsed.data;
export type Config = typeof config;
export const isDev = config.NODE_ENV === 'development';
export const isTest = config.NODE_ENV === 'test';
