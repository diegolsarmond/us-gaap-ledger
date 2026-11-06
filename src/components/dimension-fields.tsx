import {
  appliesTo,
  effectiveDimensions,
  type Dimension,
  type DimensionDocument,
  type DimensionValue,
} from "@/lib/dimensions";

export function DimensionFields({
  dimensions,
  document,
  value,
  onChange,
  lineId,
}: {
  dimensions: Dimension[];
  document: DimensionDocument;
  value: DimensionValue[];
  onChange: (value: DimensionValue[]) => void;
  lineId?: string;
}) {
  const available = dimensions.filter((d) => d.status === "Active" && appliesTo(d, document));
  if (!available.length) return null;
  return (
    <fieldset className="rounded-lg border border-line p-3 space-y-3">
      <legend className="px-1 text-xs font-semibold text-ink2">
        {lineId
          ? "Item dimensions (override document)"
          : "Management dimensions — document defaults"}
      </legend>
      <div className="grid gap-3 sm:grid-cols-3">
        {available.map((d) => {
          const selected = value.find((v) => v.dimensionId === d.id && v.lineId === lineId);
          const inherited = lineId
            ? effectiveDimensions(value).find((v) => v.dimensionId === d.id)
            : undefined;
          return (
            <label key={d.id} className="text-xs text-ink2">
              {d.name}
              {d.required ? " *" : ""}
              <select
                aria-label={`${d.name}${lineId ? ` — item ${lineId}` : " — document"}`}
                className="mt-1 w-full rounded border border-line bg-white p-2"
                value={selected?.valueId ?? ""}
                onChange={(e) => {
                  const remaining = value.filter(
                    (v) => !(v.dimensionId === d.id && v.lineId === lineId),
                  );
                  onChange(
                    e.target.value
                      ? [
                          ...remaining,
                          {
                            dimensionId: d.id,
                            valueId: e.target.value,
                            ...(lineId ? { lineId } : {}),
                          },
                        ]
                      : remaining,
                  );
                }}
              >
                <option value="">
                  {lineId
                    ? `Use document default${inherited ? `: ${d.options.find((o) => o.id === inherited.valueId)?.name ?? ""}` : ""}`
                    : "Select an option"}
                </option>
                {d.options
                  .filter((o) => o.status === "Active")
                  .map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
              </select>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function DimensionLabels({
  dimensions,
  value = [],
}: {
  dimensions: Dimension[];
  value?: DimensionValue[] | undefined;
}) {
  if (!value.length) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1 text-[10px] text-ink3">
      {value.map((v, i) => {
        const d = dimensions.find((d) => d.id === v.dimensionId);
        return (
          <span key={i} className="rounded bg-brand/5 px-1.5 py-0.5">
            {d?.name ?? v.dimensionId}:{" "}
            {d?.options.find((o) => o.id === v.valueId)?.name ?? v.valueId}
            {v.lineId ? " (item)" : ""}
          </span>
        );
      })}
    </div>
  );
}
