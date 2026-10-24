"use client";

import React, { useEffect, useState } from "react";

import { useLiveVoiceSession } from "@/hooks/useLiveVoiceSession";

interface VoiceCallOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  onUpgrade?: () => void;
}

export const VoiceCallOverlay: React.FC<VoiceCallOverlayProps> = ({
  isOpen,
  onClose,
  onUpgrade,
}) => {
  const {
    status,
    isSpeaking,
    isListening,
    isMuted,
    error,
    toggleMute,
    startSession,
    endSession,
  } = useLiveVoiceSession();

  const [callDuration, setCallDuration] = useState<number>(0);

  const isUpgradeRequired = error === "UPGRADE_REQUIRED";

  // Auto-start session when modal opens, teardown when closed
  useEffect(() => {
    if (isOpen) {
      setCallDuration(0);
      startSession();
    } else {
      endSession();
    }
  }, [isOpen, startSession, endSession]);

  // Duration timer when connected
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (status === "connected") {
      timer = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    } else {
      setCallDuration(0);
    }

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [status]);

  if (!isOpen) return null;

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  };

  const handleHangUp = () => {
    endSession();
    onClose();
  };

  const handleUpgradeClick = () => {
    endSession();
    if (onUpgrade) {
      onUpgrade();
    } else {
      window.location.href = "/subscription";
    }
  };

  // Derive visual status text for standard call flow
  const getStatusLabel = () => {
    if (error) return "Connection Failed";
    if (status === "authenticating") return "Authenticating...";
    if (status === "connecting") return "Connecting to Talkio...";
    if (status === "connected") {
      if (isSpeaking) return "Talkio is speaking...";
      if (isMuted) return "Microphone is muted";
      if (isListening) return "Listening (Speak anytime)...";
      return "Connected";
    }
    return "Disconnected";
  };

  // Upgrade Screen State
  if (isUpgradeRequired) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-zinc-950/95 backdrop-blur-xl px-6 py-12 text-white">
        <div className="w-full max-w-sm rounded-3xl bg-zinc-900/90 border border-zinc-800/80 p-8 flex flex-col items-center text-center shadow-2xl relative overflow-hidden">
          {/* Subtle glow header */}
          <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-48 h-48 bg-indigo-500/15 rounded-full blur-3xl pointer-events-none" />

          {/* Tier Badge */}
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold tracking-wider uppercase bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 mb-6">
            Presence Tier
          </span>

          {/* Icon */}
          <div className="h-16 w-16 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/25 mb-5">
            <svg
              className="w-8 h-8 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.75}
                d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 003-3V5a3 3 0 10-6 0v6a3 3 0 003 3z"
              />
            </svg>
          </div>

          {/* Pitch */}
          <h3 className="text-xl font-bold tracking-tight text-zinc-100">
            Talkio Live Voice
          </h3>
          <p className="text-sm text-zinc-400 mt-2 mb-6 leading-relaxed">
            Real-time spoken conversations with natural pacing, voice emotion,
            and instant interruption.
          </p>

          {/* Price */}
          <div className="flex items-baseline gap-1 mb-6">
            <span className="text-3xl font-extrabold tracking-tight text-white">
              $14.99
            </span>
            <span className="text-xs text-zinc-500 font-medium">/ month</span>
          </div>

          {/* Action CTAs */}
          <div className="w-full flex flex-col gap-3">
            <button
              onClick={handleUpgradeClick}
              className="w-full py-3.5 px-4 rounded-xl font-medium text-sm text-white bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-600/30 transition-all active:scale-[0.98]"
            >
              Upgrade to Presence
            </button>
            <button
              onClick={handleHangUp}
              className="w-full py-3 px-4 rounded-xl font-medium text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              Maybe later
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Standard Voice Call Screen
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-zinc-950/95 backdrop-blur-xl px-6 py-12 text-white">
      {/* Top Header / Status & Timer */}
      <div className="flex flex-col items-center gap-2 pt-8">
        <h2 className="text-xl font-semibold tracking-tight text-zinc-100">
          Talkio Live Voice
        </h2>
        <p className="text-sm text-zinc-400 font-medium">{getStatusLabel()}</p>
        {status === "connected" && !error && (
          <span className="text-xs font-mono text-zinc-500 mt-1">
            {formatTime(callDuration)}
          </span>
        )}
      </div>

      {/* Center Animated Orb */}
      <div className="relative flex items-center justify-center my-auto">
        {/* Outer pulse ring for speaking */}
        {isSpeaking && (
          <div className="absolute h-56 w-56 rounded-full bg-emerald-500/20 animate-ping duration-1000" />
        )}

        {/* Listening subtle pulse */}
        {status === "connected" && !isSpeaking && !isMuted && (
          <div className="absolute h-48 w-48 rounded-full bg-indigo-500/10 animate-pulse duration-700" />
        )}

        {/* Main Central Orb */}
        <div
          className={`h-40 w-40 rounded-full flex items-center justify-center transition-all duration-500 shadow-2xl ${
            error
              ? "bg-red-500/20 border border-red-500/40 text-red-400"
              : status === "connecting" || status === "authenticating"
              ? "bg-indigo-600/30 border border-indigo-400/30 animate-pulse text-indigo-300"
              : isSpeaking
              ? "bg-gradient-to-tr from-emerald-600 to-teal-400 shadow-emerald-500/40 scale-105"
              : isMuted
              ? "bg-zinc-800 border border-zinc-700 text-zinc-500"
              : "bg-gradient-to-tr from-indigo-600 to-violet-500 shadow-indigo-500/30"
          }`}
        >
          {error ? (
            <svg
              className="w-12 h-12"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          ) : (
            <svg
              className="w-14 h-14 text-white/90"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 003-3V5a3 3 0 10-6 0v6a3 3 0 003 3z"
              />
            </svg>
          )}
        </div>
      </div>

      {/* General Error Banner (only for non-upgrade errors) */}
      {error && !isUpgradeRequired && (
        <div className="mb-4 max-w-sm rounded-lg bg-red-950/50 border border-red-800/60 p-3 text-center text-xs text-red-200">
          {error}
        </div>
      )}

      {/* Bottom Controls */}
      <div className="flex items-center gap-6 pb-6">
        {/* Mute Button */}
        <button
          onClick={toggleMute}
          disabled={status !== "connected"}
          aria-label={isMuted ? "Unmute microphone" : "Mute microphone"}
          className={`flex h-14 w-14 items-center justify-center rounded-full border transition-all ${
            isMuted
              ? "bg-amber-500/20 border-amber-500/40 text-amber-300"
              : "bg-zinc-800/80 border-zinc-700 hover:bg-zinc-700/80 text-zinc-300"
          } ${status !== "connected" ? "opacity-40 cursor-not-allowed" : ""}`}
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
                strokeWidth={1.5}
                d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
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
                strokeWidth={1.5}
                d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 003-3V5a3 3 0 10-6 0v6a3 3 0 003 3z"
              />
            </svg>
          )}
        </button>

        {/* End Call Button */}
        <button
          onClick={handleHangUp}
          aria-label="Hang up call"
          className="flex h-16 w-16 items-center justify-center rounded-full bg-red-600 hover:bg-red-500 shadow-lg shadow-red-600/30 transition-all active:scale-95 text-white"
        >
          <svg
            className="w-7 h-7 transform rotate-[135deg]"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M6.62 10.79a15.053 15.053 0 006.59 6.59l2.2-2.2a1 1 0 011.11-.21c1.12.45 2.33.69 3.58.69a1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1c0 1.25.24 2.46.69 3.58a1 1 0 01-.21 1.11l-2.36 2.1z" />
          </svg>
        </button>
      </div>
    </div>
  );
};