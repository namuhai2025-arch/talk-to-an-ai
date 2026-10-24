import { useState, useRef, useCallback, useEffect } from "react";
import { getAuth } from "firebase/auth";
import { getAudioWorkletBlobUrl, WORKLET_NAME } from "@/utils/audio/pcmRecorderWorklet";

export type SessionStatus =
  | "idle"
  | "authenticating"
  | "connecting"
  | "connected"
  | "error";

interface UseLiveVoiceSessionReturn {
  status: SessionStatus;
  isSpeaking: boolean;
  isListening: boolean;
  isMuted: boolean;
  error: string | null;
  toggleMute: () => void;
  startSession: () => Promise<void>;
  endSession: () => void;
}

const INIT_ENDPOINT_URL =
  "https://us-central1-talkio-production.cloudfunctions.net/initVoiceSession";

export function useLiveVoiceSession(): UseLiveVoiceSessionReturn {
  const [status, setStatus] = useState<SessionStatus>("idle");
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [isListening, setIsListening] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // References for network and audio resources
  const wsRef = useRef<WebSocket | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const muteGainNodeRef = useRef<GainNode | null>(null);
  const isMutedRef = useRef<boolean>(false);

  // Audio playback scheduling
  const nextScheduledTimeRef = useRef<number>(0);
  const activeAudioSourcesRef = useRef<AudioBufferSourceNode[]>([]);

  // Sync state reference for mute handler
  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  // Convert raw 16-bit PCM byte array into base64 for transmission
  const arrayBufferToBase64 = useCallback((buffer: ArrayBuffer | ArrayBufferView): string => {
    let binary = "";
    const bytes = ArrayBuffer.isView(buffer)
      ? new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
      : new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }, []);

  // Flush and cancel any pending or actively playing audio chunks (Barge-in handling)
  const stopPlayback = useCallback(() => {
    for (const source of activeAudioSourcesRef.current) {
      try {
        source.stop();
        source.disconnect();
      } catch {
        // Node may have finished playing already
      }
    }
    activeAudioSourcesRef.current = [];
    if (audioContextRef.current) {
      nextScheduledTimeRef.current = audioContextRef.current.currentTime;
    }
    setIsSpeaking(false);
  }, []);

  // Internal teardown without clearing error states
  const cleanupResources = useCallback(() => {
    stopPlayback();

    if (workletNodeRef.current) {
      workletNodeRef.current.disconnect();
      workletNodeRef.current = null;
    }

    if (muteGainNodeRef.current) {
      muteGainNodeRef.current.disconnect();
      muteGainNodeRef.current = null;
    }

    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.onopen = null;
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.onmessage = null;
      wsRef.current.close();
      wsRef.current = null;
    }

    setIsListening(false);
    setIsSpeaking(false);
    setIsMuted(false);
  }, [stopPlayback]);

  // Stable endSession reference
  const endSession = useCallback(() => {
    cleanupResources();
    setStatus("idle");
  }, [cleanupResources]);

  // Play incoming 24kHz PCM linear audio chunks from Puck
  const scheduleAudioChunk = useCallback((base64Audio: string) => {
    const ctx = audioContextRef.current;
    if (!ctx) {
      return;
    }

    const binaryString = window.atob(base64Audio);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const pcm16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(pcm16.length);
    for (let i = 0; i < pcm16.length; i++) {
      float32[i] = pcm16[i] / 32768.0;
    }

    // Web Audio automatically resamples 24000Hz buffer to hardware rate on playback
    const audioBuffer = ctx.createBuffer(1, float32.length, 24000);
    audioBuffer.copyToChannel(float32, 0);

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);

    const currentTime = ctx.currentTime;
    if (nextScheduledTimeRef.current < currentTime) {
      nextScheduledTimeRef.current = currentTime;
    }

    source.start(nextScheduledTimeRef.current);
    nextScheduledTimeRef.current += audioBuffer.duration;

    setIsSpeaking(true);
    activeAudioSourcesRef.current.push(source);

    source.onended = () => {
      activeAudioSourcesRef.current = activeAudioSourcesRef.current.filter(
        (s) => s !== source
      );
      if (activeAudioSourcesRef.current.length === 0) {
        setIsSpeaking(false);
      }
    };
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => !prev);
  }, []);

  // Main session activation logic
  const startSession = useCallback(async () => {
    try {
      cleanupResources();
      setError(null);
      setStatus("authenticating");

      const auth = getAuth();
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error("No active user session. Please log in.");
      }

      const idToken = await currentUser.getIdToken();

      // Step 1: Handshake with deployed Cloud Function
      const initResponse = await fetch(INIT_ENDPOINT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
      });

      if (!initResponse.ok) {
        const errJson = await initResponse.json().catch(() => ({}));
        if (initResponse.status === 403 && errJson.code === "UPGRADE_REQUIRED") {
          throw new Error("UPGRADE_REQUIRED");
        }
        throw new Error(
          errJson.error || `Handshake failed with status ${initResponse.status}`
        );
      }

      const sessionData = await initResponse.json();
      const { sessionUri, puckInstructions } = sessionData;

      if (!sessionUri) {
        throw new Error("Missing sessionUri from voice session initializer.");
      }

      setStatus("connecting");

      // Step 2: Initialize a single unified Web Audio Context
      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

      // Allow default native hardware sample rate to eliminate mobile OS audio session aborts
      const audioCtx = new AudioCtxClass();

      if (audioCtx.state === "suspended") {
        await audioCtx.resume();
      }

      audioContextRef.current = audioCtx;
      nextScheduledTimeRef.current = audioCtx.currentTime;

      // Step 3: Load AudioWorklet resampler module
      const workletBlobUrl = getAudioWorkletBlobUrl();
      await audioCtx.audioWorklet.addModule(workletBlobUrl);
      URL.revokeObjectURL(workletBlobUrl);

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      micStreamRef.current = stream;

      const micSource = audioCtx.createMediaStreamSource(stream);
      const workletNode = new AudioWorkletNode(audioCtx, WORKLET_NAME);
      workletNodeRef.current = workletNode;

      // Pull-graph anchor: route worklet through silent gain to destination so audio clock never stalls
      const muteNode = audioCtx.createGain();
      muteNode.gain.value = 0;
      muteGainNodeRef.current = muteNode;

      micSource.connect(workletNode);
      workletNode.connect(muteNode);
      muteNode.connect(audioCtx.destination);

      let isSetupComplete = false;

      // Step 4: Establish WebSocket connection
      const socket = new WebSocket(sessionUri);
      wsRef.current = socket;

      socket.onopen = () => {
        const setupMessage = {
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
              parts: [{ text: puckInstructions || "You are Puck." }],
            },
          },
        };

        socket.send(JSON.stringify(setupMessage));
      };

      // Worklet sends cleanly downsampled 16kHz Int16 buffers
      workletNode.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
        if (
          socket.readyState !== WebSocket.OPEN ||
          !isSetupComplete ||
          isMutedRef.current ||
          !event.data
        ) {
          return;
        }

        const base64Data = arrayBufferToBase64(event.data);
        const inputMessage = {
          realtimeInput: {
            mediaChunks: [
              {
                mimeType: "audio/pcm;rate=16000",
                data: base64Data,
              },
            ],
          },
        };
        socket.send(JSON.stringify(inputMessage));
      };

      socket.onmessage = async (event: MessageEvent) => {
        try {
          const rawData =
            typeof event.data === "string"
              ? event.data
              : event.data instanceof Blob
              ? await event.data.text()
              : null;

          if (!rawData) return;

          const response = JSON.parse(rawData);

          // Handle Setup Acknowledgment & Kickoff initial turn
          if (response.setupComplete) {
            console.log("[LiveVoice] Handshake acknowledged by Google.");
            isSetupComplete = true;
            setStatus("connected");
            setIsListening(true);

            // Trigger greeting turn so Puck speaks immediately
            socket.send(
              JSON.stringify({
                clientContent: {
                  turns: [
                    {
                      role: "user",
                      parts: [
                        {
                          text: "Hello! The voice call just connected. Greet me warmly in one natural sentence to start our conversation.",
                        },
                      ],
                    },
                  ],
                  turnComplete: true,
                },
              })
            );
            return;
          }

          // Handle Interruption / User Barge-in
          if (response.serverContent?.interrupted) {
            stopPlayback();
            return;
          }

          // Handle Incoming Puck Audio Stream (corresponds to your screenshot)
          const parts = response.serverContent?.modelTurn?.parts;
          if (Array.isArray(parts)) {
            for (const part of parts) {
              if (
                part.inlineData &&
                part.inlineData.mimeType?.startsWith("audio/pcm") &&
                part.inlineData.data
              ) {
                console.log("[LiveVoice] Playing audio chunk from Puck...");
                scheduleAudioChunk(part.inlineData.data);
              }
            }
          }
        } catch (parseErr) {
          console.error("Error parsing Gemini WebSocket message:", parseErr);
        }
      };

      socket.onerror = (e) => {
        console.error("Voice WebSocket encountered an error:", e);
        setError("WebSocket communication error occurred.");
        setStatus("error");
        cleanupResources();
      };

      socket.onclose = (event) => {
        console.warn("Voice WebSocket closed:", event.code, event.reason);
        cleanupResources();
        if (event.code !== 1000 && event.code !== 1005) {
          setError(
            `Session closed unexpectedly (Code ${event.code}: ${
              event.reason || "Policy/Protocol error"
            })`
          );
          setStatus("error");
        } else {
          setStatus((prev) => (prev === "error" ? "error" : "idle"));
        }
      };
    } catch (err: unknown) {
      console.error("Failed to start voice session:", err);
      const message =
        err instanceof Error ? err.message : "Failed to initiate voice session.";
      setError(message);
      setStatus("error");
      cleanupResources();
    }
  }, [arrayBufferToBase64, cleanupResources, scheduleAudioChunk, stopPlayback]);

  // Teardown once on unmount only
  useEffect(() => {
    return () => {
      cleanupResources();
    };
  }, [cleanupResources]);

  return {
    status,
    isSpeaking,
    isListening,
    isMuted,
    error,
    toggleMute,
    startSession,
    endSession,
  };
}