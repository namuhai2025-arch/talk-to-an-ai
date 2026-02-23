import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.talkio.app",
  appName: "Talkio",
  webDir: "out",
  server: {
    url: "https://talkiochat.com",
    cleartext: true,
  },
};

export default config;