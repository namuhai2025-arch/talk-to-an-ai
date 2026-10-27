import { onCall, HttpsError } from "firebase-functions/v2/https";
import { AccessToken } from "livekit-server-sdk";
import {
  livekitApiKey,
  livekitApiSecret,
  livekitUrl,
} from "../config/secrets.mjs";

export const getLivekitToken = onCall(
  {
    secrets: [livekitApiKey, livekitApiSecret, livekitUrl],
    cors: true,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "Authentication is required to request a LiveKit session token."
      );
    }

    const uid = request.auth.uid;
    let { roomName, participantName } = request.data || {};

    if (!roomName || typeof roomName !== "string" || roomName.trim().length === 0) {
      roomName = `talkio-voice-${uid}-${Date.now()}`;
    }

    const apiKey = livekitApiKey.value();
    const apiSecret = livekitApiSecret.value();
    const url = livekitUrl.value();

    if (!apiKey || !apiSecret || !url) {
      throw new HttpsError(
        "internal",
        "LiveKit credentials are not configured in Secret Manager."
      );
    }

    const identity = uid;
    const name =
      participantName && typeof participantName === "string" && participantName.trim().length > 0
        ? participantName.trim()
        : (request.auth.token?.name || identity);

    const token = new AccessToken(apiKey, apiSecret, {
      identity,
      name,
      ttl: "1h",
    });

    token.addGrant({
      room: roomName.trim(),
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    const jwt = await token.toJwt();

    return {
      token: jwt,
      url,
      serverUrl: url,
      roomName: roomName.trim(),
    };
  }
);