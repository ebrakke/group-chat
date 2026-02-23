import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'cc.brakke.relaychat',
  appName: 'Relay Chat',
  webDir: '../frontend/dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
