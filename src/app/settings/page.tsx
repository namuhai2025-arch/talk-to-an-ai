"use client";

import { useEffect, useState } from "react";
import { Share } from "@capacitor/share";
import { getTalkioCustomerInfo } from "@/lib/revenuecat";

export default function SettingsPage() {
  const [planName, setPlanName] = useState("Free Plan");

  useEffect(() => {
    async function loadPlan() {
      try {
        const result = await getTalkioCustomerInfo();
        const active = result.customerInfo.entitlements.active;

        if (active["presence"]) {
          setPlanName("Talkio Presence");
        } else if (active["Talkio Companion"]) {
          setPlanName("Talkio Companion");
        } else {
          setPlanName("Free Plan");
        }
      } catch (err) {
        console.log(err);
      }
    }

    loadPlan();
  }, []);

  const isFree = planName === "Free Plan";
  const isCompanion = planName === "Talkio Companion";
  const isPresence = planName === "Talkio Presence";

  const planSubtitle = isPresence
    ? "Highest plan active"
    : isCompanion
      ? "Companion is active"
      : "Upgrade to unlock unlimited conversations";

  const planDescription = isPresence
    ? "Your Presence subscription is active. Voice, continuity, and deeper Talkio access are unlocked."
    : isCompanion
      ? "Your Companion subscription is active. You can upgrade to Presence for voice and deeper continuity."
      : "Use Talkio freely until your daily limit. Upgrade anytime when you want to keep chatting.";

  return (
    <main className="min-h-screen bg-stone-50 px-5 pb-6 pt-[calc(env(safe-area-inset-top)+3.5rem)]">
      <div className="mx-auto max-w-md">
        <button
          type="button"
          onClick={() => (window.location.href = "/")}
          className="mb-6 text-sm text-stone-500 hover:text-stone-800"
        >
          ← Back to Talkio
        </button>

        <h1 className="text-3xl font-semibold tracking-tight text-stone-900">
          Settings
        </h1>

        <p className="mt-1 text-sm text-stone-500">
          Control your account and conversation experience.
        </p>

        <section className="mt-8 rounded-3xl bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-emerald-600">
            Plan
          </p>

          <div className="mt-2 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-stone-900">
              {planName}
            </h2>

            <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs text-emerald-700">
              Current
            </span>
          </div>

          <p className="mt-1 text-sm font-medium text-emerald-600">
            {planSubtitle}
          </p>

          <p className="mt-2 text-sm leading-6 text-stone-500">
            {planDescription}
          </p>

          {(isFree || isCompanion) && (
            <button
              type="button"
              onClick={() => (window.location.href = "/paywall")}
              className="mt-5 w-full rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-white shadow-md transition-all hover:bg-emerald-600 hover:shadow-lg"
            >
              {isCompanion
                ? "Upgrade to Talkio Presence"
                : "Upgrade to Talkio Companion"}
            </button>
          )}

          {isPresence && (
            <div className="mt-5 rounded-2xl bg-emerald-100 px-4 py-3 text-center text-sm font-semibold text-emerald-700">
              Current Highest Plan
            </div>
          )}
        </section>

        <section className="mt-6 overflow-hidden rounded-3xl bg-white shadow-sm">
          <button
            type="button"
            onClick={() => {
              localStorage.setItem("openNicknamePrompt", "true");
              window.location.href = "/";
            }}
            className="flex w-full items-center justify-between px-5 py-4 text-left transition hover:bg-stone-50"
          >
            <div>
              <p className="font-medium text-stone-900">Nickname</p>
              <p className="mt-1 text-sm text-stone-500">
                Personalize how Talkio addresses you.
              </p>
            </div>
            <span className="text-stone-400">›</span>
          </button>

          <div className="mx-5 border-t border-stone-100" />

          <button
            type="button"
            onClick={() => (window.location.href = "/settings/account")}
            className="flex w-full items-center justify-between px-5 py-4 text-left transition hover:bg-stone-50"
          >
            <div>
              <p className="font-medium text-stone-900">Account</p>
              <p className="mt-1 text-sm text-stone-500">
                Sign in, sign out, or delete account data.
              </p>
            </div>
            <span className="text-stone-400">›</span>
          </button>
        </section>

        <section className="mt-6 overflow-hidden rounded-3xl bg-white shadow-sm">
          <button
            type="button"
            onClick={async () => {
              try {
                await Share.share({
                  title: "Talkio",
                  text: "A calm AI space to think, breathe, and talk things through.",
                  url: "https://talkiochat.com",
                  dialogTitle: "Share Talkio",
                });
              } catch (err) {
                console.log(err);
              }
            }}
            className="flex w-full items-center justify-between px-5 py-4 text-left transition hover:bg-stone-50"
          >
            <div>
              <p className="font-medium text-stone-900">Share Talkio</p>
              <p className="mt-1 text-sm text-stone-500">
                Send Talkio to someone who could use a calm space to talk.
              </p>
            </div>

            <span className="text-stone-400">↗</span>
          </button>
        </section>

        <p className="mt-8 text-center text-xs leading-5 text-stone-400">
          Talkio is an AI conversation tool, not emergency or medical care.
        </p>
      </div>
    </main>
  );
}