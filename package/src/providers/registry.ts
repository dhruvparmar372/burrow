import type { Provider } from "./types";

const providers = new Map<string, Provider>();

export function registerProvider(provider: Provider): void {
  providers.set(provider.name, provider);
}

export function getProvider(name: string): Provider | undefined {
  return providers.get(name);
}

export function getAllProviderNames(): string[] {
  return Array.from(providers.keys());
}
