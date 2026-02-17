import type { PluginRuntime } from 'openclaw/plugin-sdk';

let runtime: PluginRuntime | null = null;

export function setRelayRuntime(next: PluginRuntime) {
  runtime = next;
}

export function getRelayRuntime(): PluginRuntime {
  if (!runtime) {
    throw new Error('Relay runtime not initialized');
  }
  return runtime;
}
