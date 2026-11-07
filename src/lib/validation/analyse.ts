import { z } from "zod";

export const ANALYSE_TEXT_MIN = 10;
export const ANALYSE_TEXT_MAX = 5000;
/** Screenshots are shrunk in the browser; this is a hard ceiling after decoding. */
export const ANALYSE_IMAGE_MAX_BYTES = 1_500_000;
export const ANALYSE_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export const analyseTextFormSchema = z.object({
  text: z.string().trim().min(ANALYSE_TEXT_MIN, "tooShort").max(ANALYSE_TEXT_MAX, "tooLong"),
});

export const analyseInputSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), text: analyseTextFormSchema.shape.text }),
  z.object({
    kind: z.literal("image"),
    mimeType: z.enum(ANALYSE_IMAGE_TYPES),
    // base64 of at most ANALYSE_IMAGE_MAX_BYTES
    dataBase64: z
      .string()
      .max(Math.ceil(ANALYSE_IMAGE_MAX_BYTES / 3) * 4)
      .regex(/^[A-Za-z0-9+/]+=*$/),
  }),
]);
