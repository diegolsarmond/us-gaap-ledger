import { dateSchema } from "./cash-flow-model";
export function parseStatementCsv(content: string) {
  if (!content || content.length > 2_000_000) throw new Error("Selecione um CSV de até 2 MB.");
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  const source = content.replace(/^\uFEFF/, "");
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === '"') {
      if (quoted && source[i + 1] === '"') {
        value += '"';
        i++;
      } else if (!quoted && value) throw new Error("Aspas inválidas no CSV.");
      else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && source[i + 1] === "\n") i++;
      row.push(value);
      if (row.some((v) => v.trim())) rows.push(row);
      row = [];
      value = "";
    } else value += c;
  }
  if (quoted) throw new Error("Aspas não fechadas no CSV.");
  row.push(value);
  if (row.some((v) => v.trim())) rows.push(row);
  const header = rows.shift()?.map((v) => v.trim().toLowerCase());
  if (!header || header.join(",") !== "date,description,amount")
    throw new Error(
      "Use o cabeçalho date,description,amount. Datas YYYY-MM-DD; valores negativos para saídas.",
    );
  if (!rows.length || rows.length > 5000)
    throw new Error("O CSV deve conter de 1 a 5.000 transações.");
  return rows.map((r, i) => {
    const amount = Number(r[2]);
    if (
      r.length !== 3 ||
      !dateSchema.safeParse(r[0]).success ||
      !r[1]?.trim() ||
      r[1].length > 500 ||
      !/^-?\d+(\.\d{1,2})?$/.test(r[2] ?? "") ||
      !Number.isFinite(amount) ||
      amount === 0 ||
      Math.abs(amount) > 999999999999
    )
      throw new Error(`Linha ${i + 2} inválida.`);
    return { date: r[0]!, description: r[1]!.trim(), amount };
  });
}
