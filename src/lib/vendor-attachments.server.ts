import { db } from "./db.server";
import { authorizeCompany } from "./companies.server";
import { MAX_VENDOR_ATTACHMENT_BYTES } from "./vendor-model";
type Scope = { companyId: string; vendorId: string };
export async function list(data: Scope): Promise<{ id: string; name: string; size: number }[]> {
  await authorizeCompany(data.companyId);
  const result = await db().query(
    "SELECT id,name,octet_length(content) AS size FROM vendor_attachments WHERE company_id=$1 AND vendor_id=$2 ORDER BY created_at,id",
    [data.companyId, data.vendorId],
  );
  return result.rows;
}
async function mutate(
  data: Scope,
  operation: "upload" | "remove",
  file: { name?: string; content?: Buffer; id?: string },
) {
  const client = await db().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(803003)");
    const auth = await authorizeCompany(data.companyId, "write_accounting", client);
    await client.query("SELECT id FROM companies WHERE id=$1 FOR UPDATE", [data.companyId]);
    const vendor = await client.query(
      "SELECT id FROM ledger_vendors WHERE company_id=$1 AND id=$2",
      [data.companyId, data.vendorId],
    );
    if (!vendor.rowCount) throw new Error("Fornecedor não encontrado.");
    const result =
      operation === "upload"
        ? await client.query(
            "INSERT INTO vendor_attachments(company_id,vendor_id,name,content) VALUES($1,$2,$3,$4) RETURNING id",
            [data.companyId, data.vendorId, file.name, file.content],
          )
        : await client.query(
            "DELETE FROM vendor_attachments WHERE company_id=$1 AND vendor_id=$2 AND id=$3 RETURNING id",
            [data.companyId, data.vendorId, file.id],
          );
    if (!result.rowCount) throw new Error("Anexo não encontrado.");
    await client.query(
      "INSERT INTO system_audit_log(actor_id,actor_name,action,entity,target_id,company_id) VALUES($1,$2,$3,'VendorAttachment',$4,$5)",
      [auth.user.id, auth.user.name, operation, result.rows[0].id, data.companyId],
    );
    await client.query("COMMIT");
    return result.rows[0].id as string;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
export async function upload(data: Scope & { name: string; content: string }) {
  const content = Buffer.from(data.content, "base64");
  if (
    !content.length ||
    content.length > MAX_VENDOR_ATTACHMENT_BYTES ||
    content.toString("base64") !== data.content
  )
    throw new Error("Arquivo inválido. Limite de 20 MB por arquivo.");
  return mutate(data, "upload", { name: data.name, content });
}
export async function remove(data: Scope & { id: string }) {
  await mutate(data, "remove", { id: data.id });
}
export async function download(data: Scope & { id: string }) {
  await authorizeCompany(data.companyId);
  const result = await db().query(
    "SELECT name,content FROM vendor_attachments WHERE company_id=$1 AND vendor_id=$2 AND id=$3",
    [data.companyId, data.vendorId, data.id],
  );
  if (!result.rowCount) throw new Error("Anexo não encontrado.");
  return {
    name: String(result.rows[0].name),
    content: (result.rows[0].content as Buffer).toString("base64"),
  };
}
