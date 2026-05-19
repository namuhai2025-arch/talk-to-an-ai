import { getMessaging, getToken, isSupported } from "firebase/messaging";
import { getFirebaseApp, getFirebaseAuth } from "./firebase";

export async function registerTalkioPushToken() {
  if (typeof window === "undefined") return null;

  const supported = await isSupported().catch(() => false);

  if (!supported) {
    console.log("FCM not supported in this browser.");
    return null;
  }

  if (!("Notification" in window)) {
    console.log("Notifications not supported.");
    return null;
  }

  const permission = await Notification.requestPermission();

  if (permission !== "granted") {
    console.log("Notification permission denied.");
    return null;
  }

  const auth = getFirebaseAuth();

  await auth.authStateReady();

  const user = auth.currentUser;

  if (!user) {
    console.log("No signed-in user after authStateReady.");
    return null;
  }

  const idToken = await user.getIdToken();

  const registration = await navigator.serviceWorker.register(
  "/firebase-messaging-sw.js"
  );

  await navigator.serviceWorker.ready;

  const messaging = getMessaging(getFirebaseApp());

  const fcmToken = await getToken(messaging, {
    vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
    serviceWorkerRegistration: registration,
  });

  if (!fcmToken) {
    console.log("No FCM token returned.");
    return null;
  }

  await fetch("/api/profile", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fcmToken,
      timezone:
        Intl.DateTimeFormat().resolvedOptions().timeZone,
    }),
  });

  console.log("FCM token registered.");

  return fcmToken;
}