import { z } from "zod";
import {
  bankAction,
  bankBatchAction,
  bankImport,
  bankRowScope,
  bankScope,
  bankSettlement,
} from "./bank-feed-model";
import { defineJsonOperation } from "./json-operation.server";
import {
  bankFeedAttachment,
  bankFeedBatch,
  bankFeedCommand,
  bankFeedDetail,
  bankFeedFile,
  bankFeedList,
  bankFeedRegister,
  bankSettlementPreview,
  importBankFile,
  previewBankImport,
} from "./bank-feed.server";

export const list = defineJsonOperation({ method: "GET" })
  .validator(bankScope)
  .handler(({ data }) => bankFeedList(data));
export const detail = defineJsonOperation({ method: "GET" })
  .validator(bankRowScope)
  .handler(({ data }) => bankFeedDetail(data));
export const register = defineJsonOperation({ method: "GET" })
  .validator(bankScope.extend({ account: z.string().min(1).max(200) }))
  .handler(({ data }) => bankFeedRegister(data));
export const archivedFile = defineJsonOperation({ method: "GET" })
  .validator(bankScope.extend({ id: z.string().min(1).max(200) }))
  .handler(({ data }) => bankFeedFile(data));
export const attachment = defineJsonOperation({ method: "GET" })
  .validator(bankRowScope.extend({ id: z.string().uuid() }))
  .handler(({ data }) => bankFeedAttachment(data));
export const preview = defineJsonOperation({ method: "POST" })
  .validator(bankImport)
  .handler(({ data }) => previewBankImport(data));
export const upload = defineJsonOperation({ method: "POST" })
  .validator(bankImport)
  .handler(({ data }) => importBankFile(data));
export const previewSettlement = defineJsonOperation({ method: "POST" })
  .validator(bankScope.extend({ input: bankSettlement }))
  .handler(({ data }) => bankSettlementPreview(data));
export const command = defineJsonOperation({ method: "POST" })
  .validator(bankScope.extend({ input: bankAction }))
  .handler(({ data }) => bankFeedCommand(data));
export const batch = defineJsonOperation({ method: "POST" })
  .validator(bankScope.extend({ input: bankBatchAction }))
  .handler(({ data }) => bankFeedBatch(data));
