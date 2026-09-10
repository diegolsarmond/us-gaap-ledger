import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useAccounting } from "@/lib/accounting-store";
import { Badge, Kpi, Note, PageTitle, Panel, Table, Td, Th } from "@/components/ui-kit";
import { usd, exportToCsv } from "@/lib/format";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/inventory")({
  head: () =>
    pageHead(
      "Inventory Catalog & Valuation · LedgerX",
      "Perpetual inventory tracking with selectable FIFO and Weighted Average cost valuation methods under US GAAP."
    ),
  component: InventoryPage,
});

function InventoryPage() {
  const {
    activeCompany,
    inventory,
    setCostMethod,
    adjustStock,
    addInventoryItem,
    totalInventoryValuation,
    userPersona,
  } = useAccounting();

  // Stock Adjustment Form
  const [selectedItemId, setSelectedItemId] = useState(inventory[0]?.id || "");
  const [qtyDelta, setQtyDelta] = useState("-5");
  const [adjustMemo, setAdjustMemo] = useState("Damaged during yard transit");

  // New Item Form
  const [newSku, setNewSku] = useState("");
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<"Product" | "Service">("Product");
  const [newCost, setNewCost] = useState("45.00");
  const [newPrice, setNewPrice] = useState("95.00");
  const [newQty, setNewQty] = useState("20");

  const totalProductsCount = inventory.filter((i) => i.type === "Product").length;
  const totalServicesCount = inventory.filter((i) => i.type === "Service").length;
  const totalUnitsOnHand = inventory.reduce((s, i) => s + (i.type === "Product" ? i.qtyOnHand : 0), 0);

  const handleAdjustStock = (e: React.FormEvent) => {
    e.preventDefault();
    const item = inventory.find((i) => i.id === selectedItemId);
    if (!item) return;

    adjustStock(selectedItemId, Number(qtyDelta) || 0, item.unitCost, adjustMemo);
    alert(`Adjusted stock for SKU ${item.sku}. Balanced counter-entry posted to General Ledger.`);
  };

  const handleCreateItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSku || !newName) return;

    addInventoryItem({
      sku: newSku.toUpperCase(),
      name: newName,
      type: newType,
      qtyOnHand: newType === "Product" ? Number(newQty) || 0 : 0,
      unitCost: Number(newCost) || 0,
      unitPrice: Number(newPrice) || 0,
      valuationMethod: activeCompany.costMethod,
    });

    setNewSku("");
    setNewName("");
  };

  const handleExportCsv = () => {
    const headers = ["SKU", "Item Name", "Type", "Valuation Method", "Quantity On Hand", "Unit Cost ($)", "Unit Price ($)", "Total Asset Value ($)"];
    const rows = inventory.map((i) => [
      i.sku,
      i.name,
      i.type,
      i.type === "Product" ? activeCompany.costMethod : "N/A",
      i.qtyOnHand,
      i.unitCost,
      i.unitPrice,
      i.type === "Product" ? i.qtyOnHand * i.unitCost : 0,
    ]);
    exportToCsv(`${activeCompany.id}_inventory_catalog`, headers, rows);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/60 pb-3">
        <PageTitle
          title="Inventory Catalog & Cost Valuation"
          description={`Perpetual inventory tracking and COGS valuation for ${activeCompany.name} · US GAAP Standard`}
        />
        <button
          type="button"
          onClick={handleExportCsv}
          className="rounded-md bg-white/90 px-3 py-1.5 text-[12px] font-medium text-ink ring-1 ring-line hover:bg-white shadow-2xs"
        >
          Export Catalog (CSV)
        </button>
      </div>

      {/* KPI Row & Cost Method Selector */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Merchandise Inventory Asset"
          value={usd(totalInventoryValuation)}
          hint="Account 1300 · Balance Sheet asset"
          tone="up"
        />
        <Kpi
          label="Physical Units on Hand"
          value={totalUnitsOnHand.toLocaleString("en-US")}
          hint={`${totalProductsCount} active product SKUs`}
          tone="neutral"
        />
        <Kpi
          label="Service Items in Catalog"
          value={totalServicesCount.toString()}
          hint="No physical stock · Revenue billable"
          tone="neutral"
        />
        <div className="rounded-xl bg-white/70 p-4 ring-1 ring-line shadow-2xs space-y-2">
          <span className="text-[11.5px] font-medium text-ink3 uppercase tracking-wider">
            Accounting Cost Method
          </span>
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              disabled={userPersona.allowedReportsOnly}
              onClick={() => setCostMethod("FIFO")}
              className={`flex-1 rounded py-1 text-[12px] font-semibold transition-colors ${
                activeCompany.costMethod === "FIFO"
                  ? "bg-brand text-primary-foreground shadow-2xs"
                  : "bg-panel text-ink2 hover:text-ink ring-1 ring-line"
              }`}
            >
              FIFO
            </button>
            <button
              type="button"
              disabled={userPersona.allowedReportsOnly}
              onClick={() => setCostMethod("WeightedAverage")}
              className={`flex-1 rounded py-1 text-[12px] font-semibold transition-colors ${
                activeCompany.costMethod === "WeightedAverage"
                  ? "bg-brand text-primary-foreground shadow-2xs"
                  : "bg-panel text-ink2 hover:text-ink ring-1 ring-line"
              }`}
            >
              Weighted Avg
            </button>
          </div>
          <p className="text-[10px] text-ink3">
            Company policy determines COGS lot deduction order on sales invoices.
          </p>
        </div>
      </section>

      {/* Main Grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Catalog Table */}
        <div className="lg:col-span-8 space-y-3">
          <Panel
            title="Items & SKUs Catalog"
            subtitle={`${inventory.length} items cataloged under ${activeCompany.costMethod} valuation`}
          >
            <div className="overflow-x-auto">
              <Table>
                <thead>
                  <tr className="border-b border-line/60">
                    <Th>SKU</Th>
                    <Th>Item Name</Th>
                    <Th>Type</Th>
                    <Th align="right">Qty on Hand</Th>
                    <Th align="right">Unit Cost</Th>
                    <Th align="right">Selling Price</Th>
                    <Th align="right">Total Valuation</Th>
                  </tr>
                </thead>
                <tbody>
                  {inventory.map((item) => {
                    const totalVal = item.type === "Product" ? item.qtyOnHand * item.unitCost : 0;
                    return (
                      <tr key={item.id} className="border-b border-line/40 last:border-0 hover:bg-black/[0.01]">
                        <Td className="font-mono text-[11.5px] font-semibold">{item.sku}</Td>
                        <Td className="text-ink2 font-medium">
                          {item.name}
                          {item.costLots.length > 0 && (
                            <span className="block text-[10px] text-ink3">
                              {item.costLots.length} purchase lot(s) tracked
                            </span>
                          )}
                        </Td>
                        <Td>
                          <Badge tone={item.type === "Product" ? "neutral" : "brand"}>
                            {item.type}
                          </Badge>
                        </Td>
                        <Td align="right" className="font-mono text-[12px]">
                          {item.type === "Product" ? item.qtyOnHand.toLocaleString() : "—"}
                        </Td>
                        <Td align="right" className="font-mono text-[12px] text-ink2">
                          {item.type === "Product" ? usd(item.unitCost) : "—"}
                        </Td>
                        <Td align="right" className="font-mono text-[12px] text-ink font-medium">
                          {usd(item.unitPrice)}
                        </Td>
                        <Td align="right" className="font-mono font-medium text-[12.5px]">
                          {item.type === "Product" ? usd(totalVal) : "—"}
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </div>
            <div className="p-4 border-t border-line/50">
              <Note tone="brand">
                US GAAP: Inventory is recognized as an asset (1300) until consumed or invoiced to customers. Upon invoice posting, Cost of Goods Sold (5000) is recognized based on active cost method.
              </Note>
            </div>
          </Panel>
        </div>

        {/* Right Tools: Adjustments & Add SKU */}
        <div className="lg:col-span-4 space-y-4">
          {!userPersona.allowedReportsOnly && (
            <>
              {/* Stock Count Variance Adjustment Form */}
              <Panel
                title="Physical Inventory Count Adjustment"
                subtitle="Posts automatic COGS variance journal"
              >
                <form onSubmit={handleAdjustStock} className="p-4 space-y-3">
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3">
                      Select Item
                    </label>
                    <select
                      value={selectedItemId}
                      onChange={(e) => setSelectedItemId(e.target.value)}
                      className="mt-1 w-full rounded-md bg-white/90 px-2.5 py-1.5 text-[12px] ring-1 ring-line outline-none"
                    >
                      {inventory
                        .filter((i) => i.type === "Product")
                        .map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.sku} — {i.name} (Cur: {i.qtyOnHand})
                          </option>
                        ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3">
                        Quantity Delta (+/-)
                      </label>
                      <input
                        type="number"
                        value={qtyDelta}
                        onChange={(e) => setQtyDelta(e.target.value)}
                        required
                        className="mt-1 w-full rounded-md bg-white/90 px-2.5 py-1.5 text-right font-mono text-[12px] ring-1 ring-line outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3">
                        Count Reason
                      </label>
                      <input
                        type="text"
                        value={adjustMemo}
                        onChange={(e) => setAdjustMemo(e.target.value)}
                        placeholder="Cycle count audit"
                        required
                        className="mt-1 w-full rounded-md bg-white/90 px-2.5 py-1.5 text-[12px] ring-1 ring-line outline-none"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full rounded-md bg-ink py-2 text-[12px] font-semibold text-white hover:bg-ink/90 transition-colors shadow-2xs"
                  >
                    Post Stock Adjustment
                  </button>
                </form>
              </Panel>

              {/* Add New Catalog Item */}
              <Panel title="Add Catalog Item" subtitle="Register new Product or Service">
                <form onSubmit={handleCreateItem} className="p-4 space-y-2.5">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10.5px] font-semibold uppercase tracking-wider text-ink3">
                        SKU / Code
                      </label>
                      <input
                        type="text"
                        value={newSku}
                        onChange={(e) => setNewSku(e.target.value)}
                        placeholder="e.g. HR-5000"
                        required
                        className="mt-0.5 w-full rounded bg-white px-2 py-1.5 text-[11.5px] ring-1 ring-line outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10.5px] font-semibold uppercase tracking-wider text-ink3">
                        Type
                      </label>
                      <select
                        value={newType}
                        onChange={(e) => setNewType(e.target.value as any)}
                        className="mt-0.5 w-full rounded bg-white px-2 py-1.5 text-[11.5px] ring-1 ring-line outline-none"
                      >
                        <option value="Product">Product</option>
                        <option value="Service">Service</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10.5px] font-semibold uppercase tracking-wider text-ink3">
                      Item Description
                    </label>
                    <input
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="e.g. Hydraulic trim tab actuator"
                      required
                      className="mt-0.5 w-full rounded bg-white px-2 py-1.5 text-[11.5px] ring-1 ring-line outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[10px] text-ink3">Unit Cost ($)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={newCost}
                        onChange={(e) => setNewCost(e.target.value)}
                        className="w-full rounded bg-white px-2 py-1 text-right font-mono text-[11px] ring-1 ring-line"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-ink3">Price ($)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={newPrice}
                        onChange={(e) => setNewPrice(e.target.value)}
                        className="w-full rounded bg-white px-2 py-1 text-right font-mono text-[11px] ring-1 ring-line"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-ink3">Initial Qty</label>
                      <input
                        type="number"
                        disabled={newType === "Service"}
                        value={newQty}
                        onChange={(e) => setNewQty(e.target.value)}
                        className="w-full rounded bg-white px-2 py-1 text-right font-mono text-[11px] ring-1 ring-line disabled:opacity-40"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full rounded-md bg-brand py-1.5 text-[12px] font-semibold text-primary-foreground hover:opacity-95 shadow-2xs mt-1"
                  >
                    Save to Catalog
                  </button>
                </form>
              </Panel>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
