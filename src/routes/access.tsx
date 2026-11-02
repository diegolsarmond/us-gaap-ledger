import { createFileRoute } from "@tanstack/react-router";
import { AdministrationList } from "@/components/administration-list";
import { JournalSettings } from "@/components/journal-settings";
import { useCompanies } from "@/components/company-context";
export const Route = createFileRoute("/access")({ component: AccessPage });
function AccessPage() {
  const { activeCompany, permissions } = useCompanies();
  return (
    <div className="space-y-6">
      <AdministrationList kind="profiles" />
      {permissions.manage_profiles && activeCompany && (
        <div>
          <p className="mb-2 text-sm text-ink3">Accounting policies for {activeCompany.name}</p>
          <JournalSettings key={activeCompany.id} companyId={activeCompany.id} />
        </div>
      )}
    </div>
  );
}
