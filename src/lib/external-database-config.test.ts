import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { validateExternalDatabaseConfig } from "./external-database-config";

describe("External database routing", () => {
  const url = "https://umofughlvohswsfdridk.supabase.co";
  it("fails explicitly when any of the three Secrets is missing instead of falling back", () => {
    assert.throws(() => validateExternalDatabaseConfig(undefined, undefined, undefined, true), /EXTERNAL_SUPABASE_URL.*EXTERNAL_SUPABASE_PUBLISHABLE_KEY.*EXTERNAL_SUPABASE_SERVICE_ROLE_KEY/);
    assert.throws(() => validateExternalDatabaseConfig(url, "test-public", undefined, true), /EXTERNAL_SUPABASE_SERVICE_ROLE_KEY/);
  });
  it("rejects other projects and insecure endpoints", () => {
    assert.throws(() => validateExternalDatabaseConfig("https://other.supabase.co", "test-public"), /projeto externo autorizado/);
    assert.throws(() => validateExternalDatabaseConfig(url.replace("https:", "http:"), "test-public"), /projeto externo autorizado/);
  });
  it("returns only URL and publishable key, never the administrative key", () => {
    assert.deepEqual(validateExternalDatabaseConfig(url, "test-public", "test-admin", true), { url, publicKey: "test-public" });
  });
});