import { createHash } from "node:crypto";
import { getFirestore } from "firebase-admin/firestore";
import { fetchImageAccess } from "./talkioImageAccess.mjs";

const hash = (value) =>
  createHash("sha256").update(value).digest("hex");

const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // 4 MB
const MAX_BASE64_LENGTH = 4 * Math.ceil(MAX_IMAGE_BYTES / 3);
const LEASE_MS = 10 * 60 * 1000;

export class ImageSendError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function fail(status, code, message) {
  throw new ImageSendError(status, code, message);
}

function validateImage(body) {
  if (body.image == null) return null;

  let mimeType = "image/jpeg";
  let rawData = "";

  // 1. Handle both Object format AND raw String format
  if (typeof body.image === "string") {
    const str = body.image.trim();
    const match = str.match(/^data:(image\/[a-zA-Z+]+);base64,/);
    if (match) {
      mimeType = match[1];
      rawData = str.slice(match[0].length);
    } else {
      rawData = str;
    }
  } else if (typeof body.image === "object" && !Array.isArray(body.image)) {
    mimeType = body.image.mimeType || "image/jpeg";
    rawData = typeof body.image.data === "string" ? body.image.data : "";
  } else {
    fail(400, "INVALID_IMAGE", "Invalid photo.");
  }

  // 2. Normalize MIME type
  if (mimeType === "image/jpg") mimeType = "image/jpeg";
  if (!["image/jpeg", "image/png", "image/webp"].includes(mimeType)) {
    fail(400, "INVALID_IMAGE", "Invalid photo type.");
  }

  // 3. Sanitize Base64 string
  const cleanBase64 = rawData
    .replace(/^data:image\/[a-zA-Z+]+;base64,/, "")
    .replace(/\s+/g, "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  if (!cleanBase64) {
    fail(400, "INVALID_IMAGE", "Empty photo data.");
  }

  // 4. Decode into buffer
  const bytes = Buffer.from(cleanBase64, "base64");

  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) {
    fail(400, "INVALID_IMAGE", "Photo exceeds maximum size.");
  }

  // 5. Binary magic-byte signature check
  const validSignature =
    mimeType === "image/jpeg"
      ? bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
      : mimeType === "image/png"
        ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : bytes.subarray(0, 4).toString() === "RIFF" &&
          bytes.subarray(8, 12).toString() === "WEBP";

  if (!validSignature) {
    fail(400, "INVALID_IMAGE", "Invalid photo signature.");
  }

  // 6. Ensure or create a valid requestId
  if (
    typeof body.requestId !== "string" ||
    !/^[A-Za-z0-9_-]{16,128}$/.test(body.requestId)
  ) {
    body.requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  }

  return {
    mimeType,
    data: bytes.toString("base64"),
  };
}

