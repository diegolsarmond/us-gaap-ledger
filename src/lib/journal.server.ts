import { createHash } from "node:crypto";
import type { PoolClient, QueryResultRow } from "pg";
import { db } from "./db.server";
import { authorize } from "./admin.server";
import { authorizeCompany, setActor } from "./companies.server";
import { readLedger } from "./ledger-storage.server";
import { journalRequest, type JournalInput, type JournalRequest } from "./journal-model";
interface Journal extends QueryResultRow {
  id: string;
  tenant_id: string;
  company_id: string;
  journal_type: string;
  accounting_date: string;
  description: string;
  reference: string;
  transaction_currency: string;
  exchange_rate: string;
  exchange_rate_source: string;
  status: string;
  version: number;
  created_by: string;
  payload_hash: string;
  fiscal_period_id: string;
  source_module: string;
}
interface Line extends QueryResultRow {
  account_code: string;
  description: string;
  debit: string;
  credit: string;
  base_debit: string;
  base_credit: string;
  cost_center_id: string | null;
  project_id: string | null;
  customer_id: string | null;
  vendor_id: string | null;
}
async function audit(
  c: PoolClient,
  j: Journal,
  actor: { id: string; name: string },
  action: string,
  reason = "",
) {
  const event = await c.query(
    `INSERT INTO system_audit_log(actor_id,actor_name,action,entity,target_id,company_id,after_data)
 SELECT $2,$3,$4,'JournalEntry',id::text,company_id,to_jsonb(j) || jsonb_build_object('lines',(SELECT jsonb_agg(to_jsonb(l) ORDER BY line_number) FROM journal_entry_lines l WHERE journal_entry_id=j.id),'reason',$5::text) FROM journal_entries j WHERE id=$1 RETURNING id`,
    [j.id, actor.id, actor.name, action, reason],
  );
  await c.query(
    "INSERT INTO journal_events(journal_entry_id,actor_id,action,reason,audit_event_id) VALUES($1,$2,$3,$4,$5)",
    [j.id, actor.id, action, reason, event.rows[0].id],
  );
}
async function validate(
  c: PoolClient,
  company: string,
  v: JournalInput,
  soft: boolean,
  posting = false,
  draft = false,
) {
  if (!draft && !v.description.trim())
    throw new Error("Describe the operational event before submitting.");
  if (v.journalType === "Opening") {
    const policy = (
      await c.query("SELECT opening_date::text FROM accounting_policies WHERE company_id=$1", [
        company,
      ])
    ).rows[0];
    if (policy?.opening_date !== v.accountingDate)
      throw new Error(
        "Opening journals require the authorized migration date in accounting policies.",
      );
    if (
      posting &&
      (
        await c.query(
          `SELECT 1 FROM ledger_journals WHERE company_id=$1 AND date<=$2 AND status IN ('Posted','Reversed') UNION ALL SELECT 1 FROM journal_entries WHERE company_id=$1 AND accounting_date<=$2 AND status='Posted' LIMIT 1`,
          [company, v.accountingDate],
        )
      ).rowCount
    )
      throw new Error("Opening balances cannot overlap existing posted history.");
  }
  const periods = await readLedger(c, company, "fiscalPeriods");
  const matches = periods.filter(
    (p) => String(p["startDate"]) <= v.accountingDate && String(p["endDate"]) >= v.accountingDate,
  );
  if (!matches.length)
    throw new Error(
      `No fiscal period covers ${v.accountingDate}. Add a period in Settings → Fiscal Periods.`,
    );
  if (matches.length > 1)
    throw new Error(
      `More than one fiscal period covers ${v.accountingDate}. Resolve the overlapping dates in Settings → Fiscal Periods.`,
    );
  const period = matches[0]!;
  if (
    posting &&
    (["Locked", "Closed"].includes(String(period["status"])) ||
      (period["status"] === "Soft-Close" && !soft))
  )
    throw new Error("Fiscal period is closed or requires special authorization.");
  const collections: Awaited<ReturnType<typeof readLedger>>[] = [];
  for (const domain of [
    "accounts",
    "currencies",
    "costCenters",
    "projects",
    "customers",
    "vendors",
  ])
    collections.push(await readLedger(c, company, domain));
  const [accounts, currencies, centers, projects, customers, vendors] = collections;
  if (!currencies!.some((c) => c["code"] === v.currency && c["status"] === "Active"))
    throw new Error("Select an active company currency.");
  const precision =
    new Intl.NumberFormat("en", { style: "currency", currency: v.currency }).resolvedOptions()
      .maximumFractionDigits ?? 2;
  if (precision > 4) throw new Error("Unsupported currency precision.");
  const rules = (
    await c.query(
      "SELECT *,valid_from::text,valid_to::text FROM journal_account_rules WHERE company_id=$1",
      [company],
    )
  ).rows;
  for (const l of v.lines) {
    if (
      (!(draft && !l.accountCode) && !accounts!.some((a) => a["code"] === l.accountCode)) ||
      accounts!.some((a) => a["parentCode"] === l.accountCode)
    )
      throw new Error("Select an existing analytical account belonging to this company.");
    const r = rules.find((r) => r.account_code === l.accountCode);
    if (
      r &&
      (!r.active ||
        !r.posting_allowed ||
        (r.valid_from && r.valid_from > v.accountingDate) ||
        (r.valid_to && r.valid_to < v.accountingDate) ||
        (!draft && r.cost_center_required && !l.costCenterId))
    )
      throw new Error("Account is inactive, blocked, outside validity or requires a cost center.");
    for (const [id, records] of [
      [l.costCenterId, centers],
      [l.projectId, projects],
      [l.customerId, customers],
      [l.vendorId, vendors],
    ] as const)
      if (id && !records!.some((x) => x["id"] === id && x["status"] !== "Inactive"))
        throw new Error("Dimension does not belong to this company or is inactive.");
    const amount = await c.query(
      `SELECT $1::numeric>=0 AND $2::numeric>=0 AND (($1::numeric>0 AND $2::numeric=0) OR ($2::numeric>0 AND $1::numeric=0) OR ($4::boolean AND $1::numeric=0 AND $2::numeric=0)) AND round($1::numeric,$3)=$1::numeric AND round($2::numeric,$3)=$2::numeric AS valid`,
      [l.debit, l.credit, precision, draft],
    );
    if (!amount.rows[0].valid)
      throw new Error("Each line needs one positive debit or credit at the currency precision.");
  }
  const rate = await c.query("SELECT $1::numeric>0 AND ($2<>'USD' OR $1::numeric=1) AS valid", [
    v.exchangeRate,
    v.currency,
  ]);
  if (!rate.rows[0].valid) throw new Error("Invalid exchange rate; USD requires parity 1.");
  return String(period["id"]);
}
async function replaceLines(
  c: PoolClient,
  j: Journal,
  v: JournalInput,
  bases?: { debit: string; credit: string }[],
) {
  await c.query("DELETE FROM journal_entry_lines WHERE journal_entry_id=$1", [j.id]);
  for (const [i, l] of v.lines.entries())
    await c.query(
      `INSERT INTO journal_entry_lines(tenant_id,company_id,journal_entry_id,line_number,account_code,description,debit,credit,base_debit,base_credit,cost_center_id,project_id,customer_id,vendor_id) VALUES($1,$2,$3,$4,$5,$6,$7::numeric,$8::numeric,coalesce($14::numeric,round($7::numeric*$9::numeric,2)),coalesce($15::numeric,round($8::numeric*$9::numeric,2)),$10,$11,$12,$13)`,
      [
        j.tenant_id,
        j.company_id,
        j.id,
        i + 1,
        l.accountCode || null,
        l.description,
        l.debit,
        l.credit,
        v.exchangeRate,
        l.costCenterId || null,
        l.projectId || null,
        l.customerId || null,
        l.vendorId || null,
        bases?.[i]?.debit ?? null,
        bases?.[i]?.credit ?? null,
      ],
    );
}
async function balanced(c: PoolClient, id: string) {
  if (
    !(
      await c.query(
        "SELECT count(*)>=2 AND sum(debit-credit)=0 AND sum(base_debit-base_credit)=0 AS valid FROM journal_entry_lines WHERE journal_entry_id=$1",
        [id],
      )
    ).rows[0].valid
  )
    throw new Error("Journal must balance exactly in transaction and functional currencies.");
}
function toInput(j: Journal, ls: Line[]): JournalInput {
  return {
    journalType:
      j.journal_type === "Reversal"
        ? "Adjustment"
        : (j.journal_type as JournalInput["journalType"]),
    accountingDate: j.accounting_date,
    description: j.description,
    reference: j.reference,
    currency: j.transaction_currency,
    exchangeRate: j.exchange_rate,
    exchangeRateSource: j.exchange_rate_source,
    lines: ls.map((l) => ({
      accountCode: l.account_code || "",
      description: l.description,
      debit: l.debit,
      credit: l.credit,
      costCenterId: l.cost_center_id || undefined,
      projectId: l.project_id || undefined,
      customerId: l.customer_id || undefined,
      vendorId: l.vendor_id || undefined,
    })),
  };
}
async function create(
  c: PoolClient,
  tenant: string,
  company: string,
  actor: string,
  v: JournalInput,
  period: string,
  source?: JournalRequest["source"],
  hash?: string,
  reversalOf?: string,
): Promise<Journal> {
  return (
    await c.query<Journal>(
      `INSERT INTO journal_entries(tenant_id,company_id,journal_type,accounting_date,fiscal_period_id,description,reference,transaction_currency,exchange_rate,exchange_rate_source,created_by,source_module,source_type,source_id,source_event_id,source_event_version,idempotency_key,payload_hash,reversal_of_entry_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *,accounting_date::text`,
      [
        tenant,
        company,
        reversalOf || (source?.module === bankJournalModule && source.type === "BankFeedReversal")
          ? "Reversal"
          : source
            ? "Automatic"
            : v.journalType,
        v.accountingDate,
        period,
        v.description,
        v.reference,
        v.currency,
        v.exchangeRate,
        v.exchangeRateSource,
        actor,
        source?.module ?? "Journal Entries",
        source?.type ?? "Manual",
        source?.id ?? "",
        source?.eventId ?? null,
        source?.eventVersion ?? null,
        source?.idempotencyKey ?? null,
        hash ?? null,
        reversalOf ?? null,
      ],
    )
  ).rows[0]!;
}

