import { z } from "zod";

/** Second argument of protected Server Actions: the single-use Turnstile token. */
export const actionMetaSchema = z
  .object({ turnstileToken: z.string().max(4096).optional() })
  .optional()
  .catch(undefined);

export type ActionMeta = z.infer<typeof actionMetaSchema>;
