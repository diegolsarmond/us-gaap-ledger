import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getSession = createServerFn({ method: "GET" }).handler(async () => {
  const { readSession } = await import("./auth.server");
  return readSession();
});

export const login = createServerFn({ method: "POST" })
  .validator(z.object({ email: z.string().email().max(254), password: z.string().min(1).max(256) }))
  .handler(async ({ data }) => {
    const { signIn } = await import("./auth.server");
    return signIn(data.email, data.password);
  });

export const logout = createServerFn({ method: "POST" }).handler(async () => {
  const { signOut } = await import("./auth.server");
  return signOut();
});
