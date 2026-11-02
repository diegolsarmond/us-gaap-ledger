import { jsonClient } from "./json-client";

export const listVendorAttachments = jsonClient<
  typeof import("./vendor-attachments.operations.server").listVendorAttachments
>("vendor-attachments", "listVendorAttachments", "GET");
export const uploadVendorAttachment = jsonClient<
  typeof import("./vendor-attachments.operations.server").uploadVendorAttachment
>("vendor-attachments", "uploadVendorAttachment", "POST");
export const downloadVendorAttachment = jsonClient<
  typeof import("./vendor-attachments.operations.server").downloadVendorAttachment
>("vendor-attachments", "downloadVendorAttachment", "GET");
export const removeVendorAttachment = jsonClient<
  typeof import("./vendor-attachments.operations.server").removeVendorAttachment
>("vendor-attachments", "removeVendorAttachment", "POST");
