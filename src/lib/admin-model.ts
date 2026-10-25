import { z } from "zod";
export const profileSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(120),
  manage_users: z.boolean(),
  manage_profiles: z.boolean(),
  view_audit: z.boolean(),
  write_cash: z.boolean(),
  manage_companies: z.boolean().default(false),
  write_accounting: z.boolean().default(false),
  close_periods: z.boolean().default(false),
  all_companies: z.boolean().default(false),
  company_ids: z.array(z.string().uuid()).max(10000).default([]),
});
export const userSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  profile_id: z.string().uuid(),
  active: z.boolean(),
  password: z.string().min(12).max(256).optional(),
});
export type Profile = z.infer<typeof profileSchema> & { id: string; system_admin: boolean };
export type ManagedUser = {
  id: string;
  name: string;
  email: string;
  profile_id: string | null;
  active: boolean;
};
export type AuditEvent = {
  id: string;
  occurred_at: string;
  actor_name: string;
  action: string;
  entity: string;
  target_id: string;
  before_data: string | null;
  after_data: string | null;
};
export type Permissions = {
  manage_users: boolean;
  manage_profiles: boolean;
  view_audit: boolean;
  write_cash: boolean;
  manage_companies: boolean;
  write_accounting: boolean;
  close_periods: boolean;
};
