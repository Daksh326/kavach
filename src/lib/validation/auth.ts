import { z } from "zod";

export const emailSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
});

export const otpSchema = emailSchema.extend({
  token: z
    .string()
    .trim()
    .regex(/^\d{6}$/),
});

/**
 * Only allow same-site relative paths as post-login destinations, to prevent
 * open redirects (e.g. ?next=//evil.com or /\evil.com).
 */
export const safeNextPath = z
  .string()
  .max(512)
  .regex(/^\/(?![/\\])[^\s]*$/)
  .catch("/dashboard");
