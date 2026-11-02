import { createFileRoute } from "@tanstack/react-router";
import { trialHttp } from "@/lib/trial-balance.server";
export const Route = createFileRoute("/api/trial-balance")({
  server: { handlers: { GET: ({ request }) => trialHttp(request) } },
});
