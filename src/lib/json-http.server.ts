import { dispatchJson } from "./json-registry.server";
import { ZodError } from "zod";
import { isCrossOriginWrite } from "./request-origin.server";

export async function jsonHttp(request: Request, path: string) {
  const headers = { "Cache-Control": "no-store" };
  try {
    const url = new URL(request.url);
    if (request.method !== "GET") {
      if (isCrossOriginWrite(request))
        return Response.json(
          { error: "Cross-origin writes are not permitted" },
          { status: 403, headers },
        );
      if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json")
        return Response.json({ error: "JSON body required" }, { status: 415, headers });
    }
    const [module, operation, extra] = path.split("/");
    if (!module || !operation || extra !== undefined)
      return Response.json({ error: "Unknown JSON operation" }, { status: 404, headers });
    const data =
      request.method === "GET"
        ? JSON.parse(url.searchParams.get("data") ?? "null")
        : await request.json();
    const result = await dispatchJson(module, operation, request.method, data);
    return Response.json(result ?? null, { headers });
  } catch (error) {
    const message =
      error instanceof ZodError
        ? error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
        : error instanceof Error
          ? error.message
          : "Request failed";
    const status = /Unknown JSON/.test(message)
      ? 404
      : /Unsupported method/.test(message)
        ? 405
        : /Session expired/.test(message)
          ? 401
          : /access denied|permission|profile does not allow/i.test(message)
            ? 403
            : /conflict/i.test(message)
              ? 409
              : 400;
    return Response.json({ error: message }, { status, headers });
  }
}
