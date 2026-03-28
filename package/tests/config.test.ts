import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { loadConfig, saveConfig, validateConfig } from "../src/config";
import { join } from "path";
import { mkdirSync, rmSync } from "fs";

const TEST_DIR = join(import.meta.dir, "fixtures", "config-test");

describe("config", () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  test("loadConfig returns null when config does not exist", () => {
    const config = loadConfig(TEST_DIR);
    expect(config).toBeNull();
  });

  test("saveConfig writes and loadConfig reads back", () => {
    const config = {
      tailscale: { authKey: "tskey-auth-test123" },
      providers: {
        aws: {
          accessKeyId: "AKIATEST",
          secretAccessKey: "secret123",
        },
      },
    };
    saveConfig(config, TEST_DIR);
    const loaded = loadConfig(TEST_DIR);
    expect(loaded).toEqual(config);
  });

  test("saveConfig overwrites existing config", () => {
    const initial = {
      tailscale: { authKey: "tskey-auth-old" },
      providers: {},
    };
    saveConfig(initial, TEST_DIR);

    const update = {
      tailscale: { authKey: "tskey-auth-new" },
      providers: {
        aws: { accessKeyId: "AKIATEST", secretAccessKey: "secret" },
      },
    };
    saveConfig(update, TEST_DIR);
    const loaded = loadConfig(TEST_DIR);
    expect(loaded!.tailscale.authKey).toBe("tskey-auth-new");
    expect(loaded!.providers.aws).toBeDefined();
  });

  test("validateConfig returns errors for missing tailscale auth key", () => {
    const config = {
      tailscale: { authKey: "" },
      providers: {},
    };
    const errors = validateConfig(config);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain("Tailscale");
  });

  test("validateConfig passes for valid config", () => {
    const config = {
      tailscale: { authKey: "tskey-auth-test" },
      providers: {
        aws: { accessKeyId: "AKIATEST", secretAccessKey: "secret" },
      },
    };
    const errors = validateConfig(config);
    expect(errors).toEqual([]);
  });

  test("config supports multiple providers", () => {
    const config = {
      tailscale: { authKey: "tskey-auth-test" },
      providers: {
        aws: { accessKeyId: "AKIATEST", secretAccessKey: "secret" },
        hetzner: { apiToken: "hc-token-123" },
        gcp: { projectId: "my-proj", credentialsJson: "{}" },
      },
    };
    saveConfig(config, TEST_DIR);
    const loaded = loadConfig(TEST_DIR);
    expect(loaded!.providers.aws).toBeDefined();
    expect(loaded!.providers.hetzner).toBeDefined();
    expect(loaded!.providers.gcp).toBeDefined();
  });
});
