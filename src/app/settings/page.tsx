"use client";

import { useEffect, useState } from "react";
import { Share } from "@capacitor/share";
import {
  configureRevenueCat,
  getTalkioCustomerInfo,
} from "@/lib/revenuecat";
import { onAuthStateChanged } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase";

export default function SettingsPage() {
  // 1. Synchronously initialize from cache to prevent the Free Plan flicker
  const [planName, setPlanName] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("talkio_cached_plan") || "Free Plan";
    }
    return "Free Plan";
  });

  const [isLoadingPlan, setIsLoadingPlan] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return !localStorage.getItem("talkio_cached_plan");
    }
    return true;
  });

  useEffect(() => {
    const auth = getFirebaseAuth();

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      try {
        if (!user?.uid || user.isAnonymous) {
          localStorage.removeItem("talkio_cached_plan");
          setPlanName("Free Plan");
          setIsLoadingPlan(false);
          return;
        }

        // Configure RevenueCat with the verified Firebase UID
        await configureRevenueCat(user.uid);

        const result = await getTalkioCustomerInfo();

        if (!result?.customerInfo) {
          localStorage.removeItem("talkio_cached_plan");
          setPlanName("Free Plan");
          setIsLoadingPlan(false);
          return;
        }

        const active = result.customerInfo.entitlements.active || {};
        const activeSubscriptions =
          result.customerInfo.activeSubscriptions || [];

        if (
          active["Talkio Presence"] ||
          active["presence"] ||
          activeSubscriptions.includes("talkio_presence_monthly_v2")
        ) {
          localStorage.setItem("talkio_cached_plan", "Talkio Presence");
          setPlanName("Talkio Presence");
        } else if (
          active["Talkio Companion"] ||
          active["companion"] ||
          activeSubscriptions.includes("talkio_companion_monthly")
        ) {
          localStorage.setItem("talkio_cached_plan", "Talkio Companion");
          setPlanName("Talkio Companion");
        } else {
          localStorage.removeItem("talkio_cached_plan");
          setPlanName("Free Plan");
        }
      } catch (err) {
        console.error("Failed to load plan:", err);
      } finally {
        setIsLoadingPlan(false);
      }
    });

    return () => unsubscribe();
  }, []);

  async function shareTalkio() {
    try {
      await Share.share({
        title: "Talkio",
        text: "A calm AI space to think, breathe, and talk things through.",
        url: "https://talkiochat.com/download",
        dialogTitle: "Share Talkio",
      });
    } catch (err) {
      console.error("Share failed:", err);
    }
  }

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

        {/* Plan Section */}
        <section className="mt-8 rounded-3xl bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-emerald-600">
            Plan
          </p>

          {isLoadingPlan ? (
            <div className="mt-3 animate-pulse space-y-3">
              <div className="h-6 w-36 rounded-lg bg-stone-200" />
              <div className="h-4 w-48 rounded bg-stone-100" />
              <div className="h-10 w-full rounded-2xl bg-stone-100" />
            </div>
          ) : (
            <>
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
            </>
          )}
        </section>

        {/* Settings Options */}
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
                Sign in, switch account, or delete account data.
              </p>
            </div>
            <span className="text-stone-400">›</span>
          </button>

          <div className="mx-5 border-t border-stone-100" />

          <button
            type="button"
            onClick={() => (window.location.href = "/settings/privacy")}
            className="flex w-full items-center justify-between px-5 py-4 text-left transition hover:bg-stone-50"
          >
            <div>
              <p className="font-medium text-stone-900">Privacy Lock</p>
              <p className="mt-1 text-sm text-stone-500">
                Require a PIN before opening Talkio.
              </p>
            </div>
            <span className="text-stone-400">›</span>
          </button>

          <div className="mx-5 border-t border-stone-100" />

          <button
            type="button"
            onClick={() => (window.location.href = "/support")}
            className="flex w-full items-center justify-between px-5 py-4 text-left transition hover:bg-stone-50"
          >
            <div>
              <p className="font-medium text-stone-900">Support</p>
              <p className="mt-1 text-sm text-stone-500">
                Get help, subscriptions, privacy, and contact information.
              </p>
            </div>
            <span className="text-stone-400">›</span>
          </button>
        </section>

        {/* Share Section */}
        <section className="mt-6 overflow-hidden rounded-3xl bg-white shadow-sm">
          <button
            type="button"
            onClick={shareTalkio}
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

        <div className="mt-8 text-center text-sm">
          <a href="/support" className="text-emerald-700 underline">
            Support
          </a>
          <span className="mx-2 text-stone-300">•</span>
          <a href="/privacy" className="text-emerald-700 underline">
            Privacy Policy
          </a>
          <span className="mx-2 text-stone-300">•</span>
          <a href="/terms" className="text-emerald-700 underline">
            Terms of Use
          </a>
        </div>

        <p className="mt-6 text-center text-xs leading-5 text-stone-400">
          Talkio is an AI conversation tool, not emergency or medical care.
        </p>
      </div>
    </main>
  );
}