import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { MAX_VENDOR_ATTACHMENT_BYTES } from "./vendor-model";
const scope = z.object({ companyId: z.string().uuid(), vendorId: z.string().min(1).max(120) });
export const listVendorAttachments = createServerFn({ method: "GET" })
  .validator(scope)
  .handler(async ({ data }) => (await import("./vendor-attachments.server")).list(data));
export const uploadVendorAttachment = createServerFn({ method: "POST" })
  .validator(
    scope.extend({
      name: z.string().trim().min(1).max(255),
      content: z
        .string()
        .min(4)
        .max(4 * Math.ceil(MAX_VENDOR_ATTACHMENT_BYTES / 3))
        .regex(/^[A-Za-z0-9+/]*={0,2}$/),
    }),
  )
  .handler(async ({ data }) => (await import("./vendor-attachments.server")).upload(data));
export const downloadVendorAttachment = createServerFn({ method: "GET" })
  .validator(scope.extend({ id: z.string().uuid() }))
  .handler(async ({ data }) => (await import("./vendor-attachments.server")).download(data));
export const removeVendorAttachment = createServerFn({ method: "POST" })
  .validator(scope.extend({ id: z.string().uuid() }))
  .handler(async ({ data }) => (await import("./vendor-attachments.server")).remove(data));
