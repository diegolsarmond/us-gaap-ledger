import { z } from "zod";
export const journalConfiguration = z.object({
  companyId: z.string().uuid(),
  openingDate: z.string().date().nullable().default(null),
  approvalRequired: z.boolean(),
  segregateApproval: z.boolean(),
  profiles: z
    .array(
      z.object({
        id: z.string().uuid(),
        approve: z.boolean(),
        post: z.boolean(),
        reverse: z.boolean(),
        soft: z.boolean(),
      }),
    )
    .max(1000),
  accounts: z
    .array(
      z.object({
        code: z.string().min(1),
        active: z.boolean(),
        postingAllowed: z.boolean(),
        costCenterRequired: z.boolean(),
        validFrom: z.string().date().nullable(),
        validTo: z.string().date().nullable(),
      }),
    )
    .max(10000),
});