type Actor = { id: string; name: string };
export const bankJournalModule = "Bank Feed";

export async function journalPostingAccess(c: PoolClient, companyId: string, actorId: string) {
  const tenant = (await c.query("SELECT id FROM accounting_tenant WHERE singleton")).rows[0]
    .id as string;
  const grant = (
    await c.query(
      `SELECT coalesce(j.can_approve,p.system_admin) AS approve,coalesce(j.can_post,p.system_admin) AS post,coalesce(j.can_reverse,p.system_admin) AS reverse,coalesce(j.can_soft_close,false) AS soft FROM app_users u JOIN access_profiles p ON p.id=u.profile_id LEFT JOIN accounting_profile_permissions j ON j.profile_id=p.id WHERE u.id=$1`,
      [actorId],
    )
  ).rows[0] as { approve: boolean; post: boolean; reverse: boolean; soft: boolean };
  const policy = (
    await c.query("SELECT *,opening_date::text FROM accounting_policies WHERE company_id=$1", [
      companyId,
    ])
  ).rows[0] ?? { approval_required: true, segregate_approval: true };
  return { tenant, grant, policy };
}

async function markPosted(c: PoolClient, j: Journal, actor: Actor) {
  if (j.source_module === bankJournalModule && j.source_type !== "BankFeedReversal") {
    const opening = await c.query(
      `SELECT 1 FROM journal_entries
       WHERE company_id=$1 AND journal_type='Opening' AND status='Posted'
         AND accounting_date >= $2 LIMIT 1`,
      [j.company_id, j.accounting_date],
    );
    if (opening.rowCount)
      throw new Error("Bank Feed posting overlaps the posted opening balance.");
  }
  await balanced(c, j.id);
  await c.query("INSERT INTO accounting_policies(company_id) VALUES($1) ON CONFLICT DO NOTHING", [
    j.company_id,
  ]);
  const n = (
    await c.query(
      "UPDATE accounting_policies SET next_number=next_number+1 WHERE company_id=$1 RETURNING next_number-1 AS n",
      [j.company_id],
    )
  ).rows[0].n;
  await c.query(
    "UPDATE journal_entries SET journal_number=$2,status='Posted',posted_by=$3,posted_at=now(),version=version+1 WHERE id=$1",
    [j.id, `JE-${String(n).padStart(8, "0")}`, actor.id],
  );
}

