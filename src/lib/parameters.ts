import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mutationSchema } from "./parameters-model";
export const loadParameterCompanies = createServerFn({ method: "GET" }).handler(async () =>
  (await import("./parameters.server")).listParameterCompanies(),
);
export const loadParameters = createServerFn({ method: "GET" })
  .validator(z.object({ companyId: z.string().uuid() }))
  .handler(async ({ data }) =>
    (await import("./parameters.server")).readParameters(data.companyId),
  );
export const mutateParameter = createServerFn({ method: "POST" })
  .validator(mutationSchema)
  .handler(async ({ data }) => (await import("./parameters.server")).writeParameter(data));
