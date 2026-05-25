"use client";

import {
  GoogleAuthProvider,
  linkWithRedirect,
  signInWithRedirect,
  getRedirectResult,
} from "firebase/auth";

import { getFirebaseAuth } from "@/lib/firebase";

export default function PaywallPage() {
  const connectGoogleIfNeeded = async () => {
    const auth = getFirebaseAuth();
    const provider = new GoogleAuthProvider();

    if (auth.currentUser && !auth.currentUser.isAnonymous) return;

    if (auth.currentUser && auth.currentUser.isAnonymous) {
      try {
        await linkWithRedirect(auth.currentUser, provider);
        return;
      } catch (error: any) {
        if (error?.code === "auth/credential-already-in-use") {
  await signInWithRedirect(auth, provider);
  return;
}

        throw error;
      }
    }

    await signInWithRedirect(auth, provider);
  };

  const selectPlan = async (plan: "monthly" | "yearly") => {
    try {
      await connectGoogleIfNeeded();
      window.location.href = `/checkout?plan=${plan}`;
    } catch (error: any) {
      console.error("Upgrade sign-in failed:", error);
      alert("Google sign in failed. Please try again.");
    }
  };

  return (
      <main className="min-h-screen bg-gradient-to-b from-[#f4fbf7] via-white to-[#f7faf8] px-5 py-6 text-stone-900">
      <div className="mx-auto max-w-5xl pt-2">
        <button
          type="button"
          onClick={() => (window.location.href = "/")}
          className="relative z-50 mb-8 text-sm text-stone-500 hover:text-stone-800"
        >
          ← Back to chat
        </button>

        <section className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-600">
            Talkio Pro
          </p>

          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-stone-950 md:text-[58px]">
            Keep the conversation going.
          </h1>

          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-stone-700">
            Continue your conversations, reflections, and emotional check-ins
            anytime — with more room for real, meaningful conversations.
          </p>
        </section>

        <section className="mx-auto mt-14 grid max-w-4xl gap-5 md:grid-cols-2">
          <button            
  onClick={() => selectPlan("monthly")}
  className="rounded-[30px] border border-stone-200 bg-white/80 backdrop-blur-xl p-6 text-left shadow-[0_10px_40px_rgba(0,0,0,0.06)] transition duration-200 hover:-translate-y-0.5 hover:scale-[1.01] hover:shadow-md"
>
  <div className="flex h-full min-h-[280px] flex-col justify-between">
    
    <div>
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-600">
          Monthly
        </p>

        <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
          Flexible
        </span>
      </div>

      <h2 className="mt-4 text-4xl font-semibold tracking-tight text-stone-950">
        $4.99
        <span className="ml-1 text-base font-normal text-stone-500">
          /month
        </span>
      </h2>

      <p className="mt-4 text-sm leading-6 text-stone-600">
        Flexible access when you want more space to talk.
      </p>
    </div>

    <div className="mt-10 flex h-16 w-full items-center justify-center rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 text-base font-semibold text-white shadow-[0_12px_30px_rgba(16,185,129,0.22)] transition duration-200 hover:scale-[1.01] hover:shadow-[0_16px_40px_rgba(16,185,129,0.30)]">
  Start Monthly
</div>
  </div>
</button>

          <button
  onClick={() => selectPlan("yearly")}
  className="relative rounded-[30px] border-2 border-emerald-500 bg-white p-6 text-left shadow-[0_15px_50px_rgba(16,185,129,0.16)] transition duration-200 hover:-translate-y-0.5 hover:scale-[1.01]"
>
  <div className="flex h-full min-h-[280px] flex-col justify-between">

    <div>
      <div className="absolute right-5 top-5 rounded-full bg-emerald-600 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white">
        Best value · Save 33%
      </div>

      <p className="text-sm font-semibold uppercase tracking-wide text-emerald-600">
        Yearly
      </p>

      <h2 className="mt-4 text-4xl font-semibold tracking-tight text-stone-950">
        $39.99
        <span className="ml-1 text-base font-normal text-stone-500">
          /year
        </span>
      </h2>

      <p className="mt-4 text-sm leading-6 text-stone-600">
        More affordable long-term for daily emotional support.
      </p>
    </div>

    <div className="mt-10 flex h-16 w-full items-center justify-center rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 text-base font-semibold text-white shadow-[0_12px_30px_rgba(16,185,129,0.22)] transition duration-200 hover:scale-[1.01] hover:shadow-[0_16px_40px_rgba(16,185,129,0.30)]">
  Start Yearly
</div>
  </div>
</button>
        </section>

        <section className="mx-auto mt-8 max-w-4xl rounded-[28px] border border-white/60 bg-white/80 p-6 shadow-[0_10px_40px_rgba(0,0,0,0.06)] backdrop-blur-xl">
          <p className="text-sm font-semibold text-stone-900">
            What Pro unlocks
          </p>

          <div className="mt-4 grid gap-3 text-sm text-stone-700 md:grid-cols-2">
            {[
              "Much higher daily message limit",
              "Longer, more natural replies",
              "Enhanced emotional depth",
              "Better memory continuity",
              "Smart scheduled check-ins",
              "Calm guidance during difficult moments",
              "Priority access during traffic",
              "Early access to future features",
            ].map((feature) => (
              <div key={feature} className="flex gap-2">
                <span className="text-emerald-600">✓</span>
                <span>{feature}</span>
              </div>
            ))}
          </div>
        </section>

        <p className="mt-14 text-center text-sm leading-relaxed text-stone-500">
          Your conversations stay private.
          <br />
          Google sign-in is only used to secure and restore your subscription.
        </p>
      </div>
    </main>
  );
}