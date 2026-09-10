import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { createHash } from "node:crypto";

const revenueCatKey = defineSecret("REVENUECAT_SECRET_API_KEY");

const digest = (text) =>
  createHash("sha256").update(text).digest("hex");

const isObject = (value) =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value);

const dateMs = (value) =>
  typeof value === "string" ? Date.parse(value) : NaN;

const TIERS = [
  ["elite", ["Talkio Elite", "elite"]],
  [
    "professional",
    [
      "Talkio Professional",
      "Talkio Professionals",
      "professional",
      "professionals",
    ],
  ],
  ["presence", ["Talkio Presence", "presence"]],
  ["companion", ["Talkio Companion", "companion"]],
];

export function monthAfter(anchor, count) {
  const a = new Date(anchor);

  const target = new Date(
    Date.UTC(
      a.getUTCFullYear(),
      a.getUTCMonth() + count,
      1,
      a.getUTCHours(),
      a.getUTCMinutes(),
      a.getUTCSeconds(),
      a.getUTCMilliseconds(),
    ),
  );

  const lastDay = new Date(
    Date.UTC(
      target.getUTCFullYear(),
      target.getUTCMonth() + 1,
      0,
    ),
  ).getUTCDate();

  target.setUTCDate(Math.min(a.getUTCDate(), lastDay));
  return target.getTime();
}

export function resolveImageAccess(
  subscriber,
  now = Date.now(),
) {
  if (
    !isObject(subscriber) ||
    !isObject(subscriber.entitlements) ||
    !isObject(subscriber.subscriptions)
  ) {
    throw new Error("Invalid RevenueCat customer data");
  }

  for (const [tier, names] of TIERS) {
    for (const name of names) {
      const entitlement = subscriber.entitlements[name];
      if (!isObject(entitlement)) continue;

      const subscription =
        subscriber.subscriptions[
          entitlement.product_identifier
        ];

      // Only verified production subscriptions.
      if (
        !isObject(subscription) ||
        subscription.is_sandbox !== false
      ) {
        continue;
      }

      const expires = dateMs(entitlement.expires_date);
      const grace = dateMs(
        entitlement.grace_period_expires_date,
      );

      const validUntil = Math.max(
        Number.isFinite(expires) ? expires : 0,
        Number.isFinite(grace) ? grace : 0,
      );

      if (validUntil <= now) continue;

      // Higher-tier allowances have not been agreed yet.
      if (tier !== "companion") {
        return {
          verifiedTier: tier,
          eligible: false,
          limit: 0,
          reason: "IMAGE_ALLOWANCE_NOT_CONFIGURED",
          accessUntil: new Date(validUntil).toISOString(),
        };
      }

      const anchor = dateMs(
        subscription.purchase_date ||
          entitlement.purchase_date,
      );

      if (
        !Number.isFinite(anchor) ||
        !Number.isFinite(expires) ||
        anchor > now ||
        expires <= anchor
      ) {
        throw new Error("Subscription period unavailable");
      }

      // Grace periods retain the final paid allowance.
      const effectiveNow = Math.min(now, expires - 1);

      const a = new Date(anchor);
      const n = new Date(effectiveNow);

      let months = Math.max(
        0,
        (n.getUTCFullYear() - a.getUTCFullYear()) * 12 +
          n.getUTCMonth() -
          a.getUTCMonth(),
      );

      if (monthAfter(anchor, months) > effectiveNow) {
        months--;
      }

      const start = monthAfter(anchor, months);
      const end = Math.min(
        monthAfter(anchor, months + 1),
        expires,
      );

      return {
        verifiedTier: tier,
        eligible: true,
        limit: 30,
        reason: null,
        periodStart: new Date(start).toISOString(),
        periodEnd: new Date(end).toISOString(),
        accessUntil: new Date(validUntil).toISOString(),
        inGracePeriod: now >= expires,
        periodKey: digest(
          `${entitlement.product_identifier}:${start}`,
        ),
      };
    }
  }

  return {
    verifiedTier: "free",
    eligible: false,
    limit: 0,
    reason: "COMPANION_REQUIRED",
  };
}

export async function fetchImageAccess(
  uid,
  secret,
  now = Date.now(),
) {
  const response = await fetch(
    `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}`,
    {
      headers: {
        Authorization: `Bearer ${secret}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(10000),
    },
  );

  if (!response.ok) {
    throw new Error(
      `RevenueCat returned HTTP ${response.status}`,
    );
  }

  const data = await response.json();
  return resolveImageAccess(data.subscriber, now);
}

export const getTalkioImageAccess = onRequest(
  {
    region: "us-central1",
    timeoutSeconds: 30,
    invoker: "public",
    cors: [
      "https://talkiochat.com",
      "capacitor://localhost",
      "ionic://localhost",
    ],
    secrets: [revenueCatKey],
  },
  async (req, res) => {
    res.set("Cache-Control", "no-store");

    if (req.method !== "POST") {
      res.set("Allow", "POST");

      return res.status(405).json({
        error: "Method not allowed",
      });
    }

    if (!getApps().length) {
      initializeApp();
    }

    let uid;

    try {
      const header = req.get("authorization") || "";

      if (!header.startsWith("Bearer ")) {
        throw new Error("Missing ID token");
      }

      const decoded = await getAuth().verifyIdToken(
        header.slice(7),
        true,
      );

      uid = decoded.uid;
    } catch {
      return res.status(401).json({
        error: "Please sign in again.",
        code: "UNAUTHORIZED",
      });
    }

    try {
      const access = await fetchImageAccess(
        uid,
        revenueCatKey.value(),
      );

      let used = 0;

      if (access.eligible) {
        // Reading never creates or resets a usage counter.
        const quota = await getFirestore()
          .collection("talkioImageUsage")
          .doc(digest(uid))
          .collection("periods")
          .doc(access.periodKey)
          .get();

        if (quota.exists) {
          used = quota.data().used;

          if (!Number.isSafeInteger(used) || used < 0) {
            throw new Error("Invalid image usage counter");
          }
        }
      }

      const { periodKey, ...publicAccess } = access;

      return res.status(200).json({
        ...publicAccess,
        used,
        remaining: Math.max(0, access.limit - used),
        canAttach: access.eligible && used < access.limit,
        resetsAt:
          access.eligible && !access.inGracePeriod
            ? access.periodEnd
            : null,
      });
    } catch (error) {
      console.error("Image access verification failed", {
        message: error.message,
      });

      return res.status(503).json({
        code: "SUBSCRIPTION_VERIFICATION_UNAVAILABLE",
        error:
          "Unable to verify image access. Please try again shortly.",
        retryable: true,
      });
    }
  },
);