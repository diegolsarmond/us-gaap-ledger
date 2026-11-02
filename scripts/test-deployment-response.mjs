import assert from "node:assert/strict";
import {
  preventHtmlCaching,
  retiredServerFunctionResponse,
} from "../src/lib/deployment-response.ts";

for (const method of ["GET", "POST"]) {
  const response = retiredServerFunctionResponse(
    new Request("http://localhost/_serverFn/obsolete-id", { method }),
  );
  assert.equal(response.status, 410);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.match((await response.json()).error, /Reload the page/);
}
for (const path of ["/", "/api/json/auth/getSession", "/_serverFn-other"]) {
  assert.equal(retiredServerFunctionResponse(new Request(`http://localhost${path}`)), undefined);
}
const html = preventHtmlCaching(new Response("<html>current</html>", {
  status: 503,
  headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public", "Set-Cookie": "session=test" },
}));
assert.equal(html.status, 503);
assert.equal(html.headers.get("cache-control"), "no-store");
assert.equal(html.headers.get("set-cookie"), "session=test");
assert.equal(await html.text(), "<html>current</html>");
const asset = new Response("asset", {
  headers: { "Content-Type": "text/javascript", "Cache-Control": "public, immutable" },
});
assert.equal(preventHtmlCaching(asset), asset);
console.log("Deployment responses: retired RPC, HTML cache policy, and asset preservation passed.");
