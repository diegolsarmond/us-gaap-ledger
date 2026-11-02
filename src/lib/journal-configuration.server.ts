import { authorize } from "./admin.server";
import { authorizeCompany, setActor } from "./companies.server";
import { db } from "./db.server";
import { journalConfiguration } from "./journal-configuration";
import type { z } from "zod";
export async function loadConfiguration(companyId: string) {
  await authorize("manage_profiles");
  await authorizeCompany(companyId);
  const policy = (
    await db().query("SELECT *,opening_date::text FROM accounting_policies WHERE company_id=$1", [
      companyId,
    ])
  ).rows[0];
  const profiles = (
    await db().query(
      `SELECT p.id,p.name,coalesce(j.can_approve,p.system_admin) AS approve,coalesce(j.can_post,p.system_admin) AS post,coalesce(j.can_reverse,p.system_admin) AS reverse,coalesce(j.can_soft_close,false) AS soft FROM access_profiles p LEFT JOIN accounting_profile_permissions j ON j.profile_id=p.id ORDER BY p.name`,
    )
  ).rows as {
    id: string;
    name: string;
    approve: boolean;
    post: boolean;
    reverse: boolean;
    soft: boolean;
  }[];
  const accounts = (
    await db().query(
      `SELECT a.code,a.name,coalesce(r.active,true) AS active,coalesce(r.posting_allowed,true) AS "postingAllowed",coalesce(r.cost_center_required,false) AS "costCenterRequired",r.valid_from::text AS "validFrom",r.valid_to::text AS "validTo" FROM ledger_accounts a LEFT JOIN journal_account_rules r ON r.company_id=a.company_id AND r.account_code=a.code WHERE a.company_id=$1 ORDER BY a.code`,
      [companyId],
    )
  ).rows as {
    code: string;
    name: string;
    active: boolean;
    postingAllowed: boolean;
    costCenterRequired: boolean;
    validFrom: string | null;
    validTo: string | null;
  }[];
  return {
    openingDate: policy?.opening_date ?? null,
    companyId,
    approvalRequired: policy?.approval_required ?? true,
    segregateApproval: policy?.segregate_approval ?? true,
    profiles,
    accounts,
  };
}
export async function saveConfiguration(raw: z.infer<typeof journalConfiguration>) {
  const data = journalConfiguration.parse(raw),
    c = await db().connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT pg_advisory_xact_lock(803003)");
    const auth = await authorize("manage_profiles", c);
    await authorizeCompany(data.companyId, undefined, c);
    await setActor(c, auth.user.id);
    await c.query("SELECT id FROM companies WHERE id=$1 FOR UPDATE", [data.companyId]);
    await c.query(
      "INSERT INTO accounting_policies(company_id,approval_required,segregate_approval,opening_date) VALUES($1,$2,$3,$4) ON CONFLICT(company_id) DO UPDATE SET approval_required=$2,segregate_approval=$3,opening_date=$4",
      [data.companyId, data.approvalRequired, data.segregateApproval, data.openingDate],
    );
    for (const p of data.profiles)
      await c.query(
        "INSERT INTO accounting_profile_permissions(profile_id,can_approve,can_post,can_reverse,can_soft_close) VALUES($1,$2,$3,$4,$5) ON CONFLICT(profile_id) DO UPDATE SET can_approve=$2,can_post=$3,can_reverse=$4,can_soft_close=$5",
        [p.id, p.approve, p.post, p.reverse, p.soft],
      );
    for (const a of data.accounts) {
      if (
        !(
          await c.query("SELECT 1 FROM ledger_accounts WHERE company_id=$1 AND code=$2", [
            data.companyId,
            a.code,
          ])
        ).rowCount
      )
        throw new Error("Account does not belong to company.");
      await c.query(
        "INSERT INTO journal_account_rules(company_id,account_code,active,posting_allowed,cost_center_required,valid_from,valid_to) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(company_id,account_code) DO UPDATE SET active=$3,posting_allowed=$4,cost_center_required=$5,valid_from=$6,valid_to=$7",
        [
          data.companyId,
          a.code,
          a.active,
          a.postingAllowed,
          a.costCenterRequired,
          a.validFrom,
          a.validTo,
        ],
      );
    }
    await c.query(
      `INSERT INTO system_audit_log(actor_id,actor_name,action,entity,target_id,company_id,after_data) VALUES($1,$2,'JOURNAL_CONFIGURATION','AccountingPolicy',$3::text,$3::uuid,$4)`,
      [auth.user.id, auth.user.name, data.companyId, JSON.stringify(data)],
    );
    await c.query("UPDATE companies SET revision=revision+1 WHERE id=$1", [data.companyId]);
    await c.query("COMMIT");
    return { success: true };
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
