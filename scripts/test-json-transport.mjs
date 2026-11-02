import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith(".") && context.parentURL?.includes("/src/")) {
      const url = new URL(specifier + ".ts", context.parentURL);
      if (existsSync(url)) return next(url.href, context);
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith("/src/lib/auth.server.ts"))
      return {
        format: "module",
        shortCircuit: true,
        source:
          'export async function readSession(){return {id:"test-user",name:"Example"}}; export async function signOut(){}',
      };
    return next(url, context);
  },
});
const { jsonHttp } = await import("../src/lib/json-http.server.ts");
const request = (path, options) =>
  jsonHttp(new Request("http://localhost/api/json/" + path, options), path.split("?")[0]);
let response = await request("auth/getSession");
assert.equal(response.status, 200);
assert.deepEqual(await response.json(), { id: "test-user", name: "Example" });
assert.equal(response.headers.get("cache-control"), "no-store");
response = await request("accounting/runAccountingCommand", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ companyId: "invalid", revision: 0, command: "addAccount", args: [] }),
});
assert.equal(response.status, 400);
assert.match((await response.json()).error, /companyId/);
response = await request("auth/logout", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: "{}",
});
assert.equal(response.status, 200);
assert.equal(await response.json(), null);
for (const headers of [{ origin: "https://other.example" }, { "sec-fetch-site": "cross-site" }]) {
  response = await request("auth/logout", {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(response.status, 403);
}
response = await request("auth/logout", { method: "POST", body: "{}" });
assert.equal(response.status, 415);
response = await request("auth/logout", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: "{",
});
assert.equal(response.status, 400);
response = await request("auth/logout");
assert.equal(response.status, 405);
for (const path of ["unknown/getSession", "auth/constructor", "auth/getSession/extra"]) {
  response = await request(path);
  assert.equal(response.status, 404);
}
console.log(
  "JSON HTTP: structured results, validation, errors, method checks and origin protection passed.",
);
