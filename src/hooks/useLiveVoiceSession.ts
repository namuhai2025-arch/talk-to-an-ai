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

  // Network and audio resource references
  const wsRef = useRef<WebSocket | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const muteGainNodeRef = useRef<GainNode | null>(null);
  const isMutedRef = useRef<boolean>(false);

  // Playback scheduling
  const nextScheduledTimeRef = useRef<number>(0);
  const activeAudioSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const isPuckSpeakingRef = useRef<boolean>(false);
  const initialGreetingDoneRef = useRef<boolean>(false);

  // Voice Activity & Silence Detection for Turn Completion
  const hasSpokenInCurrentTurnRef = useRef<boolean>(false);
  const pauseTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

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

  const stopPlayback = useCallback(() => {
    for (const source of activeAudioSourcesRef.current) {
      try {
        source.stop();
        source.disconnect();
      } catch {
        // Source already terminated
      }
    }
    activeAudioSourcesRef.current = [];
    if (audioContextRef.current) {
      nextScheduledTimeRef.current = audioContextRef.current.currentTime;
    }
    isPuckSpeakingRef.current = false;
    setIsSpeaking(false);
  }, []);

  const cleanupResources = useCallback(() => {
    if (pauseTimerRef.current) {
      clearTimeout(pauseTimerRef.current);
      pauseTimerRef.current = null;
    }

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

    initialGreetingDoneRef.current = false;
    isPuckSpeakingRef.current = false;
    hasSpokenInCurrentTurnRef.current = false;
    setIsListening(false);
    setIsSpeaking(false);
    setIsMuted(false);
  }, [stopPlayback]);

  const endSession = useCallback(() => {
    cleanupResources();
    setStatus("idle");
  }, [cleanupResources]);

  const scheduleAudioChunk = useCallback((base64Audio: string) => {
    const ctx = audioContextRef.current;
    if (!ctx) return;

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

    isPuckSpeakingRef.current = true;
    setIsSpeaking(true);
    activeAudioSourcesRef.current.push(source);

    source.onended = () => {
      activeAudioSourcesRef.current = activeAudioSourcesRef.current.filter((s) => s !== source);
      if (activeAudioSourcesRef.current.length === 0) {
        isPuckSpeakingRef.current = false;
        setIsSpeaking(false);
      }
    };
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => !prev);
  }, []);

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

      // Handshake with Cloud Function
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
        throw new Error(errJson.error || `Handshake failed with status ${initResponse.status}`);
      }

      const sessionData = await initResponse.json();
      const { sessionUri, puckInstructions } = sessionData;

      if (!sessionUri) {
        throw new Error("Missing sessionUri from voice session initializer.");
      }

      setStatus("connecting");

      // Initialize AudioContext with native 16000Hz downsampling
      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

      const audioCtx = new AudioCtxClass({ sampleRate: 16000 });

      if (audioCtx.state === "suspended") {
        await audioCtx.resume();
      }

      audioContextRef.current = audioCtx;
      nextScheduledTimeRef.current = audioCtx.currentTime;

      // Register Worklet
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

      const muteNode = audioCtx.createGain();
      muteNode.gain.value = 0;
      muteGainNodeRef.current = muteNode;

      micSource.connect(workletNode);
      workletNode.connect(muteNode);
      muteNode.connect(audioCtx.destination);

      let isSetupComplete = false;
      let packetCounter = 0;

      // Connect to Google WebSocket
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
              parts: [{ text: puckInstructions || "You are Puck, a friendly conversational partner." }],
            },
          },
        };

        socket.send(JSON.stringify(setupMessage));
      };

      // Ingest audio from Worklet and detect turn completion
      workletNode.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
        if (
          socket.readyState !== WebSocket.OPEN ||
          !isSetupComplete ||
          isMutedRef.current ||
          !initialGreetingDoneRef.current ||
          !event.data
        ) {
          return;
        }

        const pcm = new Int16Array(event.data);
        let sum = 0;
        for (let i = 0; i < pcm.length; i++) {
          sum += Math.abs(pcm[i]);
        }
        const avgLevel = Math.round(sum / pcm.length);

        packetCounter++;
        if (packetCounter % 20 === 0 && avgLevel > 300) {
          console.log(`[LiveVoice] Mic input active (Level: ${avgLevel})`);
        }

        // Voice Activity Detection: If voice level is active (> 600)
        if (avgLevel > 600) {
          hasSpokenInCurrentTurnRef.current = true;
          if (pauseTimerRef.current) {
            clearTimeout(pauseTimerRef.current);
            pauseTimerRef.current = null;
          }
        } else if (hasSpokenInCurrentTurnRef.current && avgLevel < 350 && !pauseTimerRef.current) {
          // User finished speaking and paused for 600ms -> Commit the turn
          pauseTimerRef.current = setTimeout(() => {
            if (socket.readyState === WebSocket.OPEN && hasSpokenInCurrentTurnRef.current) {
              console.log("[LiveVoice] Pause detected. Committing turn to Puck...");
              socket.send(
                JSON.stringify({
                  clientContent: {
                    turnComplete: true,
                  },
                })
              );
              hasSpokenInCurrentTurnRef.current = false;
            }
            pauseTimerRef.current = null;
          }, 600);
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

          // Handle Setup Complete
          if (response.setupComplete) {
            console.log("[LiveVoice] Handshake acknowledged by Google.");
            isSetupComplete = true;
            setStatus("connected");
            setIsListening(true);

            // Kick off greeting turn
            socket.send(
              JSON.stringify({
                clientContent: {
                  turns: [
                    {
                      role: "user",
                      parts: [
                        {
                          text: "Hello! The call just connected. Greet me warmly in one natural sentence to start our conversation.",
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

          if (response.error) {
            console.error("[LiveVoice] Server Error:", response.error);
            return;
          }

          // Handle Interruption / Barge-in
          if (response.serverContent?.interrupted) {
            console.log("[LiveVoice] Puck interrupted by user.");
            stopPlayback();
            return;
          }

          // Handle Turn Complete
          if (response.serverContent?.turnComplete) {
            console.log("[LiveVoice] Puck finished turn. Mic is active for your reply.");
            initialGreetingDoneRef.current = true;
            hasSpokenInCurrentTurnRef.current = false;
          }

          // Schedule Puck Audio
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
              if (part.text) {
                console.log("[LiveVoice] Puck text:", part.text);
              }
            }
          }
        } catch (parseErr) {
          console.error("Error parsing message:", parseErr);
        }
      };

      socket.onerror = (e) => {
        console.error("WebSocket error:", e);
        setError("WebSocket communication error occurred.");
        setStatus("error");
        cleanupResources();
      };

      socket.onclose = (event) => {
        console.warn("WebSocket closed:", event.code, event.reason);
        cleanupResources();
        if (event.code !== 1000 && event.code !== 1005) {
          setError(
            `Session closed (Code ${event.code}: ${event.reason || "Server ended session"})`
          );
          setStatus("error");
        } else {
          setStatus((prev) => (prev === "error" ? "error" : "idle"));
        }
      };
    } catch (err: unknown) {
      console.error("Failed to start session:", err);
      const message = err instanceof Error ? err.message : "Failed to initiate session.";
      setError(message);
      setStatus("error");
      cleanupResources();
    }
  }, [arrayBufferToBase64, cleanupResources, scheduleAudioChunk, stopPlayback]);

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