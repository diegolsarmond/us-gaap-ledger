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

export const register = createServerFn({ method: "POST" })
  .validator(
    z
      .object({
        name: z.string().trim().min(2).max(120),
        email: z.string().trim().email().max(254),
        password: z.string().min(12).max(256),
        confirmPassword: z.string().min(12).max(256),
      })
      .refine((data) => data.password === data.confirmPassword, {
        message: "As senhas não coincidem.",
        path: ["confirmPassword"],
      }),
  )
  .handler(async ({ data }) => {
    const { registerUser } = await import("./auth.server");
    return registerUser(data.name, data.email, data.password);
  });

export const changePassword = createServerFn({ method: "POST" })
  .validator(
    z
      .object({
        password: z.string().min(12).max(256),
        confirmPassword: z.string().min(12).max(256),
      })
      .refine((data) => data.password === data.confirmPassword, {
        message: "Passwords do not match.",
        path: ["confirmPassword"],
      }),
  )
  .handler(async ({ data }) =>
    (await import("./auth.server")).changeRequiredPassword(data.password),
  );
