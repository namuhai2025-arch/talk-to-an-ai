import dotenv from "dotenv";
dotenv.config();

import WebSocket from "ws";
import { AccessToken, RoomServiceClient } from "livekit-server-sdk";
import {
  Room,
  RoomEvent,
  AudioStream,
  AudioSource,
  LocalAudioTrack,
  TrackKind,
  AudioFrame,
} from "@livekit/rtc-node";

const LIVEKIT_URL = process.env.LIVEKIT_URL;
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET || !GEMINI_API_KEY) {
  console.error("FATAL: Missing environment variables. Please check LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET, and GEMINI_API_KEY.");
  process.exit(1);
}

const activeRooms = new Set();
const roomServiceClient = new RoomServiceClient(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

async function mintAgentToken(roomName) {
  const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: `agent-puck-${Date.now()}`,
    name: "Talkio Assistant (Puck)",
    ttl: "4h",
  });

  at.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  return await at.toJwt();
}

async function handleRoomSession(roomName) {
  if (activeRooms.has(roomName)) return;
  activeRooms.add(roomName);

  console.log(`[Worker] Connecting Agent to room: ${roomName}`);

  const room = new Room();
  const geminiWsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${GEMINI_API_KEY}`;
  const geminiWs = new WebSocket(geminiWsUrl);

  // LiveKit Audio Output to User: 24kHz mono PCM
  const audioSource = new AudioSource(24000, 1);
  const audioTrack = LocalAudioTrack.createAudioTrack("talkio-agent-audio", audioSource);

  let isGeminiReady = false;
  let audioQueue = [];
  let isPlaying = false;

  async function processAudioQueue() {
    if (isPlaying || audioQueue.length === 0) return;
    isPlaying = true;

    while (audioQueue.length > 0) {
      const pcmBuffer = audioQueue.shift();
      const samples = new Int16Array(
        pcmBuffer.buffer,
        pcmBuffer.byteOffset,
        pcmBuffer.byteLength / 2
      );

      // Frame chunk: 24000 samples/sec * 0.02s (20ms) = 480 samples
      const frameSize = 480;
      for (let offset = 0; offset < samples.length; offset += frameSize) {
        const slice = samples.subarray(offset, offset + frameSize);
        const frameData = new Int16Array(frameSize);
        frameData.set(slice);

        const frame = new AudioFrame(frameData, 24000, 1, frameSize);
        await audioSource.captureFrame(frame);
      }
    }

    isPlaying = false;
  }

  geminiWs.on("open", () => {
    console.log(`[Gemini] Connected to Gemini Realtime WebSocket for room: ${roomName}`);

    const setupPayload = {
      setup: {
        model: "models/gemini-3.8-live",
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: "Puck",
              },
            },
          },
        },
        systemInstruction: {
          parts: [
            {
              text: "You are Talkio Assistant, an intelligent, concise, and helpful conversational voice AI. Speak naturally and keep answers short, friendly, and engaging.",
            },
          ],
        },
      },
    };

    geminiWs.send(JSON.stringify(setupPayload));
  });

    geminiWs.on("message", async (rawMessage) => {
    try {
      const response = JSON.parse(rawMessage.toString());

      if (response.setupComplete) {
        isGeminiReady = true;
        console.log(`[Gemini] Setup acknowledged. Puck voice persona active for room: ${roomName}`);
        return;
      }

      if (response.serverContent?.interrupted) {
        console.log(`[Gemini] User interrupted Puck. Flushing audio.`);
        audioQueue = [];
        isPlaying = false;
        return;
      }

      const parts = response.serverContent?.modelTurn?.parts;
      if (Array.isArray(parts)) {
        for (const part of parts) {
          if (part.text) {
            console.log(`[Gemini Puck Text]: ${part.text}`);
          }
          if (part.inlineData && part.inlineData.mimeType?.startsWith("audio/pcm")) {
            console.log(`[Gemini Puck Voice]: Received audio chunk (${part.inlineData.data.length} chars)`);
            const buffer = Buffer.from(part.inlineData.data, "base64");
            audioQueue.push(buffer);
            processAudioQueue();
          }
        }
      }
    } catch (parseErr) {
      console.error("[Gemini] Error handling message:", parseErr);
    }
  });

  geminiWs.on("close", (code, reason) => {
    console.log(`[Gemini] Connection closed (${code}): ${reason.toString()}`);
    isGeminiReady = false;
    activeRooms.delete(roomName);
    room.disconnect();
  });

  geminiWs.on("error", (err) => {
    console.error("[Gemini] WebSocket error:", err);
  });

    room.on(RoomEvent.TrackSubscribed, async (track, publication, participant) => {
    if (
      track.kind === TrackKind.KIND_AUDIO &&
      !participant.identity.startsWith("agent-") &&
      participant.identity !== room.localParticipant.identity
    ) {
      console.log(`[LiveKit] Subscribed to human participant audio: ${participant.identity}`);

      const audioStream = new AudioStream(track, 16000, 1);
      let chunkCount = 0;

      for await (const frame of audioStream) {
        if (!isGeminiReady || geminiWs.readyState !== WebSocket.OPEN) {
          continue;
        }

        chunkCount++;
        if (chunkCount % 50 === 0) {
          console.log(`[LiveKit -> Gemini] Streaming mic audio... (${chunkCount} frames sent)`);
        }

        const buffer = Buffer.from(frame.data.buffer, frame.data.byteOffset, frame.data.byteLength);
        const base64Pcm = buffer.toString("base64");

        const clientChunk = {
          realtimeInput: {
            mediaChunks: [
              {
                mimeType: "audio/pcm;rate=16000",
                data: base64Pcm,
              },
            ],
          },
        };

        geminiWs.send(JSON.stringify(clientChunk));
      }
    }
  });

  room.on(RoomEvent.Disconnected, () => {
    console.log(`[LiveKit] Disconnected from room: ${roomName}`);
    activeRooms.delete(roomName);
    if (geminiWs.readyState === WebSocket.OPEN) {
      geminiWs.close();
    }
  });

  // Join the LiveKit room as agent
  const agentToken = await mintAgentToken(roomName);
  await room.connect(LIVEKIT_URL, agentToken);
  await room.localParticipant.publishTrack(audioTrack);
  console.log(`[LiveKit] Agent successfully joined room: ${roomName} as Talkio Assistant (Puck)`);
}

async function monitorRooms() {
  console.log("[Worker] Starting Talkio Voice Agent service...");
  console.log(`[Worker] Connected to LiveKit: ${LIVEKIT_URL}`);

  setInterval(async () => {
    try {
      const rooms = await roomServiceClient.listRooms();
      for (const r of rooms) {
        // Only join rooms that have participants and no running agent session
        if (r.numParticipants > 0 && !activeRooms.has(r.name)) {
          handleRoomSession(r.name).catch((err) => {
            console.error(`[Worker] Error handling room ${r.name}:`, err);
            activeRooms.delete(r.name);
          });
        }
      }
    } catch (err) {
      console.error("[Worker] Error polling room status:", err?.message);
    }
  }, 2000);
}

monitorRooms();