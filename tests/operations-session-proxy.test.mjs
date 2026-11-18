import test from "node:test";
import assert from "node:assert/strict";
import { GET, POST } from "../app/api/operations/route.ts";

test("preserves the private session, cursor and empty synchronization response", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    assert.equal(options.headers.get("x-local-session"), "user/session");
    assert.equal(options.headers.get("x-dontus-operations-cursor"), "instance:5");
    return new Response(null, { status: 204, headers: { "x-dontus-operations-cursor": "instance:5", "x-dontus-realtime-cursor": "instance:9" } });
  };
  try {
    const response = await POST(new Request("http://localhost/api/operations", {
      method: "POST", headers: { cookie: "dontus_session=user%2Fsession", "x-dontus-operations-cursor": "instance:5", "accept-encoding": "gzip" },
      body: JSON.stringify({ action: "refreshOperations" }),
    }));
    assert.equal(response.status, 204); assert.equal(await response.text(), "");
    assert.equal(response.headers.get("x-dontus-operations-cursor"), "instance:5");
    assert.equal(response.headers.get("x-dontus-realtime-cursor"), "instance:9");
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("content-encoding"), null);
  } finally { globalThis.fetch = originalFetch; }
});

test("initial snapshots forward the cursor needed by incremental synchronization", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ items: [] }, { headers: { "x-dontus-operations-cursor": "instance:4" } });
  try {
    const response = await GET(new Request("http://localhost/api/operations"));
    assert.deepEqual(await response.json(), { items: [] });
    assert.equal(response.headers.get("x-dontus-operations-cursor"), "instance:4");
  } finally { globalThis.fetch = originalFetch; }
});
