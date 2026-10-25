import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
export const loadAccounting = createServerFn({method:"GET"}).validator(z.object({companyId:z.string().uuid()})).handler(async ({data}) => (await import("./accounting.server")).load(data.companyId));
export const runAccountingCommand = createServerFn({method:"POST"}).validator(z.object({companyId:z.string().uuid(),revision:z.number().int().nonnegative(),command:z.string().max(80),args:z.array(z.unknown()).max(5)})).handler(async ({data}) => (await import("./accounting.server")).execute(data));
