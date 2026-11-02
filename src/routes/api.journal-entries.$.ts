import { createFileRoute } from "@tanstack/react-router";
import { journalHttp } from "@/lib/journal-http.server";
export const Route = createFileRoute("/api/journal-entries/$")({
  server: {
    handlers: {
      GET: ({ request, params }) => journalHttp(request, params._splat),
      POST: ({ request, params }) => journalHttp(request, params._splat),
      PATCH: ({ request, params }) => journalHttp(request, params._splat),
    },
  },
});
