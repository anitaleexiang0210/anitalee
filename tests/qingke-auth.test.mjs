import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

process.env.NEXT_PUBLIC_QINGKE_SUPABASE_URL = "https://example.supabase.co";
process.env.NEXT_PUBLIC_QINGKE_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";

const source = readFileSync(new URL("../app/qingke/auth.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const module = { exports: {} };
new Function("require", "module", "exports", compiled)(createRequire(import.meta.url), module, module.exports);
const { registerAccount, signIn } = module.exports;

test("phone login uses a stable internal email without requesting SMS", async () => {
  const requests = [];
  globalThis.localStorage = { setItem() {}, getItem() { return null; }, removeItem() {} };
  globalThis.fetch = async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    return { ok: true, status: 200, json: async () => ({
      access_token: "token", refresh_token: "refresh", expires_in: 3600, user: { id: "user-1" },
    }) };
  };

  await registerAccount("13800138000", "safe-password-123");
  await signIn("+8613800138000", "safe-password-123");
  assert.equal(requests.length, 2);
  assert.equal(requests[0].body.email, "p8613800138000@id.qingke.anitalee.cn");
  assert.equal(requests[1].body.email, requests[0].body.email);
  assert.equal("phone" in requests[0].body, false);
  assert.match(requests[0].url, /\/auth\/v1\/signup$/);
});
