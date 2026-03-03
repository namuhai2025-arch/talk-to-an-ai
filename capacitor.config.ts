// capacitor.config.ts
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.talkio.app',
  appName: 'Talkio',
  webDir: 'out',

  server: {
    url: 'https://talkiochat.com',
    cleartext: false
  },

  plugins: {
    SystemBars: {
      insetsHandling: 'css',
      style: 'DARK',
      hidden: false,
      animation: 'NONE'
    }
  }
};

export default config;