/** Called inside the Bank Feed's authorized, company-locked transaction. */
export async function createBankJournal(
  c: PoolClient,
  auth: Awaited<ReturnType<typeof authorizeCompany>>,
  attempt: string,
  raw: JournalInput,
  options: {
    bases?: { debit: string; credit: string }[];
    reversal?: { journalId?: string; legacyId?: string; reason: string };
  } = {},
) {
  const companyId = auth.company.id;
  const { tenant, grant, policy } = await journalPostingAccess(c, companyId, auth.user.id);
  const value = journalRequest.shape.value.unwrap().parse(raw);
  const post = !!options.reversal || (!policy.approval_required && grant.post);
  if (options.reversal && (!grant.post || !grant.reverse))
    throw new Error("Posting and reversal permissions are required.");
  if (auth.company.isPeriodClosed) throw new Error("Company accounting period is closed.");
  const period = await validate(c, companyId, value, grant.soft, true);
  let original: Journal | undefined;
  let bases = options.bases;
  if (options.reversal?.journalId) {
    original = (
      await c.query<Journal>(
        "SELECT * FROM journal_entries WHERE company_id=$1 AND id=$2 AND status='Posted' FOR UPDATE",
        [companyId, options.reversal.journalId],
      )
    ).rows[0];
    if (
      !original ||
      (await c.query("SELECT 1 FROM journal_entries WHERE reversal_of_entry_id=$1", [original.id]))
        .rowCount
    )
      throw new Error("Journal unavailable or already reversed.");
    const lines = (
      await c.query(
        "SELECT base_debit,base_credit FROM journal_entry_lines WHERE journal_entry_id=$1 ORDER BY line_number",
        [original.id],
      )
    ).rows;
    bases = lines.map((line) => ({ debit: line.base_credit, credit: line.base_debit }));
  }
  const eventId = options.reversal ? `${attempt}:reversal` : attempt;
  const j = await create(
    c,
    tenant,
    companyId,
    auth.user.id,
    value,
    period,
    {
      module: bankJournalModule,
      type: options.reversal ? "BankFeedReversal" : "BankFeedPosting",
      id: options.reversal?.legacyId ?? attempt,
      eventId,
      eventVersion: 1,
      idempotencyKey: eventId,
      contractVersion: 1,
    },
    undefined,
    original?.id,
  );
  await replaceLines(c, j, value, bases);
  await balanced(c, j.id);
  if (post) {
    await markPosted(c, j, auth.user);
    if (original) await audit(c, original, auth.user, "reversal_created", options.reversal?.reason);
  } else {
    await c.query(
      "UPDATE journal_entries SET status='Pending Approval',version=version+1 WHERE id=$1",
      [j.id],
    );
  }
  await audit(c, j, auth.user, post ? "post" : "submit", options.reversal?.reason);
  return { id: j.id, posted: post };
}

