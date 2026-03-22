import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { loadConfig, saveConfig, validateConfig, getNodesDir } from "../src/config";
import { join } from "path";
import { mkdirSync, rmSync, existsSync } from "fs";

const TEST_NODES_DIR = join(import.meta.dir, "fixtures", "nodes");

describe("config", () => {
  beforeEach(() => {
    mkdirSync(TEST_NODES_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TEST_NODES_DIR, { recursive: true, force: true });
  });

  test("loadConfig returns null when config does not exist", () => {
    const config = loadConfig(TEST_NODES_DIR);
    expect(config).toBeNull();
  });

  test("saveConfig writes and loadConfig reads back", () => {
    const config = {
      tailscale: { authKey: "tskey-auth-test123" },
      providers: {
        aws: {
          accessKeyId: "AKIATEST",
          secretAccessKey: "secret123",
          useAmbientCredentials: false,
        },
      },
    };
    saveConfig(config, TEST_NODES_DIR);
    const loaded = loadConfig(TEST_NODES_DIR);
    expect(loaded).toEqual(config);
  });

  test("saveConfig overwrites existing config", () => {
    const initial = {
      tailscale: { authKey: "tskey-auth-old" },
      providers: {},
    };
    saveConfig(initial, TEST_NODES_DIR);

    const update = {
      tailscale: { authKey: "tskey-auth-new" },
      providers: {
        aws: {
          accessKeyId: "AKIATEST",
          secretAccessKey: "secret",
          useAmbientCredentials: false,
        },
      },
    };
    saveConfig(update, TEST_NODES_DIR);
    const loaded = loadConfig(TEST_NODES_DIR);
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

  test("validateConfig returns errors for AWS missing credentials without ambient", () => {
    const config = {
      tailscale: { authKey: "tskey-auth-test" },
      providers: {
        aws: {
          accessKeyId: "",
          secretAccessKey: "",
          useAmbientCredentials: false,
        },
      },
    };
    const errors = validateConfig(config);
    expect(errors.length).toBeGreaterThan(0);
  });

  test("validateConfig passes for AWS with ambient credentials", () => {
    const config = {
      tailscale: { authKey: "tskey-auth-test" },
      providers: {
        aws: {
          accessKeyId: "",
          secretAccessKey: "",
          useAmbientCredentials: true,
        },
      },
    };
    const errors = validateConfig(config);
    expect(errors).toEqual([]);
  });

  test("validateConfig passes for valid config", () => {
    const config = {
      tailscale: { authKey: "tskey-auth-test" },
      providers: {
        aws: {
          accessKeyId: "AKIATEST",
          secretAccessKey: "secret",
          useAmbientCredentials: false,
        },
      },
    };
    const errors = validateConfig(config);
    expect(errors).toEqual([]);
  });
});