export async function beginImageSend(uid, body) {
  const image = validateImage(body);
  if (!image) return null;

  if (typeof uid !== "string" || !uid) {
    fail(401, "UNAUTHORIZED", "Please sign in again.");
  }

  const db = getFirestore();
  const requestId = body.requestId;

  const fingerprint = hash(
    JSON.stringify({
      image,
      message: body.message || "",
      messages: body.messages || [],
      source: body.source || "chat",
    })
  );

  const requestRef = db
    .collection("talkioImageRequests")
    .doc(hash(uid))
    .collection("requests")
    .doc(requestId);

  const prior = await requestRef.get();

  if (prior.exists) {
    if (prior.data().fingerprint !== fingerprint) {
      fail(409, "IMAGE_REQUEST_CONFLICT", "This photo request has changed.");
    }

    if (prior.data().status === "complete") {
      return { cached: prior.data().response };
    }
  }

  const access = await fetchImageAccess(
    uid,
    process.env.REVENUE_CAT_KEY
  );

  if (
    !access.eligible ||
    access.verifiedTier !== "companion" ||
    access.limit !== 30
  ) {
    fail(403, "COMPANION_REQUIRED", "Image attachments require Companion.");
  }

  const quotaRef = db
    .collection("talkioImageUsage")
    .doc(hash(uid))
    .collection("periods")
    .doc(access.periodKey);

  const acquired = await db.runTransaction(async (tx) => {
    const request = await tx.get(requestRef);
    const quota = await tx.get(quotaRef);
    const now = Date.now();

    if (request.exists) {
      const previous = request.data();

      if (previous.fingerprint !== fingerprint) {
        fail(409, "IMAGE_REQUEST_CONFLICT", "This photo request has changed.");
      }

      if (previous.status === "complete") {
        return { cached: previous.response };
      }

      if (previous.status === "pending" && previous.leaseUntil > now) {
        fail(
          409,
          "IMAGE_REQUEST_PENDING",
          "Your photo is still being processed. Please try again shortly."
        );
      }
    }

    const data = quota.exists
      ? quota.data()
      : { used: 0, reservations: {} };

    if (!Number.isSafeInteger(data.used) || data.used < 0) {
      throw new Error("Invalid image counter");
    }

    const reservations = { ...(data.reservations || {}) };
    let used = data.used;

    // Recover reservations left behind by interrupted functions.
    for (const [id, expiry] of Object.entries(reservations)) {
      if (!Number.isFinite(expiry)) {
        throw new Error("Invalid image reservation");
      }

      if (expiry <= now) {
        delete reservations[id];
        used--;
      }
    }

    if (used < 0) throw new Error("Invalid image counter");

    if (used >= 30) {
      fail(
        429,
        "IMAGE_MONTHLY_LIMIT",
        "Your monthly image allowance has been used."
      );
    }

    const leaseUntil = now + LEASE_MS;
    reservations[requestId] = leaseUntil;

    tx.set(quotaRef, {
      ...data,
      used: used + 1,
      reservations,
    });

    tx.set(requestRef, {
      fingerprint,
      status: "pending",
      leaseUntil,
      createdAt: new Date(now),
    });

    return { leaseUntil };
  });

  if (acquired.cached) return acquired;

  let completed = false;

  return {
    image,

    async complete(response) {
      const saved = await db.runTransaction(async (tx) => {
        const request = await tx.get(requestRef);
        const quota = await tx.get(quotaRef);

        if (request.data()?.status === "complete") {
          return request.data().response;
        }

        const data = quota.data();

        if (
          request.data()?.status !== "pending" ||
          request.data().leaseUntil !== acquired.leaseUntil ||
          data?.reservations?.[requestId] !== acquired.leaseUntil ||
          acquired.leaseUntil <= Date.now()
        ) {
          fail(
            409,
            "IMAGE_REQUEST_EXPIRED",
            "Please try sending the photo again."
          );
        }

        const reservations = { ...data.reservations };
        delete reservations[requestId];

        const result = JSON.parse(
          JSON.stringify({
            ...response,
            requestId,
            imageAccepted: true,
            imageUsage: {
              used: data.used,
              limit: 30,
              remaining: Math.max(0, 30 - data.used),
              resetsAt: access.inGracePeriod ? null : access.periodEnd,
            },
          })
        );

        tx.set(quotaRef, { ...data, reservations });

        tx.set(requestRef, {
          fingerprint,
          status: "complete",
          response: result,
          completedAt: new Date(),
        });

        return result;
      });

      completed = true;
      return saved;
    },

    async release() {
      if (completed) return;

      await db.runTransaction(async (tx) => {
        const request = await tx.get(requestRef);
        const quota = await tx.get(quotaRef);

        if (
          request.data()?.status !== "pending" ||
          request.data().leaseUntil !== acquired.leaseUntil
        ) {
          return;
        }

        const data = quota.data();

        if (data?.reservations?.[requestId] === acquired.leaseUntil) {
          const reservations = { ...data.reservations };
          delete reservations[requestId];

          tx.set(quotaRef, {
            ...data,
            used: Math.max(0, data.used - 1),
            reservations,
          });
        }

        tx.set(requestRef, {
          fingerprint,
          status: "failed",
          failedAt: new Date(),
        });
      });
    },
  };
}