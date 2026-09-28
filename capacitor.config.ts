import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.talkiochat.app', // keep whatever your current appId is
  appName: 'Talkio',
  webDir: 'out', // or whatever your webDir is
  server: {
    url: 'https://talkiochat.com',
    cleartext: true
  },
  plugins: {
    // 1. Your Camera Config
    Camera: {
      ios: {
        cameraUsageDescription: "Talkio needs access to your camera to send photos.",
        photoLibraryUsageDescription: "Talkio needs access to your gallery to send photos."
      }
    },
    // 2. THIS IS THE NEW FIX FOR GOOGLE LOGIN
    FirebaseAuthentication: {
      providers: ["google.com"]
    }
  }
};

export default config;