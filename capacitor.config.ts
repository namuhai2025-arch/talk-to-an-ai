import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.talkio.reflect', // Ensure this matches your bundle ID
  appName: 'Talkio',
  webDir: 'out',
  server: {
    url: 'https://talkiochat.com', // Your live URL
    cleartext: true
  },
  plugins: {
    Camera: {
      // These are required for iOS
      ios: {
        cameraUsageDescription: "Talkio needs access to your camera to send photos.",
        photoLibraryUsageDescription: "Talkio needs access to your gallery to send photos."
      }
    }
  }
};

export default config;