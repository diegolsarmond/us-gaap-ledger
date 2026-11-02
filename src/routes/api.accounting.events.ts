import { createFileRoute } from "@tanstack/react-router";
import { journalHttp } from "@/lib/journal-http.server";
export const Route = createFileRoute("/api/accounting/events")({
  server: { handlers: { POST: ({ request }) => journalHttp(request, "events") } },
});
