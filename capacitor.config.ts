import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.talkiochat.app',
  appName: 'Talkio',
  webDir: 'out',
  server: {
    url: "https://talkiochat.com",
    cleartext: true
  },
  ios: {
    contentInset: "always",
    allowsLinkPreview: true
  }
};

export default config;