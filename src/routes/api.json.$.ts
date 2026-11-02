import { createFileRoute } from "@tanstack/react-router";
import { jsonHttp } from "@/lib/json-http.server";

export const Route = createFileRoute("/api/json/$")({
  server: {
    handlers: {
      GET: ({ request, params }) => jsonHttp(request, params._splat ?? ""),
      POST: ({ request, params }) => jsonHttp(request, params._splat ?? ""),
    },
  },
});
