export { registerProvider, getProvider, getAllProviderNames } from "./registry";
export type { Provider } from "./types";

// Providers register themselves on import
import "./aws";
import "./hetzner";
import "./gcp";
