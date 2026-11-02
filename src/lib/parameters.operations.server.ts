import { defineJsonOperation } from "./json-operation.server";
import { z } from "zod";
import { mutationSchema } from "./parameters-model";
export const loadParameterCompanies = defineJsonOperation({ method: "GET" }).handler(async () =>
  (await import("./parameters.server")).listParameterCompanies(),
);
export const loadParameters = defineJsonOperation({ method: "GET" })
  .validator(z.object({ companyId: z.string().uuid() }))
  .handler(async ({ data }) =>
    (await import("./parameters.server")).readParameters(data.companyId),
  );
export const mutateParameter = defineJsonOperation({ method: "POST" })
  .validator(mutationSchema)
  .handler(async ({ data }) => (await import("./parameters.server")).writeParameter(data));
