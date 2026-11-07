// Legacy entries already store functional amounts. Reversed originals and their
// counter-entries both belong in the ledger.
export const postedLedgerLines = `
 SELECT l.account_code,j.id::text AS id,j.journal_number AS number,j.accounting_date AS date,
 j.description,l.description AS line_description,j.reference,j.source_module AS source,l.line_number AS sequence,
 l.cost_center_id,l.base_debit AS debit,l.base_credit AS credit,j.transaction_currency AS currency,l.debit AS original_debit,l.credit AS original_credit,
 j.journal_type='Opening' AS opening,j.source_type AS source_type,j.id::text AS journal_id,
 NULL::text AS legacy_currency
 FROM journal_entries j JOIN journal_entry_lines l ON l.journal_entry_id=j.id AND l.tenant_id=j.tenant_id AND l.company_id=j.company_id
 WHERE j.tenant_id=(SELECT id FROM accounting_tenant WHERE singleton) AND j.company_id=$1 AND j.status='Posted'
 UNION ALL
 SELECT l.account_code,'legacy:'||j.id,j.id,j.date,j.memo,l.memo,'',j.source_type,l.position,l.cost_center_id,l.debit,l.credit,'USD',l.debit,l.credit,
 j.source_type='OpeningBalance',j.source_type,j.id,j.currency
 FROM ledger_journals j JOIN ledger_journals_lines l ON l.company_id=j.company_id AND l.parent_id=j.id
 WHERE j.company_id=$1 AND j.status IN ('Posted','Reversed')
`;
