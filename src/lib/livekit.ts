import {
  Room,
  RoomEvent,
  Track,
  RemoteTrack,
  RemoteTrackPublication,
  RemoteParticipant,
  RoomOptions,
} from "livekit-client";
import { httpsCallable } from "firebase/functions";
import { getFirebaseFunctions, getFirebaseAuth } from "@/lib/firebase";

export interface LivekitTokenRequest {
  roomName?: string;
  participantName?: string;
  metadata?: Record<string, unknown>;
}

export interface LivekitTokenResponse {
  token: string;
  url: string;
  serverUrl?: string;
  roomName?: string;
}

/**
 * Fetches the LiveKit access token from your Firebase Cloud Function.
 */
export async function fetchLivekitToken(
  payload?: LivekitTokenRequest
): Promise<LivekitTokenResponse> {
  const functions = getFirebaseFunctions();
  const auth = getFirebaseAuth();
  const user = auth.currentUser;

  const getLivekitTokenFn = httpsCallable<LivekitTokenRequest, LivekitTokenResponse>(
    functions,
    "getLivekitToken"
  );

  const fallbackRoom = user ? `talkio-voice-${user.uid}` : `talkio-voice-${Date.now()}`;

  const requestPayload: LivekitTokenRequest = {
    roomName: payload?.roomName || fallbackRoom,
    participantName: payload?.participantName || user?.displayName || user?.uid || "User",
    ...payload,
  };

  const result = await getLivekitTokenFn(requestPayload);
  const data = result.data;

  return {
    ...data,
    serverUrl: data.serverUrl || data.url,
  };
}

/**
 * Creates and configures a LiveKit Room optimized for real-time voice interactions.
 */
export function createVoiceRoom(options?: RoomOptions): Room {
  const defaultOptions: RoomOptions = {
    adaptiveStream: true,
    dynacast: true,
    audioCaptureDefaults: {
      autoGainControl: true,
      echoCancellation: true,
      noiseSuppression: true,
    },
    ...options,
  };

  const room = new Room(defaultOptions);

  room.on(
    RoomEvent.TrackSubscribed,
    (
      track: RemoteTrack,
      publication: RemoteTrackPublication,
      participant: RemoteParticipant
    ) => {
      if (track.kind === Track.Kind.Audio) {
        const audioElement = track.attach();
        audioElement.setAttribute("data-participant-id", participant.identity);
      }
    }
  );

  room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
    if (track.kind === Track.Kind.Audio) {
      track.detach().forEach((el) => el.remove());
    }
  });

  return room;
}