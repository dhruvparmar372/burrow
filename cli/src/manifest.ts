import { join } from "path";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { getNodesDir } from "./config";

export interface NodeEntry {
  provider: string;
  region: string;
  directory: string;
  createdAt: string;
}

export interface Manifest {
  nodes: NodeEntry[];
}

const MANIFEST_FILE = "manifest.json";

export function loadManifest(nodesDir?: string): Manifest {
  const dir = nodesDir ?? getNodesDir();
  const manifestPath = join(dir, MANIFEST_FILE);
  if (!existsSync(manifestPath)) return { nodes: [] };
  const raw = readFileSync(manifestPath, "utf-8");
  return JSON.parse(raw) as Manifest;
}

export function saveManifest(manifest: Manifest, nodesDir?: string): void {
  const dir = nodesDir ?? getNodesDir();
  mkdirSync(dir, { recursive: true });
  const manifestPath = join(dir, MANIFEST_FILE);
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
}

export function addNode(manifest: Manifest, provider: string, region: string): Manifest {
  const directory = `${provider}-${region}`;
  const entry: NodeEntry = {
    provider,
    region,
    directory,
    createdAt: new Date().toISOString(),
  };
  return { nodes: [...manifest.nodes, entry] };
}

export function removeNode(manifest: Manifest, provider: string, region: string): Manifest {
  return {
    nodes: manifest.nodes.filter(
      (n) => !(n.provider === provider && n.region === region)
    ),
  };
}

export function findNode(manifest: Manifest, provider: string, region: string): NodeEntry | undefined {
  return manifest.nodes.find(
    (n) => n.provider === provider && n.region === region
  );
}
