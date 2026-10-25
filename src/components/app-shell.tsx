import type { ReactNode } from "react";
import { CashShell } from "./cash-shell";
import { useCompanies } from "./company-context";

export function AppShell({children}:{children:ReactNode}) {
 const {user}=useCompanies();
 return <CashShell user={user}>{children}</CashShell>;
}
