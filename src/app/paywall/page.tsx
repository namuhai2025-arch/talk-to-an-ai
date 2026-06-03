"use client";

import {
  getTalkioOfferings,
  purchaseTalkioPackage,
} from "@/lib/revenuecat";

type TalkioPlan = "companion" | "presence" | "professionals";
type BillingCycle = "monthly" | "yearly";

export default function PaywallPage() {
  const selectPlan = async (
    plan: TalkioPlan,
    billingCycle: BillingCycle
  ) => {
    try {
      const offerings = await getTalkioOfferings();
      const currentOffering = offerings.current;

      if (!currentOffering) {
        alert("Subscriptions are not available yet. Please try again later.");
        return;
      }

      const packageToPurchase = currentOffering.availablePackages.find((pkg) => {
        const identifier = pkg.identifier.toLowerCase();
        const productId = pkg.product.identifier.toLowerCase();

        return (
          (identifier.includes(plan) || productId.includes(plan)) &&
          (identifier.includes(billingCycle) || productId.includes(billingCycle))
        );
      });

      if (!packageToPurchase) {
        alert("This subscription option is not available yet.");
        return;
      }

      const purchaseResult = await purchaseTalkioPackage(packageToPurchase);

      if (purchaseResult.customerInfo) {
        alert("Subscription activated. Thank you for supporting Talkio.");
        window.location.href = "/";
      }
    } catch (error: any) {
      console.error("Purchase failed:", error);

      if (error?.userCancelled) return;

      alert("Purchase could not be completed. Please try again.");
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
            Talkio Plans
          </p>

          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-stone-950 md:text-[58px]">
            Stay connected to your Talkio experience.
          </h1>

          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-stone-700">
            Choose the level of presence that fits how you want to talk, reflect,
            and continue with Talkio.
          </p>
        </section>

        <section className="mx-auto mt-14 grid max-w-4xl gap-5 md:grid-cols-2">
          <button
            type="button"
            onClick={() => selectPlan("companion", "monthly")}
            className="rounded-[30px] border border-stone-200 bg-white/80 p-6 text-left shadow-[0_10px_40px_rgba(0,0,0,0.06)] backdrop-blur-xl transition duration-200 hover:-translate-y-0.5 hover:scale-[1.01] hover:shadow-md"
          >
            <div className="flex h-full min-h-[280px] flex-col justify-between">
              <div>
                <div className="flex items-start justify-between gap-4">
                  <p className="text-sm font-semibold uppercase tracking-wide text-emerald-600">
                    Companion
                  </p>

                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                    Monthly
                  </span>
                </div>

                <h2 className="mt-4 text-4xl font-semibold tracking-tight text-stone-950">
                  $4.99
                  <span className="ml-1 text-base font-normal text-stone-500">
                    /month
                  </span>
                </h2>

                <p className="mt-4 text-sm leading-6 text-stone-600">
                  A calm daily Talkio companion with deeper conversations,
                  continuity, and emotional support.
                </p>
              </div>

              <div className="mt-10 flex h-16 w-full items-center justify-center rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 text-base font-semibold text-white shadow-[0_12px_30px_rgba(16,185,129,0.22)]">
                Continue with Companion
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => selectPlan("presence", "monthly")}
            className="relative rounded-[30px] border-2 border-emerald-500 bg-white p-6 text-left shadow-[0_15px_50px_rgba(16,185,129,0.16)] transition duration-200 hover:-translate-y-0.5 hover:scale-[1.01]"
          >
            <div className="flex h-full min-h-[280px] flex-col justify-between">
              <div>
                <div className="absolute right-5 top-5 rounded-full bg-emerald-600 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white">
                  Most immersive
                </div>

                <p className="text-sm font-semibold uppercase tracking-wide text-emerald-600">
                  Presence
                </p>

                <h2 className="mt-4 text-4xl font-semibold tracking-tight text-stone-950">
                  $9.99
                  <span className="ml-1 text-base font-normal text-stone-500">
                    /month
                  </span>
                </h2>

                <p className="mt-4 text-sm leading-6 text-stone-600">
                  A deeper Talkio experience with voice, richer continuity, and
                  more immersive support.
                </p>
              </div>

              <div className="mt-10 flex h-16 w-full items-center justify-center rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 text-base font-semibold text-white shadow-[0_12px_30px_rgba(16,185,129,0.22)]">
                Continue with Presence
              </div>
            </div>
          </button>
        </section>

        <section className="mx-auto mt-5 max-w-4xl rounded-[28px] border border-stone-200 bg-white/70 p-5 text-center shadow-sm backdrop-blur-xl">
          <p className="text-sm font-semibold text-stone-900">Professionals</p>

          <p className="mt-2 text-sm leading-6 text-stone-600">
            A strategic Talkio experience designed for leaders, creators,
            founders, and high-performance professionals.
          </p>

          <p className="mt-3 text-sm font-medium text-emerald-600">
            Coming soon
          </p>
        </section>

        <section className="mx-auto mt-8 max-w-4xl rounded-[28px] border border-white/60 bg-white/80 p-6 shadow-[0_10px_40px_rgba(0,0,0,0.06)] backdrop-blur-xl">
          <p className="text-sm font-semibold text-stone-900">
            What Talkio unlocks
          </p>

          <div className="mt-4 grid gap-3 text-sm text-stone-700 md:grid-cols-2">
            {[
              "Deeper and longer conversations",
              "Enhanced memory continuity",
              "More emotionally aware replies",
              "Voice conversations in Presence",
              "Personalized emotional check-ins",
              "Priority access during high traffic",
              "More natural reflective conversations",
              "Early access to future Talkio experiences",
            ].map((feature) => (
              <div key={feature} className="flex gap-2">
                <span className="text-emerald-600">✓</span>
                <span>{feature}</span>
              </div>
            ))}
          </div>
        </section>

        <div className="mt-14 text-center text-sm leading-relaxed text-stone-500">
          <p>
            Your conversations stay private.
            <br />
            Sign-in is only used to secure and restore your subscription.
          </p>

          <div className="mt-4 flex items-center justify-center gap-4">
            <a
              href="/terms"
              className="font-medium text-emerald-700 underline underline-offset-4"
            >
              Terms of Use
            </a>

            <span className="text-stone-300">•</span>

            <a
              href="/privacy"
              className="font-medium text-emerald-700 underline underline-offset-4"
            >
              Privacy Policy
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}