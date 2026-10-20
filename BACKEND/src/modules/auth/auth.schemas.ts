import { z } from 'zod';
import { normalizePhone } from '../../shared/phone';

const phoneSchema = z
  .string()
  .transform((value, ctx) => {
    const normalized = normalizePhone(value);
    if (!normalized) {
      ctx.addIssue({ code: 'custom', message: 'Invalid phone number' });
      return z.NEVER;
    }
    return normalized;
  });

export const RegisterBody = z
  .object({
    firstName: z.string().trim().min(1).max(60),
    lastName: z.string().trim().min(1).max(60),
    email: z.email().toLowerCase().optional(),
    phone: phoneSchema.optional(),
    password: z.string().min(10, 'Password must be at least 10 characters').max(128),
  })
  .refine((b) => b.email || b.phone, { message: 'Provide an email or a phone number' });
export type RegisterBody = z.infer<typeof RegisterBody>;

export const LoginBody = z.object({
  identifier: z.string().trim().min(3), // email or phone
  password: z.string().min(1),
});
export type LoginBody = z.infer<typeof LoginBody>;

export const RefreshBody = z.object({ refreshToken: z.string().min(10).optional() }).optional();

const totpCode = z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code from your authenticator app');

export const TwoFactorEnableBody = z.object({ code: totpCode });

export const TwoFactorVerifyBody = z.object({
  challengeToken: z.string().min(10),
  code: totpCode,
});
export type TwoFactorVerifyBody = z.infer<typeof TwoFactorVerifyBody>;
