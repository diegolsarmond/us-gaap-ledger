import { createFileRoute } from "@tanstack/react-router";
import { journalHttp } from "@/lib/journal-http.server";
export const Route = createFileRoute("/api/journal-entries")({
  server: {
    handlers: {
      GET: ({ request }) => journalHttp(request),
      POST: ({ request }) => journalHttp(request),
    },
  },
});
