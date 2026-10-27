"use client";

import React, { useState, useEffect, useId, useRef } from "react";
import { useLiveKitVoice } from "@/hooks/useLiveKitVoice";

export interface VoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  agentName?: string;
  [key: string]: unknown;
}

export default function VoiceModal({
  isOpen,
  onClose,
  agentName = "Talkio Assistant",
}: VoiceModalProps) {
  const [durationSeconds, setDurationSeconds] = useState<number>(0);
  const titleId = useId();
  const attemptedRef = useRef<boolean>(false);

  const {
    isConnected,
    isConnecting,
    isAgentSpeaking,
    isUserSpeaking,
    isMuted,
    error,
    startSession,
    endSession,
    toggleMute,
  } = useLiveKitVoice({
    onDisconnected: () => {
      setDurationSeconds(0);
    },
  });

  // Single guarded effect to start and stop sessions cleanly
  useEffect(() => {
    if (isOpen && !attemptedRef.current && !isConnected && !isConnecting) {
      attemptedRef.current = true;
      startSession().catch((err: unknown) => {
        console.error("Failed to connect voice session:", err);
      });
    } else if (!isOpen) {
      attemptedRef.current = false;
      if (isConnected || isConnecting) {
        endSession().catch((err: unknown) => {
          console.error("Failed to cleanly disconnect voice session:", err);
        });
      }
    }
  }, [isOpen, isConnected, isConnecting, startSession, endSession]);

  // Session duration timer
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isConnected) {
      interval = setInterval(() => {
        setDurationSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      setDurationSeconds(0);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isConnected]);

  if (!isOpen) return null;

  const formatTimer = (totalSeconds: number): string => {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  };

  const handleEndCall = async () => {
    await endSession();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md transition-opacity duration-300 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="relative w-full max-w-sm rounded-3xl bg-neutral-900 border border-neutral-800 p-6 shadow-2xl flex flex-col items-center justify-between min-h-[460px] text-white select-none">
        {/* Header: Title & Active Duration */}
        <div className="w-full flex flex-col items-center space-y-1">
          <span
            id={titleId}
            className="text-xs font-semibold tracking-wider uppercase text-neutral-400"
          >
            Voice Session
          </span>
          <h2 className="text-xl font-bold tracking-tight text-white">
            {agentName}
          </h2>
          <div className="h-6 flex items-center">
            {isConnected ? (
              <span className="text-xs font-mono tracking-widest text-emerald-400 font-medium">
                {formatTimer(durationSeconds)}
              </span>
            ) : isConnecting ? (
              <span className="text-xs font-medium text-amber-400 animate-pulse">
                Connecting...
              </span>
            ) : (
              <span className="text-xs font-medium text-neutral-500">
                Disconnected
              </span>
            )}
          </div>
        </div>

        {/* Central Audio Visualizer Orb */}
        <div className="relative flex items-center justify-center my-8">
          {/* Outer Ripple for Agent Speaking */}
          <div
            className={`absolute w-44 h-44 rounded-full transition-all duration-300 pointer-events-none ${
              isAgentSpeaking
                ? "bg-indigo-500/20 scale-125 animate-ping opacity-75"
                : "opacity-0 scale-100"
            }`}
          />
          {/* Middle Pulse for Agent Speaking */}
          <div
            className={`absolute w-36 h-36 rounded-full transition-all duration-500 pointer-events-none ${
              isAgentSpeaking
                ? "bg-indigo-500/30 scale-110 animate-pulse"
                : isUserSpeaking
                ? "bg-emerald-500/20 scale-105"
                : "opacity-0"
            }`}
          />

          {/* Central Sphere */}
          <div
            className={`relative z-10 w-28 h-28 rounded-full flex items-center justify-center shadow-lg transition-transform duration-300 ${
              isAgentSpeaking
                ? "bg-gradient-to-tr from-indigo-600 to-violet-500 scale-105 shadow-indigo-500/50"
                : isUserSpeaking
                ? "bg-gradient-to-tr from-emerald-600 to-teal-500 scale-100 shadow-emerald-500/40"
                : "bg-neutral-800 border border-neutral-700"
            }`}
          >
            {isConnecting ? (
              <svg
                className="w-10 h-10 text-white animate-spin"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                />
              </svg>
            ) : isAgentSpeaking ? (
              <svg
                className="w-10 h-10 text-white animate-pulse"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                />
              </svg>
            ) : (
              <svg
                className="w-10 h-10 text-neutral-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                />
              </svg>
            )}
          </div>
        </div>

        {/* Status / Live Feedback */}
        <div className="w-full text-center px-4 min-h-[3rem] flex items-center justify-center">
          {error ? (
            <p className="text-xs text-rose-400 bg-rose-950/40 border border-rose-800/60 rounded-xl px-3 py-1.5 line-clamp-2">
              {error.message || "Failed to establish voice connection"}
            </p>
          ) : isAgentSpeaking ? (
            <span className="text-xs text-indigo-300 font-medium tracking-wide">
              {agentName} is speaking...
            </span>
          ) : isUserSpeaking ? (
            <span className="text-xs text-emerald-300 font-medium tracking-wide">
              Listening to you...
            </span>
          ) : isMuted ? (
            <span className="text-xs text-amber-400 font-medium tracking-wide">
              Your microphone is muted
            </span>
          ) : isConnected ? (
            <span className="text-xs text-neutral-400 font-medium tracking-wide">
              Ready. Go ahead and speak.
            </span>
          ) : null}
        </div>

        {/* Action Controls */}
        <div className="w-full flex items-center justify-center space-x-6 mt-4 pb-2">
          {/* Mute/Unmute */}
          <button
            type="button"
            onClick={toggleMute}
            disabled={!isConnected}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${
              isMuted
                ? "bg-amber-500/20 text-amber-400 border border-amber-500/40 hover:bg-amber-500/30"
                : "bg-neutral-800 text-neutral-200 border border-neutral-700 hover:bg-neutral-700"
            } ${!isConnected ? "opacity-40 cursor-not-allowed" : "cursor-pointer active:scale-95"}`}
            aria-label={isMuted ? "Unmute microphone" : "Mute microphone"}
          >
            {isMuted ? (
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"
                />
              </svg>
            ) : (
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                />
              </svg>
            )}
          </button>

          {/* End Call */}
          <button
            type="button"
            onClick={handleEndCall}
            className="w-16 h-16 rounded-full bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center shadow-lg shadow-rose-600/40 transition-transform active:scale-95 cursor-pointer"
            aria-label="End call"
          >
            <svg
              className="w-7 h-7 rotate-[135deg]"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M6.62 10.79a15.053 15.053 0 006.59 6.59l2.2-2.2a1 1 0 011.02-.24 11.72 11.72 0 003.68.59 1 1 0 011 1v3.49a1 1 0 01-1 1A17.93 17.93 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1 11.72 11.72 0 00.59 3.68 1 1 0 01-.24 1.02l-2.23 2.09z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}