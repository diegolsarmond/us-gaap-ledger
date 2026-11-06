import type { VendorInput } from "@/lib/vendor-model";
export function VendorBankAccounts({
  value,
  onChange,
}: {
  value: VendorInput["bankAccounts"];
  onChange: (value: VendorInput["bankAccounts"]) => void;
}) {
  const control = "w-full rounded border border-line p-2 text-sm";
  return (
    <div className="space-y-3">
      <h3 className="font-medium">Bank accounts by currency</h3>
      <p className="text-xs text-ink3">
        One vendor can use multiple accounts. Choose the destination account when paying a bill.
      </p>
      {value.map((bank, index) => (
        <div key={bank.id} className="grid gap-3 rounded border border-line p-3 sm:grid-cols-3">
          {(
            [
              ["label", "Account label"],
              ["bankName", "Bank name"],
              ["currency", "Account currency"],
              ["accountNumber", "Bank account number"],
              ["routingNumber", "Routing number (ACH)"],
              ["swiftBic", "SWIFT / BIC"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="text-sm">
              {label}
              <input
                className={control}
                required={
                  ["label", "currency", "accountNumber"].includes(key) ||
                  (key === "routingNumber" && bank.paymentType === "ACH")
                }
                value={bank[key]}
                maxLength={key === "accountNumber" ? 17 : key === "routingNumber" ? 9 : 300}
                onChange={(e) =>
                  onChange(
                    value.map((b, i) =>
                      i === index
                        ? {
                            ...b,
                            [key]:
                              key === "currency" ? e.target.value.toUpperCase() : e.target.value,
                          }
                        : b,
                    ),
                  )
                }
              />
            </label>
          ))}
          <label className="text-sm">
            Payment type
            <select
              className={control}
              value={bank.paymentType}
              onChange={(e) =>
                onChange(
                  value.map((b, i) =>
                    i === index ? { ...b, paymentType: e.target.value as "ACH" | "Wire" } : b,
                  ),
                )
              }
            >
              <option>ACH</option>
              <option>Wire</option>
            </select>
          </label>
          <button
            type="button"
            className="text-down underline"
            onClick={() => onChange(value.filter((_, i) => i !== index))}
          >
            Remove account
          </button>
        </div>
      ))}
      <button
        type="button"
        className="text-brand underline"
        disabled={value.length >= 20}
        onClick={() =>
          onChange([
            ...value,
            {
              id: crypto.randomUUID(),
              label: "",
              currency: "USD",
              bankName: "",
              accountNumber: "",
              routingNumber: "",
              swiftBic: "",
              paymentType: "ACH",
            },
          ])
        }
      >
        Add bank account
      </button>
    </div>
  );
}
