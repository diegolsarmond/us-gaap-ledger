import { jsonClient } from "./json-client";

export const getSession = jsonClient<typeof import("./auth.operations.server").getSession>(
  "auth",
  "getSession",
  "GET",
);
export const login = jsonClient<typeof import("./auth.operations.server").login>(
  "auth",
  "login",
  "POST",
);
export const logout = jsonClient<typeof import("./auth.operations.server").logout>(
  "auth",
  "logout",
  "POST",
);
export const register = jsonClient<typeof import("./auth.operations.server").register>(
  "auth",
  "register",
  "POST",
);
export const changePassword = jsonClient<typeof import("./auth.operations.server").changePassword>(
  "auth",
  "changePassword",
  "POST",
);
