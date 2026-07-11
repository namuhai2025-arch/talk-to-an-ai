import { Capacitor } from "@capacitor/core";
import {
  getMessaging,
  getToken,
  isSupported,
} from "firebase/messaging";
import {
  getFirebaseApp,
  getFirebaseAuth,
} from "./firebase";

async function getAuthenticatedUser() {
  const auth = getFirebaseAuth();

  await auth.authStateReady();

  const user = auth.currentUser;

  if (!user) return null;

  return {
    user,
    idToken: await user.getIdToken(),
  };
}

async function updateProfile(body: Record<string, unknown>) {
  const authInfo = await getAuthenticatedUser();

  if (!authInfo) return null;

  const response = await fetch("/api/profile", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${authInfo.idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(
      `Profile update failed with status ${response.status}`
    );
  }

  return response.json().catch(() => null);
}

export async function syncTalkioProfile() {
  if (typeof window === "undefined") return null;

  const timezone =
    Intl.DateTimeFormat().resolvedOptions().timeZone;

  if (!timezone) return null;

  await updateProfile({
    timezone,
  });

  return timezone;
}

export async function registerTalkioPushToken() {
  if (typeof window === "undefined") return null;

  if (Capacitor.isNativePlatform()) {
    console.log("FCM web push skipped on native app.");
    return null;
  }

  const supported = await isSupported().catch(() => false);
  if (!supported) return null;

  if (!("Notification" in window)) return null;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return null;

  const registration =
    await navigator.serviceWorker.register(
      "/firebase-messaging-sw.js"
    );

  await navigator.serviceWorker.ready;

  const messaging = getMessaging(getFirebaseApp());

  const fcmToken = await getToken(messaging, {
    vapidKey:
      process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
    serviceWorkerRegistration: registration,
  });

  if (!fcmToken) return null;

  await updateProfile({
    fcmToken,
    timezone:
      Intl.DateTimeFormat().resolvedOptions().timeZone,
  });

  return fcmToken;
}