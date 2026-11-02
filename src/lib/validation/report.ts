import { z } from "zod";
import { Constants } from "@/lib/supabase/database.types";
import {
  REPORT_IDENTIFIER_TYPES,
  SOCIAL_PLATFORMS,
  normalizeReportIdentifierPrimary,
} from "@/lib/identifiers/basic";

const E = Constants.public.Enums;

/** Bumped whenever the consent text changes; stored with each report. */
export const CONSENT_VERSION = "v1";

export const MAX_REPORT_IDENTIFIERS = 10;

export const identifierEntrySchema = z
  .object({
    type: z.enum(REPORT_IDENTIFIER_TYPES),
    value: z.string().trim().min(1, "required").max(512),
    platform: z.enum(SOCIAL_PLATFORMS).optional(),
  })
  .refine((v) => normalizeReportIdentifierPrimary(v) !== null, {
    message: "invalidIdentifier",
    path: ["value"],
  });

export type IdentifierEntry = z.infer<typeof identifierEntrySchema>;

const todayIso = () => new Date().toISOString().slice(0, 10);

/**
 * The wizard's form values. Text inputs stay strings ("" = not given) so the
 * same schema drives React Hook Form and the Server Action.
 */
export const reportFormSchema = z
  .object({
    category: z.enum(E.scam_category, { error: "required" }),
    description: z.string().max(5000),
    channel: z.enum(E.report_channel, { error: "required" }),
    identifiers: z.array(identifierEntrySchema).max(MAX_REPORT_IDENTIFIERS),
    incidentDate: z
      .string()
      .refine(
        (v) => v === "" || (/^\d{4}-\d{2}-\d{2}$/.test(v) && v >= "2000-01-02" && v <= todayIso()),
        {
          message: "invalidDate",
        },
      ),
    lostMoney: z.enum(["yes", "no"], { error: "required" }),
    amountLost: z.string().trim(),
    paymentMethod: z.union([z.enum(E.payment_method), z.literal("")]),
    bankAccountLast4: z
      .string()
      .trim()
      .regex(/^(\d{4})?$/, "invalidLast4"),
    transactionRef: z
      .string()
      .trim()
      .regex(/^([A-Za-z0-9-]{6,40})?$/, "invalidTransactionRef"),
    consent: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.lostMoney === "yes") {
      const n = Number(v.amountLost.replace(/,/g, ""));
      if (!v.amountLost || !Number.isFinite(n) || n <= 0 || n >= 1e11) {
        ctx.addIssue({ code: "custom", path: ["amountLost"], message: "invalidAmount" });
      }
    }
  });

export type ReportFormValues = z.infer<typeof reportFormSchema>;

/** Final submission: consent must be explicitly given. */
export const reportSubmitSchema = reportFormSchema.refine((v) => v.consent === true, {
  message: "consentRequired",
  path: ["consent"],
});

export const emptyReportForm: ReportFormValues = {
  category: undefined as unknown as ReportFormValues["category"],
  description: "",
  channel: undefined as unknown as ReportFormValues["channel"],
  identifiers: [],
  incidentDate: "",
  lostMoney: undefined as unknown as ReportFormValues["lostMoney"],
  amountLost: "",
  paymentMethod: "",
  bankAccountLast4: "",
  transactionRef: "",
  consent: false,
};

export const evidenceUploadRequestSchema = z.object({
  reportId: z.uuid(),
  fileName: z.string().min(1).max(500),
  mimeType: z.string().max(100),
  sizeBytes: z.number().int().positive(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  md5: z.string().regex(/^[0-9a-f]{32}$/),
});

export const evidenceConfirmSchema = z.object({
  ticket: z.string().min(10).max(2000),
  fileName: z.string().min(1).max(500),
});

export const reportStatusSchema = z.object({
  reportId: z.uuid(),
  status: z.enum(E.report_status),
});

export const reportIdSchema = z.object({ reportId: z.uuid() });
