import type { CapacitorConfig } from '@capacitor/cli';
import { readFileSync, existsSync } from 'fs';

let serverUrl = 'https://chat.brakke.cc';

// Allow override via server-url.txt (written by build script)
const configPath = new URL('./server-url.txt', import.meta.url).pathname;
if (existsSync(configPath)) {
  serverUrl = readFileSync(configPath, 'utf-8').trim();
}

const config: CapacitorConfig = {
  appId: 'cc.brakke.relaychat',
  appName: 'Relay Chat',
  webDir: '../frontend/dist',
  server: {
    url: serverUrl,
    androidScheme: 'https',
  },
};

export default config;
