// Run against an isolated/staging API with an explicitly supplied test account.
import assert from "node:assert/strict";

const base = (
  process.env.DONTUS_BENCHMARK_URL ?? "http://127.0.0.1:8080"
).replace(/\/$/, "");
const email = process.env.DONTUS_BENCHMARK_EMAIL;
const password = process.env.DONTUS_BENCHMARK_PASSWORD;
assert.ok(
  email && password,
  "Set DONTUS_BENCHMARK_EMAIL and DONTUS_BENCHMARK_PASSWORD to a test account.",
);
const login = await fetch(`${base}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email, password }),
});
assert.equal(login.status, 200, "Test account login failed.");
const { token } = await login.json();
assert.ok(token);
const headers = {
  "x-local-session": token,
  "content-type": "application/json",
};
const summarize = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    requests: sorted.length,
    medianMs: +sorted[Math.floor(sorted.length / 2)].toFixed(2),
    p95Ms: +sorted[Math.ceil(sorted.length * 0.95) - 1].toFixed(2),
  };
};
try {
  const start = performance.now();
  const initial = await fetch(`${base}/api/operations`, { headers });
  assert.equal(initial.status, 200);
  const payload = await initial.json();
  assert.equal(payload.user.email, email);
  const initialMs = +(performance.now() - start).toFixed(2);
  const cursor = initial.headers.get("x-dontus-operations-cursor");
  assert.ok(cursor, "Operational cursor is missing.");
  const cached = [],
    unchanged = [];
  for (let index = 0; index < 15; index++) {
    const at = performance.now();
    const response = await fetch(`${base}/api/operations`, { headers });
    assert.equal(response.status, 200);
    await response.arrayBuffer();
    cached.push(performance.now() - at);
  }
  for (let index = 0; index < 30; index++) {
    const at = performance.now();
    const response = await fetch(`${base}/api/operations`, {
      method: "POST",
      headers: { ...headers, "x-dontus-operations-cursor": cursor },
      body: JSON.stringify({ action: "refreshOperations" }),
    });
    assert.equal(
      response.status,
      204,
      "Run in an idle environment with an active realtime listener.",
    );
    assert.equal(await response.text(), "");
    unchanged.push(performance.now() - at);
  }
  console.log(
    JSON.stringify(
      {
        initialMs,
        loadedItems: payload.items.length,
        cached: summarize(cached),
        unchanged: summarize(unchanged),
      },
      null,
      2,
    ),
  );
} finally {
  await fetch(`${base}/api/auth/signout`, { method: "POST", headers });
}
