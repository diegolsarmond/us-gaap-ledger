import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { profileSchema, userSchema } from "./admin-model";
export const loadAdministration = createServerFn({ method: "GET" }).handler(async () =>
  (await import("./admin.server")).loadAdmin(),
);
export const updateProfile = createServerFn({ method: "POST" })
  .validator(profileSchema)
  .handler(async ({ data }) => (await import("./admin.server")).saveProfile(data));
export const updateUser = createServerFn({ method: "POST" })
  .validator(userSchema)
  .handler(async ({ data }) => (await import("./admin.server")).saveUser(data));
export const resetUserPassword = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => (await import("./admin.server")).resetPassword(data.id));
export const getAuditEvents = createServerFn({ method: "GET" })
  .validator(
    z.object({
      page: z.number().int().min(1).max(100000),
      companyId: z.string().uuid().optional(),
    }),
  )
  .handler(async ({ data }) =>
    (await import("./admin.server")).loadAudit(data.page, data.companyId),
  );
