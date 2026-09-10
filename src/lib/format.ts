export const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

/** Formato contábil: negativos entre parênteses. */
export const acct = (n: number) => (n < 0 ? `(${usd(Math.abs(n)).replace("$", "")})` : usd(n));

export const pct = (n: number) => `${n.toFixed(1)}%`;

export const dash = (n: number) => (n === 0 ? "—" : usd(n));
