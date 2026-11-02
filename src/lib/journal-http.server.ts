import { executeJournal } from "./journal.server";
import { journalRequest } from "./journal-model";
import { isCrossOriginWrite } from "./request-origin.server";
export async function journalHttp(request: Request, path = "") {
  try {
    const url = new URL(request.url);
    if (request.method !== "GET") {
      if (isCrossOriginWrite(request))
        return Response.json({ error: "Cross-origin writes are not permitted" }, { status: 403 });
      if (!request.headers.get("content-type")?.includes("application/json"))
        return Response.json({ error: "JSON body required" }, { status: 415 });
    }
    const body = request.method === "GET" ? {} : await request.json();
    const companyId = url.searchParams.get("companyId") ?? body.companyId;
    const [id, action] = path.split("/");
    const segments = path.split("/").filter(Boolean);
    const allowedActions = ["submit", "approve", "reject", "revise", "post", "reverse"];
    const permitted =
      request.method === "GET"
        ? segments.length <= 1 || (segments.length === 2 && action === "audit")
        : request.method === "PATCH"
          ? segments.length === 1 && !["events", "balances"].includes(id ?? "")
          : request.method === "POST" &&
            (segments.length === 0 ||
              path === "events" ||
              (segments.length === 2 && allowedActions.includes(action ?? "")));
    if (!permitted) return Response.json({ error: "Unsupported operation" }, { status: 405 });
    const operation =
      path === "events"
        ? "event"
        : path === "balances"
          ? "balances"
          : !id
            ? request.method === "GET"
              ? "list"
              : "save"
            : request.method === "GET"
              ? "detail"
              : request.method === "PATCH"
                ? "save"
                : action;
    if (!operation || (request.method === "POST" && id && !action && path !== "events"))
      return Response.json({ error: "Unsupported operation" }, { status: 405 });
    const filters = Object.fromEntries(url.searchParams.entries());
    delete filters["companyId"];
    const data = journalRequest.parse({
      ...body,
      companyId,
      operation,
      ...(id && !["events", "balances"].includes(id) ? { id } : {}),
      ...(request.method === "GET"
        ? { filters: { ...filters, page: Number(filters["page"] ?? 0) } }
        : {}),
    });
    return Response.json(await executeJournal(data));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Journal request failed";
    const status = /Session expired/.test(message)
      ? 401
      : /access denied|permission|profile does not allow/i.test(message)
        ? 403
        : /conflict|already reversed/i.test(message)
          ? 409
          : 400;
    return Response.json({ error: message }, { status });
  }
}
