import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'cc.brakke.relaychat',
  appName: 'Relay Chat',
  webDir: '../frontend/dist',
  server: {
    url: 'https://chat.brakke.cc',
    androidScheme: 'https',
  },
};

export default config;
