import React, { type ReactNode } from "react";
import { AccountingProvider, useAccounting } from "@/lib/accounting-store";

export function BookProvider({ children }: { children: ReactNode }) {
  return <AccountingProvider>{children}</AccountingProvider>;
}

// Re-export for convenience
export { useAccounting };
