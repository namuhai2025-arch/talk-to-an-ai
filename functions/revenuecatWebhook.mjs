import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { createHash, timingSafeEqual } from "node:crypto";

const webhookAuth = defineSecret("REVENUECAT_WEBHOOK_AUTH");
const apiKey = defineSecret("REVENUECAT_SECRET_API_KEY");

const hash = (value) =>
  createHash("sha256").update(value).digest("hex");

const object = (value) =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value);

export function authorized(actual, expected) {
  if (
    typeof actual !== "string" ||
    typeof expected !== "string" ||
    !expected
  ) {
    return false;
  }

  const a = Buffer.from(actual);
  const b = Buffer.from(expected);

  return a.length === b.length && timingSafeEqual(a, b);
}

export function customerIds(event) {
  const list =
    event.type === "TRANSFER"
      ? [
          ...(Array.isArray(event.transferred_from)
            ? event.transferred_from
            : []),
          ...(Array.isArray(event.transferred_to)
            ? event.transferred_to
            : []),
        ]
      : [
          event.app_user_id,
          event.original_app_user_id,
          ...(Array.isArray(event.aliases) ? event.aliases : []),
        ];

  return [
    ...new Set(
      list.filter(
        (id) =>
          typeof id === "string" &&
          id.length > 0 &&
          id.length <= 128 &&
          !id.startsWith("$RCAnonymousID:"),
      ),
    ),
  ];
}

export function snapshotFromResponse(data) {
  if (
    !object(data) ||
    !object(data.subscriber) ||
    !object(data.subscriber.entitlements) ||
    !object(data.subscriber.subscriptions) ||
    !Number.isFinite(data.request_date_ms)
  ) {
    throw new Error("Invalid customer response");
  }

  // Store verified subscription information.
  // The image-access resolver will check entitlement names,
  // expiration dates, and production status separately.
  return {
    provider: "revenuecat",
    fetchedAtMs: data.request_date_ms,
    entitlements: data.subscriber.entitlements,
    subscriptions: data.subscriber.subscriptions,
  };
}

// This function stores subscription snapshots only.
// Before using them to grant access, Firestore rules must
// prevent clients from writing talkioRevenueCatCustomers.
export const revenuecatWebhook = onRequest(
  {
    region: "us-central1",
    timeoutSeconds: 60,
    invoker: "public",
    secrets: [webhookAuth, apiKey],
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.set("Allow", "POST");
      return res.status(405).json({
        error: "Method not allowed",
      });
    }

    if (!authorized(req.get("authorization"), webhookAuth.value())) {
      return res.status(401).json({
        error: "Unauthorized",
      });
    }

    const event = req.body?.event;

    if (
      !object(event) ||
      typeof event.type !== "string" ||
      typeof event.id !== "string" ||
      !event.id ||
      event.id.length > 512
    ) {
      return res.status(400).json({
        error: "Invalid event",
      });
    }

    if (event.type === "TEST") {
      return res.status(200).json({
        ok: true,
        test: true,
      });
    }

    if (event.environment === "SANDBOX") {
      return res.status(200).json({
        ok: true,
        ignored: "sandbox",
      });
    }

    if (
      event.environment !== "PRODUCTION" &&
      event.type !== "TRANSFER"
    ) {
      return res.status(400).json({
        error: "Missing production environment",
      });
    }

    try {
      if (!getApps().length) {
        initializeApp();
      }

      const db = getFirestore();
      const ids = customerIds(event);

      if (ids.length > 30) {
        throw new Error("Too many customer identities");
      }

      let synced = 0;

      for (let offset = 0; offset < ids.length; offset += 5) {
        const results = await Promise.allSettled(
          ids.slice(offset, offset + 5).map(async (uid) => {
            try {
              await getAuth().getUser(uid);
            } catch (error) {
              if (
                error.code === "auth/user-not-found" ||
                error.code === "auth/invalid-uid"
              ) {
                return 0;
              }

              throw error;
            }

            const response = await fetch(
              `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}`,
              {
                headers: {
                  Authorization: `Bearer ${apiKey.value()}`,
                  Accept: "application/json",
                },
                signal: AbortSignal.timeout(8000),
              },
            );

            if (!response.ok) {
              throw new Error(`RevenueCat HTTP ${response.status}`);
            }

            const snapshot = snapshotFromResponse(
              await response.json(),
            );

            const ref = db
              .collection("talkioRevenueCatCustomers")
              .doc(hash(uid));

            await db.runTransaction(async (tx) => {
              const previous = await tx.get(ref);

              // Prevent an older response from replacing newer data.
              if (
                previous.exists &&
                previous.data().fetchedAtMs >= snapshot.fetchedAtMs
              ) {
                return;
              }

              tx.set(ref, {
                ...snapshot,
                uid,
                lastEventId: event.id,
                updatedAt: FieldValue.serverTimestamp(),
              });
            });

            return 1;
          }),
        );

        if (results.some((result) => result.status === "rejected")) {
          throw new Error(
            "Customer sync failed; redelivery required",
          );
        }

        synced += results.reduce(
          (sum, result) => sum + result.value,
          0,
        );
      }

      if (!synced) {
        console.warn(
          "RevenueCat event had no matching Firebase user",
          { eventId: event.id },
        );
      }

      return res.status(200).json({
        ok: true,
        synced,
      });
    } catch (error) {
      console.error("RevenueCat webhook sync failed", {
        eventId: event.id,
        message: error.message,
      });

      return res.status(503).json({
        error: "Subscription sync temporarily unavailable",
      });
    }
  },
);
