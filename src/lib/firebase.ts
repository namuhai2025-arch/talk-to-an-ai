import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getAnalytics, logEvent, type Analytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let app: FirebaseApp | null = null;
let authInstance: Auth | null = null;

let analyticsInstance: Analytics | null = null;

export function getFirebaseApp(): FirebaseApp {
  if (typeof window === "undefined") {
    throw new Error("Firebase app should only be initialized in the browser");
  }

  if (app) return app;

  app = getApps().length ? getApps()[0]! : initializeApp(firebaseConfig);
  return app;
}

export function getFirebaseAuth(): Auth {
  if (typeof window === "undefined") {
    throw new Error("Firebase auth should only be initialized in the browser");
  }

  if (authInstance) return authInstance;

  authInstance = getAuth(getFirebaseApp());
  return authInstance;
}

export function getFirebaseAnalytics(): Analytics {
  if (typeof window === "undefined") {
    throw new Error("Firebase analytics should only be initialized in the browser");
  }

  if (analyticsInstance) return analyticsInstance;

  analyticsInstance = getAnalytics(getFirebaseApp());

  return analyticsInstance;
}

export { logEvent };