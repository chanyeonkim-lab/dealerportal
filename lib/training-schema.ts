import { z } from "zod";
const questionSchema = z
  .object({
    question: z.string().trim().min(5).max(500),
    options: z.array(z.string().trim().min(1).max(300)).min(2).max(5),
    correct: z.number().int().min(0).max(4),
  })
  .superRefine((q, ctx) => {
    if (q.correct >= q.options.length)
      ctx.addIssue({ code: "custom", message: "Correct option must exist." });
  });
export const courseSchema = z.object({
  title: z.string().trim().min(3).max(160),
  body: z.string().trim().min(30).max(12000),
  questions: z.array(questionSchema).min(1).max(20),
  courseCode: z
    .string()
    .regex(/^[A-Z0-9_-]{2,40}$/)
    .optional(),
  passMark: z.number().int().min(1).max(100).default(80),
});
export type Course = z.infer<typeof courseSchema> & {
  id: string;
  code: string;
  version: number;
  status: string;
  market: string;
};
export const assignmentSchema = z
  .object({
    courseId: z.string().min(1),
    targetType: z.enum(["DEALER_SEGMENT", "ACCOUNT", "CONTACT"]),
    accountId: z.string().optional(),
    contactId: z.string().optional(),
    criteria: z
      .object({
        tier: z.enum(["TIER_1", "TIER_2", "TIER_3"]).optional(),
        lifecycle: z.enum(["NEW", "ESTABLISHED"]).optional(),
      })
      .strict()
      .optional(),
    required: z.boolean().default(true),
    dueDays: z.number().int().min(1).max(365).default(14),
  })
  .strict()
  .superRefine((v, ctx) => {
    const valid =
      v.targetType === "ACCOUNT"
        ? !!v.accountId && !v.contactId && !v.criteria
        : v.targetType === "CONTACT"
          ? !!v.contactId && !v.accountId && !v.criteria
          : !!v.criteria &&
            Object.keys(v.criteria).length > 0 &&
            !v.accountId &&
            !v.contactId;
    if (!valid)
      ctx.addIssue({
        code: "custom",
        message: "Choose exactly one valid assignment target.",
      });
  });
export type AssignmentInput = z.infer<typeof assignmentSchema>;
