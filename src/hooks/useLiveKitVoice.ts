"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Room, RoomEvent, Participant, RemoteParticipant } from "livekit-client";
import { createVoiceRoom, fetchLivekitToken, LivekitTokenRequest } from "@/lib/livekit";

export interface UseLiveKitVoiceOptions {
  onConnected?: () => void;
  onDisconnected?: () => void;
  onError?: (error: Error) => void;
}

export function useLiveKitVoice(options: UseLiveKitVoiceOptions = {}) {
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [isAgentSpeaking, setIsAgentSpeaking] = useState<boolean>(false);
  const [isUserSpeaking, setIsUserSpeaking] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  const roomRef = useRef<Room | null>(null);

  const endSession = useCallback(async () => {
    try {
      if (roomRef.current) {
        await roomRef.current.disconnect();
        roomRef.current = null;
      }
    } catch (err) {
      console.error("Error disconnecting room:", err);
    } finally {
      setIsConnected(false);
      setIsConnecting(false);
      setIsAgentSpeaking(false);
      setIsUserSpeaking(false);
      options.onDisconnected?.();
    }
  }, [options]);

  const startSession = useCallback(
    async (requestPayload?: LivekitTokenRequest) => {
      if (isConnecting || isConnected) return;

      setIsConnecting(true);
      setError(null);

      try {
        // 1. Fetch token and LiveKit URL from Firebase Cloud Function
        const { token, serverUrl: payloadServerUrl } = await fetchLivekitToken(requestPayload);
        const wsUrl = payloadServerUrl || process.env.NEXT_PUBLIC_LIVEKIT_URL;

        if (!wsUrl) {
          throw new Error("LiveKit server URL is missing. Set NEXT_PUBLIC_LIVEKIT_URL or return serverUrl from the Cloud Function.");
        }

        // 2. Initialize Room instance
        const room = createVoiceRoom();
        roomRef.current = room;

        // 3. Register audio speaking events
        room.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
          const agentActive = speakers.some(
            (s) => s instanceof RemoteParticipant && s.isSpeaking
          );
          const userActive = speakers.some(
            (s) => s === room.localParticipant && s.isSpeaking
          );

          setIsAgentSpeaking(agentActive);
          setIsUserSpeaking(userActive);
        });

        room.on(RoomEvent.Disconnected, () => {
          setIsConnected(false);
          setIsConnecting(false);
          setIsAgentSpeaking(false);
          setIsUserSpeaking(false);
          options.onDisconnected?.();
        });

        // 4. Connect to LiveKit Room
        await room.connect(wsUrl, token);

        // 5. Unlock audio for mobile / WebKit (Capacitor requirement)
        await room.startAudio();

        // 6. Enable user microphone
        await room.localParticipant.setMicrophoneEnabled(true);

        setIsConnected(true);
        setIsMuted(!room.localParticipant.isMicrophoneEnabled);
        options.onConnected?.();
      } catch (err: unknown) {
        const resolvedError = err instanceof Error ? err : new Error(String(err));
        setError(resolvedError);
        options.onError?.(resolvedError);
        await endSession();
      } finally {
        setIsConnecting(false);
      }
    },
    [isConnecting, isConnected, endSession, options]
  );

  const toggleMute = useCallback(async () => {
    if (!roomRef.current || !isConnected) return;

    try {
      const currentMicrophoneState = roomRef.current.localParticipant.isMicrophoneEnabled;
      await roomRef.current.localParticipant.setMicrophoneEnabled(!currentMicrophoneState);
      setIsMuted(currentMicrophoneState);
    } catch (err) {
      console.error("Failed to toggle microphone state:", err);
    }
  }, [isConnected]);

  // Cleanup on component unmount
  useEffect(() => {
    return () => {
      if (roomRef.current) {
        roomRef.current.disconnect();
      }
    };
  }, []);

  return {
    isConnected,
    isConnecting,
    isAgentSpeaking,
    isUserSpeaking,
    isMuted,
    error,
    startSession,
    endSession,
    toggleMute,
    room: roomRef.current,
  };
}