export async function executeJournal(raw: JournalRequest): Promise<Record<string, unknown>> {
  const input = journalRequest.parse(raw),
    c = await db().connect();
  let authorized = false;
  try {
    await c.query("BEGIN");
    await c.query("SELECT pg_advisory_xact_lock(803003)");
    const reading = ["list", "detail", "balances"].includes(input.operation);
    const auth = await authorizeCompany(
      input.companyId,
      reading ? undefined : "write_accounting",
      c,
    );
    authorized = true;
    await setActor(c, auth.user.id);
    // Same lock as parameters/legacy writers: posting cannot race period closure or account changes.
    await c.query("SELECT id FROM companies WHERE id=$1 FOR UPDATE", [input.companyId]);
    const { tenant, grant, policy } = await journalPostingAccess(c, input.companyId, auth.user.id);
    let result: Record<string, unknown>;
    if (input.operation === "list") {
      const f = input.filters ?? { page: 0 },
        values: unknown[] = [tenant, input.companyId],
        where = ["j.tenant_id=$1", "j.company_id=$2"];
      const add = (sql: string, value: unknown) => {
        values.push(value);
        where.push(sql.replaceAll("?", "$" + values.length));
      };
      if (f.from) add("j.accounting_date>=?", f.from);
      if (f.to) add("j.accounting_date<=?", f.to);
      for (const [key, col] of [
        ["status", "status"],
        ["period", "fiscal_period_id"],
        ["type", "journal_type"],
        ["source", "source_module"],
        ["creator", "created_by"],
      ] as const)
        if (f[key]) add(`j.${col}=?`, f[key]);
      if (f.search)
        add("(j.description ILIKE ? OR coalesce(j.journal_number,'') ILIKE ?)", `%${f.search}%`);
      if (f.account)
        add(
          "EXISTS(SELECT 1 FROM journal_entry_lines l WHERE l.journal_entry_id=j.id AND l.account_code=?)",
          f.account,
        );
      if (f.costCenter)
        add(
          "EXISTS(SELECT 1 FROM journal_entry_lines l WHERE l.journal_entry_id=j.id AND l.cost_center_id=?)",
          f.costCenter,
        );
      const count = (
        await c.query(
          `SELECT count(*)::int AS count FROM journal_entries j WHERE ${where.join(" AND ")}`,
          values,
        )
      ).rows[0].count;
      values.push(f.page * 50);
      const entries = (
        await c.query(
          `SELECT j.*,j.accounting_date::text,u.name AS creator_name,(SELECT sum(debit)::text FROM journal_entry_lines WHERE journal_entry_id=j.id) AS total FROM journal_entries j JOIN app_users u ON u.id=j.created_by WHERE ${where.join(" AND ")} ORDER BY j.accounting_date DESC,j.created_at DESC,j.id LIMIT 50 OFFSET $${values.length}`,
          values,
        )
      ).rows;
      result = {
        entries,
        count,
        permissions: {
          create: auth.permissions.write_accounting,
          approve: auth.permissions.write_accounting && !!grant.approve,
          post: auth.permissions.write_accounting && !!grant.post,
          reverse: auth.permissions.write_accounting && !!grant.reverse,
          soft: auth.permissions.write_accounting && !!grant.soft,
        },
        policy,
      };
    } else if (input.operation === "balances") {
      if (!input.filters?.from || !input.filters?.to || input.filters.from > input.filters.to)
        throw new Error("Select a valid date range.");
      const rows = (
        await c.query(
          `WITH movements AS (
    SELECT l.account_code,j.accounting_date,l.base_debit AS debit,l.base_credit AS credit FROM journal_entries j JOIN journal_entry_lines l ON l.journal_entry_id=j.id WHERE j.tenant_id=$1 AND j.company_id=$2 AND j.status='Posted'
    UNION ALL SELECT l.account_code,j.date,l.debit,l.credit FROM ledger_journals j JOIN ledger_journals_lines l ON l.company_id=j.company_id AND l.parent_id=j.id WHERE j.company_id=$2 AND j.status IN ('Posted','Reversed')
   ), totals AS (SELECT account_code,coalesce(sum(debit-credit) FILTER(WHERE accounting_date<$3::date),0) AS opening,coalesce(sum(debit) FILTER(WHERE accounting_date BETWEEN $3::date AND $4::date),0) AS debit,coalesce(sum(credit) FILTER(WHERE accounting_date BETWEEN $3::date AND $4::date),0) AS credit FROM movements WHERE accounting_date<=$4::date GROUP BY account_code)
   SELECT a.code,a.name,a.balance_type,greatest(coalesce(t.opening,0),0)::text AS opening_debit,greatest(-coalesce(t.opening,0),0)::text AS opening_credit,coalesce(t.debit,0)::text AS debit,coalesce(t.credit,0)::text AS credit,greatest(coalesce(t.opening+t.debit-t.credit,0),0)::text AS closing_debit,greatest(-coalesce(t.opening+t.debit-t.credit,0),0)::text AS closing_credit FROM ledger_accounts a LEFT JOIN totals t ON t.account_code=a.code WHERE a.company_id=$2 ORDER BY a.code`,
          [tenant, input.companyId, input.filters.from, input.filters.to],
        )
      ).rows;
      result = { currency: "USD", rows };
    } else {
      let j: Journal | undefined;
      if (input.id) {
        j = (
          await c.query<Journal>(
            "SELECT *,accounting_date::text FROM journal_entries WHERE tenant_id=$1 AND company_id=$2 AND id=$3 FOR UPDATE",
            [tenant, input.companyId, input.id],
          )
        ).rows[0];
        if (!j) throw new Error("Journal unavailable or access denied.");
      }
      if (input.operation === "detail") {
        if (!j) throw new Error("Journal ID required.");
        result = {
          entry: j,
          lines: (
            await c.query(
              "SELECT * FROM journal_entry_lines WHERE journal_entry_id=$1 ORDER BY line_number",
              [j.id],
            )
          ).rows,
          events: (
            await c.query(
              "SELECT e.*,u.name AS actor_name FROM journal_events e JOIN app_users u ON u.id=e.actor_id WHERE journal_entry_id=$1 ORDER BY e.id",
              [j.id],
            )
          ).rows,
        };
      } else {
        const bankPosting = j?.source_module === bankJournalModule;
        if (bankPosting && !["approve", "reject", "post"].includes(input.operation))
          throw new Error("Manage this journal from the Bank Feed.");
        let hash: string | undefined;
        if (input.operation === "event") {
          if (!input.source || !input.value || input.id)
            throw new Error("Event source and journal payload required.");
          if (input.source.module === bankJournalModule)
            throw new Error("Use the Bank Feed operations.");
          hash = createHash("sha256")
            .update(JSON.stringify({ value: input.value, source: input.source }))
            .digest("hex");
          const prior = (
            await c.query<Journal>(
              "SELECT * FROM journal_entries WHERE company_id=$1 AND source_module=$2 AND (idempotency_key=$3 OR (source_event_id=$4 AND source_event_version=$5))",
              [
                input.companyId,
                input.source.module,
                input.source.idempotencyKey,
                input.source.eventId,
                input.source.eventVersion,
              ],
            )
          ).rows[0];
          if (prior) {
            if (prior.payload_hash !== hash)
              throw new Error("Idempotency conflict: event payload differs.");
            await c.query("COMMIT");
            return { entry: prior, replayed: true };
          }
        }
        if (j && input.version !== j.version)
          throw new Error("Journal version conflict. Refresh and try again.");
        if (input.operation === "save" || input.operation === "event") {
          if (!input.value) throw new Error("Journal payload required.");
          if (j && j.status !== "Draft") throw new Error("Only drafts can be edited.");
          const v = input.value;
          if (input.operation !== "event" && input.source)
            throw new Error("Source metadata requires the accounting events API.");
          if (v.journalType === "Automatic" && input.operation !== "event")
            throw new Error("Automatic journals require an accounting event.");
          const period = await validate(
            c,
            input.companyId,
            v,
            grant.soft,
            false,
            input.operation === "save",
          );
          if (!j)
            j = await create(
              c,
              tenant,
              input.companyId,
              auth.user.id,
              v,
              period,
              input.source,
              hash,
            );
          else
            await c.query(
              "UPDATE journal_entries SET journal_type=$2,accounting_date=$3,fiscal_period_id=$4,description=$5,reference=$6,transaction_currency=$7,exchange_rate=$8,exchange_rate_source=$9,version=version+1 WHERE id=$1",
              [
                j.id,
                v.journalType,
                v.accountingDate,
                period,
                v.description,
                v.reference,
                v.currency,
                v.exchangeRate,
                v.exchangeRateSource,
              ],
            );
          await replaceLines(c, j, v);
          await audit(c, j, auth.user, "save");
          if (input.operation === "event") {
            await balanced(c, j.id);
            if (!policy.approval_required && grant.post) {
              const currentPeriod = await validate(c, input.companyId, v, grant.soft, true);
              if (currentPeriod !== j.fiscal_period_id)
                throw new Error(
                  "Fiscal period assignment changed. Revise the journal before posting.",
                );
              if (auth.company.isPeriodClosed)
                throw new Error("Company accounting period is closed.");
              await c.query(
                "INSERT INTO accounting_policies(company_id) VALUES($1) ON CONFLICT DO NOTHING",
                [input.companyId],
              );
              const number = (
                await c.query(
                  "UPDATE accounting_policies SET next_number=next_number+1 WHERE company_id=$1 RETURNING next_number-1 AS n",
                  [input.companyId],
                )
              ).rows[0].n;
              await c.query(
                "UPDATE journal_entries SET status='Posted',journal_number=$2,posted_by=$3,posted_at=now(),version=version+1 WHERE id=$1",
                [j.id, "JE-" + String(number).padStart(8, "0"), auth.user.id],
              );
              await audit(c, j, auth.user, "post");
            } else {
              await c.query(
                "UPDATE journal_entries SET status='Pending Approval',version=version+1 WHERE id=$1",
                [j.id],
              );
              await audit(c, j, auth.user, "submit");
            }
          }
        } else {
          if (!j) throw new Error("Journal ID required.");
          const ls = (
            await c.query<Line>(
              "SELECT * FROM journal_entry_lines WHERE journal_entry_id=$1 ORDER BY line_number",
              [j.id],
            )
          ).rows;
          const v = toInput(j, ls);
          if (input.operation === "submit") {
            if (j.status !== "Draft") throw new Error("Only drafts can be submitted.");
            await validate(c, input.companyId, v, grant.soft);
            await balanced(c, j.id);
            await c.query(
              "UPDATE journal_entries SET status='Pending Approval',version=version+1 WHERE id=$1",
              [j.id],
            );
          } else if (input.operation === "approve" || input.operation === "reject") {
            if (!grant.approve || j.status !== "Pending Approval")
              throw new Error("Approval permission and pending status required.");
            if (policy.segregate_approval && j.created_by === auth.user.id)
              throw new Error("The creator cannot approve or reject their own journal.");
            if (input.operation === "reject" && !input.reason)
              throw new Error("Rejection reason is required.");
            await c.query(
              "UPDATE journal_entries SET status=$2,approved_by=$3,approved_at=now(),version=version+1 WHERE id=$1",
              [j.id, input.operation === "approve" ? "Approved" : "Rejected", auth.user.id],
            );
            if (bankPosting && input.operation === "reject")
              await (
                await import("./bank-feed.server")
              ).releaseBankPosting(c, input.companyId, j.id);
          } else if (input.operation === "revise") {
            if (j.status !== "Rejected")
              throw new Error("Only rejected journals can return to draft.");
            await c.query(
              "UPDATE journal_entries SET status='Draft',approved_by=null,approved_at=null,version=version+1 WHERE id=$1",
              [j.id],
            );
          } else if (input.operation === "post" || input.operation === "reverse") {
            if (input.operation === "reverse") {
              if (
                (await c.query("SELECT to_regclass('bank_feed_links') AS name")).rows[0].name &&
                (
                  await c.query(
                    "SELECT 1 FROM bank_feed_links WHERE company_id=$1 AND active AND starts_with(movement_key,$2)",
                    [input.companyId, `journal:${j.id}:`],
                  )
                ).rowCount
              )
                throw new Error("Undo the Bank Feed match before reversing this journal.");
              if (
                !grant.reverse ||
                !grant.post ||
                j.status !== "Posted" ||
                !input.reason ||
                !input.reversalDate
              )
                throw new Error(
                  "Reversal requires posting/reversal permissions, a posted journal, reason and date.",
                );
              if (
                (
                  await c.query("SELECT 1 FROM journal_entries WHERE reversal_of_entry_id=$1", [
                    j.id,
                  ])
                ).rowCount
              )
                throw new Error("Journal already reversed.");
              const rv = {
                ...v,
                accountingDate: input.reversalDate,
                description: `Reversal: ${input.reason}`,
                lines: v.lines.map((l) => ({ ...l, debit: l.credit, credit: l.debit })),
              };
              const period = await validate(c, input.companyId, rv, grant.soft, true);
              const original = j;
              j = await create(
                c,
                tenant,
                input.companyId,
                auth.user.id,
                rv,
                period,
                undefined,
                undefined,
                original.id,
              );
              await replaceLines(
                c,
                j,
                rv,
                ls.map((line) => ({
                  debit: String(line.base_credit),
                  credit: String(line.base_debit),
                })),
              );
              await audit(c, original, auth.user, "reversal_created", input.reason);
            } else {
              if (
                !grant.post ||
                !(j.status === "Approved" || (!policy.approval_required && j.status === "Draft"))
              )
                throw new Error("Posting permission and required approval are missing.");
              const currentPeriod = await validate(c, input.companyId, v, grant.soft, true);
              if (currentPeriod !== j.fiscal_period_id)
                throw new Error(
                  "Fiscal period assignment changed. Revise the journal before posting.",
                );
            }
            if (auth.company.isPeriodClosed)
              throw new Error("Company accounting period is closed.");
            if (bankPosting) {
              const feed = await import("./bank-feed.server");
              const conflict = await feed.completeBankPosting(c, auth, j.id);
              if (conflict) {
                await c.query(
                  "UPDATE journal_entries SET status='Rejected',version=version+1 WHERE id=$1",
                  [j.id],
                );
                await feed.releaseBankPosting(c, input.companyId, j.id);
                await audit(c, j, auth.user, "reject", conflict);
                await c.query("UPDATE companies SET revision=revision+1 WHERE id=$1", [
                  input.companyId,
                ]);
                await c.query("COMMIT");
                return { entry: { ...j, status: "Rejected", version: j.version + 1 }, conflict };
              }
            }
            await markPosted(c, j, auth.user);
          } else throw new Error("Unsupported journal action.");
          await audit(c, j, auth.user, input.operation, input.reason);
        }
        await c.query("UPDATE companies SET revision=revision+1 WHERE id=$1", [input.companyId]);
        result = {
          entry: (
            await c.query("SELECT *,accounting_date::text FROM journal_entries WHERE id=$1", [j.id])
          ).rows[0],
        };
      }
    }
    await c.query("COMMIT");
    return result;
  } catch (error) {
    await c.query("ROLLBACK");
    if (!["list", "detail", "balances"].includes(input.operation))
      try {
        const auth = await authorize(undefined, c);
        await c.query(
          "INSERT INTO system_audit_log(actor_id,actor_name,action,entity,target_id,company_id,after_data) VALUES($1,$2,'JOURNAL_FAILURE','JournalEntry',$3,$4,$5)",
          [
            auth.user.id,
            auth.user.name,
            input.id ?? input.source?.eventId ?? "new",
            authorized ? input.companyId : null,
            JSON.stringify({
              operation: input.operation,
              error: error instanceof Error ? error.message : "Failed",
            }),
          ],
        );
      } catch {
        /* Preserve the original error. */
      }
    throw error;
  } finally {
    c.release();
  }
}
