import { jsonClient } from "./json-client";

type Operations = typeof import("./cash-flow.operations.server");
export const loadCashData = jsonClient<Operations["loadCashData"]>(
  "cash-flow",
  "loadCashData",
  "GET",
);
export const saveCashForecast = jsonClient<Operations["saveCashForecast"]>(
  "cash-flow",
  "saveCashForecast",
  "POST",
);
export const saveCashForecasts = jsonClient<Operations["saveCashForecasts"]>(
  "cash-flow",
  "saveCashForecasts",
  "POST",
);
export const saveCashFlowMapping = jsonClient<Operations["saveCashFlowMapping"]>(
  "cash-flow",
  "saveCashFlowMapping",
  "POST",
);
export const saveCashFlowOverride = jsonClient<Operations["saveCashFlowOverride"]>(
  "cash-flow",
  "saveCashFlowOverride",
  "POST",
);
export const loadCashReconciliation = jsonClient<Operations["loadCashReconciliation"]>(
  "cash-flow",
  "loadCashReconciliation",
  "GET",
);
export const saveCashReconciliation = jsonClient<Operations["saveCashReconciliation"]>(
  "cash-flow",
  "saveCashReconciliation",
  "POST",
);
export const checkCashAgainstGl = jsonClient<Operations["checkCashAgainstGl"]>(
  "cash-flow",
  "checkCashAgainstGl",
  "GET",
);
