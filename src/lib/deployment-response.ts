// The application uses /api/json now. Old tabs may still call the retired RPC
// transport after a deployment; do not dispatch their obsolete function IDs.
export function retiredServerFunctionResponse(request: Request): Response | undefined {
  const { pathname } = new URL(request.url);
  if (pathname !== "/_serverFn" && !pathname.startsWith("/_serverFn/")) return;

  return Response.json(
    { error: "This application version has expired. Reload the page to continue." },
    { status: 410, headers: { "Cache-Control": "no-store" } },
  );
}

export function preventHtmlCaching(response: Response): Response {
  if (!response.headers.get("content-type")?.includes("text/html")) return response;

  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
