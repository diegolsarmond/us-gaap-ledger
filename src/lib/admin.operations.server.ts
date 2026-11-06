import { defineJsonOperation } from "./json-operation.server";
import { z } from "zod";
import { profileSchema, userSchema } from "./admin-model";
export const loadAdministration = defineJsonOperation({ method: "GET" }).handler(async () =>
  (await import("./admin.server")).loadAdmin(),
);
export const updateProfile = defineJsonOperation({ method: "POST" })
  .validator(profileSchema)
  .handler(async ({ data }) => (await import("./admin.server")).saveProfile(data));
export const updateUser = defineJsonOperation({ method: "POST" })
  .validator(userSchema)
  .handler(async ({ data }) => (await import("./admin.server")).saveUser(data));
export const resetUserPassword = defineJsonOperation({ method: "POST" })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => (await import("./admin.server")).resetPassword(data.id));
export const getAuditEvents = defineJsonOperation({ method: "GET" })
  .validator(
    z.object({
      page: z.number().int().min(1).max(100000),
      companyId: z.string().uuid().optional(),
      search: z.string().max(200).optional(),
      action: z.string().max(200).optional(),
    }),
  )
  .handler(async ({ data }) =>
    (await import("./admin.server")).loadAudit(data.page, data.companyId, data.search, data.action),
  );
export const deleteUser = defineJsonOperation({ method: "POST" })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => (await import("./admin.server")).deleteUser(data.id));
export const deleteProfile = defineJsonOperation({ method: "POST" })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => (await import("./admin.server")).deleteProfile(data.id));
