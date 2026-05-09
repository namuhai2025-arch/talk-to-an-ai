importScripts(
  "https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js"
);

importScripts(
  "https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js"
);

firebase.initializeApp({
  apiKey: "AIzaSyBYZA2jaXAzhYW5aFA7LcCkBLBJM5oqFfk",
  authDomain: "talkio-production.firebaseapp.com",
  projectId: "talkio-production",
  storageBucket: "talkio-production.firebasestorage.app",
  messagingSenderId: "813406735573",
  appId: "1:813406735573:web:9d2cf247852f36266ee65c",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title =
    payload?.notification?.title || "Talkio";

  const body =
    payload?.notification?.body ||
    "Hey... just checking in.";

  self.registration.showNotification(title, {
    body,
    icon: "/icon.png",
    badge: "/icon.png",
    data: {
      url: payload?.data?.url || "/",
    },
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url =
    event.notification?.data?.url || "/";

  event.waitUntil(
    clients.matchAll({
      type: "window",
      includeUncontrolled: true,
    }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.focus();
          return;
        }
      }

      return clients.openWindow(url);
    })
  );
});