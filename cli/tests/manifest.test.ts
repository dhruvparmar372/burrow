import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { loadManifest, saveManifest, addNode, removeNode, findNode } from "../src/manifest";
import { join } from "path";
import { mkdirSync, rmSync } from "fs";

const TEST_NODES_DIR = join(import.meta.dir, "fixtures", "nodes");

describe("manifest", () => {
  beforeEach(() => {
    mkdirSync(TEST_NODES_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TEST_NODES_DIR, { recursive: true, force: true });
  });

  test("loadManifest returns empty nodes when file does not exist", () => {
    const manifest = loadManifest(TEST_NODES_DIR);
    expect(manifest).toEqual({ nodes: [] });
  });

  test("addNode adds a node entry", () => {
    const manifest = loadManifest(TEST_NODES_DIR);
    const updated = addNode(manifest, "aws", "ap-south-1");
    expect(updated.nodes).toHaveLength(1);
    expect(updated.nodes[0].provider).toBe("aws");
    expect(updated.nodes[0].region).toBe("ap-south-1");
    expect(updated.nodes[0].directory).toBe("aws-ap-south-1");
    expect(updated.nodes[0].createdAt).toBeDefined();
  });

  test("findNode returns matching node", () => {
    let manifest = loadManifest(TEST_NODES_DIR);
    manifest = addNode(manifest, "aws", "ap-south-1");
    const found = findNode(manifest, "aws", "ap-south-1");
    expect(found).toBeDefined();
    expect(found!.region).toBe("ap-south-1");
  });

  test("findNode returns undefined for non-existent node", () => {
    const manifest = loadManifest(TEST_NODES_DIR);
    const found = findNode(manifest, "aws", "us-east-1");
    expect(found).toBeUndefined();
  });

  test("removeNode removes matching node", () => {
    let manifest = loadManifest(TEST_NODES_DIR);
    manifest = addNode(manifest, "aws", "ap-south-1");
    manifest = addNode(manifest, "aws", "me-central-1");
    manifest = removeNode(manifest, "aws", "ap-south-1");
    expect(manifest.nodes).toHaveLength(1);
    expect(manifest.nodes[0].region).toBe("me-central-1");
  });

  test("saveManifest writes and loadManifest reads back", () => {
    let manifest = loadManifest(TEST_NODES_DIR);
    manifest = addNode(manifest, "aws", "ap-south-1");
    saveManifest(manifest, TEST_NODES_DIR);
    const loaded = loadManifest(TEST_NODES_DIR);
    expect(loaded.nodes).toHaveLength(1);
    expect(loaded.nodes[0].provider).toBe("aws");
  });
});
