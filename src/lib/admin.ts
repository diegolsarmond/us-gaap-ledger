import { jsonClient } from "./json-client";

export const loadAdministration = jsonClient<
  typeof import("./admin.operations.server").loadAdministration
>("admin", "loadAdministration", "GET");
export const updateProfile = jsonClient<typeof import("./admin.operations.server").updateProfile>(
  "admin",
  "updateProfile",
  "POST",
);
export const updateUser = jsonClient<typeof import("./admin.operations.server").updateUser>(
  "admin",
  "updateUser",
  "POST",
);
export const resetUserPassword = jsonClient<
  typeof import("./admin.operations.server").resetUserPassword
>("admin", "resetUserPassword", "POST");
export const getAuditEvents = jsonClient<typeof import("./admin.operations.server").getAuditEvents>(
  "admin",
  "getAuditEvents",
  "GET",
);
export const deleteUser = jsonClient<typeof import("./admin.operations.server").deleteUser>(
  "admin",
  "deleteUser",
  "POST",
);
export const deleteProfile = jsonClient<typeof import("./admin.operations.server").deleteProfile>(
  "admin",
  "deleteProfile",
  "POST",
);
