import { createFileRoute } from "@tanstack/react-router";
import { journalHttp } from "@/lib/journal-http.server";
export const Route = createFileRoute("/api/accounting/balances")({
  server: { handlers: { GET: ({ request }) => journalHttp(request, "balances") } },
});
