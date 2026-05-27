"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

type TalkioPlan = "companion" | "presence" | "professionals" | "elite";
type BillingCycle = "monthly" | "yearly";

const PLAN_COPY = {
  companion: {
    label: "Companion",
    monthly: "$4.99/month",
    yearly: "Yearly coming soon",
    description:
      "A calm daily Talkio companion with deeper conversations, continuity, and emotional support.",
  },
  presence: {
    label: "Presence",
    monthly: "$9.99/month",
    yearly: "Yearly coming soon",
    description:
      "A deeper Talkio experience with voice, richer continuity, and more immersive support.",
  },
  professionals: {
    label: "Professionals",
    monthly: "$49.99/month",
    yearly: "Yearly coming soon",
    description:
      "A strategic Talkio experience designed for leaders, founders, creators, and high-performance professionals.",
  },
  elite: {
    label: "Elite",
    monthly: "Coming later",
    yearly: "Coming later",
    description:
      "The highest-level Talkio experience, planned for future release.",
  },
};

function CheckoutContent() {
  const searchParams = useSearchParams();

  const rawPlan = searchParams.get("plan") || "companion";
  const rawBillingCycle = searchParams.get("billingCycle") || "monthly";

  const plan: TalkioPlan =
    rawPlan in PLAN_COPY ? (rawPlan as TalkioPlan) : "companion";

  const billingCycle: BillingCycle =
    rawBillingCycle === "yearly" ? "yearly" : "monthly";

  const selected = PLAN_COPY[plan];
  const price = selected[billingCycle];

  return (
    <main className="min-h-screen bg-stone-50 px-5 py-6 text-stone-900">
      <div className="mx-auto max-w-md">
        <button
          type="button"
          onClick={() => (window.location.href = "/paywall")}
          className="mb-8 text-sm text-stone-500 hover:text-stone-800"
        >
          ← Back
        </button>

        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-600">
          Talkio Checkout
        </p>

        <h1 className="mt-3 text-4xl font-semibold tracking-tight">
          Review your plan
        </h1>

        <p className="mt-3 text-sm leading-6 text-stone-600">
          This is a temporary checkout screen while Apple In-App Purchase and
          Google Play Billing are being connected.
        </p>

        <section className="mt-8 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5">
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-600">
            {selected.label}
          </p>

          <h2 className="mt-4 text-4xl font-semibold tracking-tight">
            {price}
          </h2>

          <p className="mt-4 text-sm leading-6 text-stone-600">
            {selected.description}
          </p>

          <button
            type="button"
            onClick={() => {
              alert("Apple In-App Purchase / Google Play Billing comes next.");
            }}
            className="mt-8 h-14 w-full rounded-full bg-stone-950 text-base font-semibold text-white transition hover:bg-stone-800"
          >
            Continue to Payment
          </button>
        </section>
      </div>
    </main>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={<main className="p-6">Loading checkout...</main>}>
      <CheckoutContent />
    </Suspense>
  );
}