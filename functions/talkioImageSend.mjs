import { createHash } from "node:crypto";
import { getFirestore } from "firebase-admin/firestore";
import { fetchImageAccess } from "./talkioImageAccess.mjs";

const hash = (value) =>
  createHash("sha256").update(value).digest("hex");

const MAX_IMAGE_BYTES = 512 * 1024;
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

  const image = body.image;

  if (
    typeof image !== "object" ||
    Array.isArray(image) ||
    !["image/jpeg", "image/png", "image/webp"].includes(image.mimeType) ||
    typeof image.data !== "string" ||
    !image.data.length ||
    image.data.length > MAX_BASE64_LENGTH ||
    image.data.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(image.data)
  ) {
    fail(400, "INVALID_IMAGE", "Invalid photo.");
  }

  const bytes = Buffer.from(image.data, "base64");

  if (
    bytes.length > MAX_IMAGE_BYTES ||
    bytes.toString("base64") !== image.data
  ) {
    fail(400, "INVALID_IMAGE", "Invalid photo.");
  }

  const validSignature =
    image.mimeType === "image/jpeg"
      ? bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
      : image.mimeType === "image/png"
        ? bytes.subarray(0, 8).equals(
            Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
          )
        : bytes.subarray(0, 4).toString() === "RIFF" &&
          bytes.subarray(8, 12).toString() === "WEBP";

  if (
    !validSignature ||
    typeof body.requestId !== "string" ||
    !/^[A-Za-z0-9_-]{16,128}$/.test(body.requestId)
  ) {
    fail(400, "INVALID_IMAGE_REQUEST", "Invalid photo request.");
  }

  return {
    mimeType: image.mimeType,
    data: image.data,
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

  // Unmetered personal access granted

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