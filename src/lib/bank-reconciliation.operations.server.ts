import {
  reconciliationCreate,
  reconciliationRef,
  reconciliationReopen,
  reconciliationScope,
  reconciliationToggle,
  reconciliationUpdate,
} from "./bank-reconciliation-model";
import { defineJsonOperation } from "./json-operation.server";
import {
  completeReconciliation,
  createReconciliation,
  deleteReconciliation,
  listReconciliations,
  reconciliationDetail,
  reopenReconciliation,
  toggleReconciliationItems,
  updateReconciliation,
} from "./bank-reconciliation.server";

export const list = defineJsonOperation({ method: "GET" })
  .validator(reconciliationScope)
  .handler(({ data }) => listReconciliations(data));
export const detail = defineJsonOperation({ method: "GET" })
  .validator(reconciliationRef)
  .handler(({ data }) => reconciliationDetail(data));
export const create = defineJsonOperation({ method: "POST" })
  .validator(reconciliationCreate)
  .handler(({ data }) => createReconciliation(data));
export const update = defineJsonOperation({ method: "POST" })
  .validator(reconciliationUpdate)
  .handler(({ data }) => updateReconciliation(data));
export const toggle = defineJsonOperation({ method: "POST" })
  .validator(reconciliationToggle)
  .handler(({ data }) => toggleReconciliationItems(data));
export const complete = defineJsonOperation({ method: "POST" })
  .validator(reconciliationRef)
  .handler(({ data }) => completeReconciliation(data));
export const reopen = defineJsonOperation({ method: "POST" })
  .validator(reconciliationReopen)
  .handler(({ data }) => reopenReconciliation(data));
export const remove = defineJsonOperation({ method: "POST" })
  .validator(reconciliationRef)
  .handler(({ data }) => deleteReconciliation(data));
