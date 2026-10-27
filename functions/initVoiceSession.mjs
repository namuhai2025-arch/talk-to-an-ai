import admin from "firebase-admin";
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { AccessToken, AgentDispatchClient } from "livekit-server-sdk";
import { getApps, initializeApp } from "firebase-admin/app";

if (getApps().length === 0) {
  initializeApp();
}

const db = admin.firestore();

const LIVEKIT_API_KEY = defineSecret("LIVEKIT_API_KEY");
const LIVEKIT_API_SECRET = defineSecret("LIVEKIT_API_SECRET");
const LIVEKIT_URL = defineSecret("LIVEKIT_URL");

function extractBearerToken(req) {
  const authHeader = req.headers.authorization || req.headers.Authorization || "";
  if (typeof authHeader !== "string") return "";
  if (!authHeader.startsWith("Bearer ")) return "";
  return authHeader.slice(7).trim();
}

async function verifyRequestUser(req) {
  const idToken = extractBearerToken(req);
  if (!idToken) {
    const error = new Error("Missing authorization bearer token");
    error.statusCode = 401;
    throw error;
  }

  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    if (!decoded?.uid) {
      const error = new Error("Invalid user token payload");
      error.statusCode = 401;
      throw error;
    }
    return decoded;
  } catch (err) {
    const error = new Error("Unauthorized: Invalid or expired token");
    error.statusCode = 401;
    throw error;
  }
}

export const initVoiceSession = onRequest(
  {
    cors: true,
    secrets: [LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL],
  },
  async (req, res) => {
    let uid = "unknown";

    try {
      if (req.method === "OPTIONS") {
        res.status(204).send("");
        return;
      }

      if (req.method !== "POST") {
        res.status(405).json({
          ok: false,
          error: "Method not allowed. Use POST.",
        });
        return;
      }

      const decodedToken = await verifyRequestUser(req);
      uid = decodedToken.uid;

      const apiKey =
        process.env.LIVEKIT_API_KEY ||
        (typeof LIVEKIT_API_KEY.value === "function" ? LIVEKIT_API_KEY.value() : "");
      const apiSecret =
        process.env.LIVEKIT_API_SECRET ||
        (typeof LIVEKIT_API_SECRET.value === "function" ? LIVEKIT_API_SECRET.value() : "");
      const serverUrl =
        process.env.LIVEKIT_URL ||
        (typeof LIVEKIT_URL.value === "function" ? LIVEKIT_URL.value() : "");

      if (!apiKey || !apiSecret || !serverUrl) {
        console.error("LiveKit credentials are not configured.");
        res.status(500).json({
          ok: false,
          error: "Voice service configuration is missing on the server.",
        });
        return;
      }

      const body = req.body && typeof req.body === "object" ? req.body : {};

      const userDocSnap = await db.collection("users").doc(uid).get();
      const userData = userDocSnap.exists ? userDocSnap.data() || {} : {};

      const nickname =
        typeof body.nickname === "string" && body.nickname.trim()
          ? body.nickname.trim()
          : typeof userData.nickname === "string" && userData.nickname.trim()
          ? userData.nickname.trim()
          : "Talkio User";

      const requestedRoom =
        typeof body.roomName === "string" && body.roomName.trim()
          ? body.roomName.trim().replace(/[^a-zA-Z0-9_-]/g, "")
          : "";

      const roomName = requestedRoom || `talkio-room-${uid}-${Date.now()}`;

      // 1. Create client token
      const token = new AccessToken(apiKey, apiSecret, {
        identity: uid,
        name: nickname,
        ttl: "1h",
      });

      token.addGrant({
        roomJoin: true,
        room: roomName,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
      });

      const jwtToken = await token.toJwt();

      // 2. Dispatch the Gemini 3.8 Live Agent Worker into this room
      const dispatchClient = new AgentDispatchClient(serverUrl, apiKey, apiSecret);
      try {
        await dispatchClient.createDispatch(roomName, "talkio-voice-agent", {
          metadata: JSON.stringify({
            uid: uid,
            nickname: nickname,
            role: "assistant",
            voice: "Puck",
          }),
        });
        console.log(`Dispatched talkio-voice-agent to room: ${roomName}`);
      } catch (dispatchError) {
        console.warn("Agent dispatch note (worker may already be listening or will pick up via room monitor):", dispatchError?.message);
      }

      // 3. Persist session state in Firestore
      const sessionRef = db.collection("voice_sessions").doc();
      await sessionRef.set({
        sessionId: sessionRef.id,
        uid: uid,
        roomName: roomName,
        nickname: nickname,
        serverUrl: serverUrl,
        status: "active",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        lastActiveAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      res.status(200).json({
        ok: true,
        token: jwtToken,
        roomName: roomName,
        serverUrl: serverUrl,
        sessionId: sessionRef.id,
        participantIdentity: uid,
        participantName: nickname,
        expiresInSeconds: 3600,
      });
    } catch (error) {
      const statusCode = error?.statusCode || 500;
      console.error("initVoiceSession error:", {
        uid,
        message: error?.message,
        stack: error?.stack,
      });

      res.status(statusCode).json({
        ok: false,
        error: error?.message || "Failed to initialize voice session.",
      });
    }
  }
);