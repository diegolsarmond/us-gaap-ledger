import { jsonClient } from "./json-client";

export const loadParameterCompanies = jsonClient<
  typeof import("./parameters.operations.server").loadParameterCompanies
>("parameters", "loadParameterCompanies", "GET");
export const loadParameters = jsonClient<
  typeof import("./parameters.operations.server").loadParameters
>("parameters", "loadParameters", "GET");
export const mutateParameter = jsonClient<
  typeof import("./parameters.operations.server").mutateParameter
>("parameters", "mutateParameter", "POST");
