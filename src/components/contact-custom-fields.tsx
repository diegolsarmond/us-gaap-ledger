import type { VendorInput } from "@/lib/vendor-model";
export function ContactCustomFields({
  value,
  onChange,
}: {
  value: VendorInput["customFields"];
  onChange: (value: VendorInput["customFields"]) => void;
}) {
  const control = "w-full rounded border border-line p-2 text-sm";
  return (
    <section className="space-y-3 rounded border border-line bg-white p-4">
      <h2 className="font-semibold">Custom fields</h2>
      {value.map((f, index) => (
        <div key={index} className="grid gap-3 sm:grid-cols-4">
          <label className="text-sm">
            Field name
            <input
              className={control}
              required
              value={f.name}
              maxLength={120}
              onChange={(e) =>
                onChange(value.map((r, i) => (i === index ? { ...r, name: e.target.value } : r)))
              }
            />
          </label>
          <label className="text-sm">
            Type
            <select
              className={control}
              value={f.type}
              onChange={(e) =>
                onChange(
                  value.map((r, i) =>
                    i === index ? { ...r, type: e.target.value as typeof r.type, value: "" } : r,
                  ),
                )
              }
            >
              {["Text", "Number", "Date", "Checkbox"].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Value
            <input
              className={control}
              type={f.type === "Date" ? "date" : f.type === "Number" ? "number" : "text"}
              step="any"
              placeholder={f.type === "Checkbox" ? "true / false" : ""}
              maxLength={2000}
              value={f.value}
              onChange={(e) =>
                onChange(value.map((r, i) => (i === index ? { ...r, value: e.target.value } : r)))
              }
            />
          </label>
          <button
            type="button"
            className="text-down underline"
            onClick={() => onChange(value.filter((_, i) => i !== index))}
          >
            Remove field
          </button>
        </div>
      ))}
      <button
        type="button"
        className="text-brand underline"
        disabled={value.length >= 50}
        onClick={() => onChange([...value, { name: "", type: "Text", value: "" }])}
      >
        Add custom field
      </button>
    </section>
  );
}
