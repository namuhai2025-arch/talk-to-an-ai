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
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const isMutedRef = useRef<boolean>(false);

  // Audio playback scheduling
  const nextScheduledTimeRef = useRef<number>(0);
  const activeAudioSourcesRef = useRef<AudioBufferSourceNode[]>([]);

  // Sync state reference for mute handler
  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  // Convert raw 16-bit PCM byte array into base64 for transmission
  const arrayBufferToBase64 = useCallback((buffer: ArrayBuffer): string => {
    let binary = "";
    const bytes = new Uint8Array(buffer);
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
    if (outputAudioContextRef.current) {
      nextScheduledTimeRef.current = outputAudioContextRef.current.currentTime;
    }
    setIsSpeaking(false);
  }, []);

  // Teardown all resources cleanly
  const endSession = useCallback(() => {
    stopPlayback();

    if (workletNodeRef.current) {
      workletNodeRef.current.disconnect();
      workletNodeRef.current = null;
    }

    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
    }

    if (inputAudioContextRef.current) {
      inputAudioContextRef.current.close().catch(() => {});
      inputAudioContextRef.current = null;
    }

    if (outputAudioContextRef.current) {
      outputAudioContextRef.current.close().catch(() => {});
      outputAudioContextRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.onmessage = null;
      wsRef.current.close();
      wsRef.current = null;
    }

    setStatus("idle");
    setIsListening(false);
    setIsSpeaking(false);
    setIsMuted(false);
  }, [stopPlayback]);

  // Play incoming 24kHz PCM linear audio chunks from Puck
  const scheduleAudioChunk = useCallback((base64Audio: string) => {
    if (!outputAudioContextRef.current) {
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

    const ctx = outputAudioContextRef.current;
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
      setError(null);
      setStatus("authenticating");

      const auth = getAuth();
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error("No active user session. Please log in.");
      }

      const idToken = await currentUser.getIdToken();

      // Step 1: Handshake with our deployed Cloud Function
      const initResponse = await fetch(INIT_ENDPOINT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
      });

      if (!initResponse.ok) {
        const errJson = await initResponse.json().catch(() => ({}));
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

      // Step 2: Initialize Web Audio Contexts
      // Input at 16kHz for Gemini Multimodal Live API
      const inputCtx = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext)({
        sampleRate: 16000,
      });
      // Output at 24kHz for Puck's synthesized response chunks
      const outputCtx = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext)({
        sampleRate: 24000,
      });

      await inputCtx.resume();
      await outputCtx.resume();

      inputAudioContextRef.current = inputCtx;
      outputAudioContextRef.current = outputCtx;
      nextScheduledTimeRef.current = outputCtx.currentTime;

      // Step 3: Load AudioWorklet for 16kHz PCM capture
      const workletBlobUrl = getAudioWorkletBlobUrl();
      await inputCtx.audioWorklet.addModule(workletBlobUrl);
      URL.revokeObjectURL(workletBlobUrl);

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      micStreamRef.current = stream;

      const micSource = inputCtx.createMediaStreamSource(stream);
      const workletNode = new AudioWorkletNode(inputCtx, WORKLET_NAME);
      workletNodeRef.current = workletNode;

      // Step 4: Establish WebSocket connection
      const socket = new WebSocket(sessionUri);
      wsRef.current = socket;

      socket.onopen = () => {
        // Send initial setup frame with Puck voice and personalized instructions
        const setupMessage = {
          setup: {
            model: "models/gemini-2.0-flash-exp",
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
        setStatus("connected");
        setIsListening(true);
      };

      // Mic processor sends chunks up to Gemini
      workletNode.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
        if (
          socket.readyState !== WebSocket.OPEN ||
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

      micSource.connect(workletNode);
      workletNode.connect(inputCtx.destination);

      // Handle downstream audio chunks from Gemini
      socket.onmessage = (event: MessageEvent) => {
        try {
          const rawData =
            typeof event.data === "string" ? event.data : null;
          if (!rawData) return;

          const response = JSON.parse(rawData);

          // Handle Barge-in Interruption signal
          if (response.serverContent?.interrupted) {
            stopPlayback();
            return;
          }

          // Process model turn parts
          const parts = response.serverContent?.modelTurn?.parts;
          if (Array.isArray(parts)) {
            for (const part of parts) {
              if (
                part.inlineData &&
                part.inlineData.mimeType?.startsWith("audio/pcm") &&
                part.inlineData.data
              ) {
                scheduleAudioChunk(part.inlineData.data);
              }
            }
          }
        } catch (parseErr) {
          console.error("Error parsing Gemini WebSocket message:", parseErr);
        }
      };

      socket.onerror = () => {
        setError("WebSocket communication error occurred.");
        endSession();
      };

      socket.onclose = () => {
        endSession();
      };
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to initiate voice session.";
      setError(message);
      setStatus("error");
      endSession();
    }
  }, [arrayBufferToBase64, endSession, scheduleAudioChunk, stopPlayback]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      endSession();
    };
  }, [endSession]);

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