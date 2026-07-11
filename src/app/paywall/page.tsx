"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase";
import {
  configureRevenueCat,
  getTalkioOfferings,
  purchaseTalkioPackage,
  restoreTalkioPurchases,
} from "@/lib/revenuecat";

type TalkioPlan = "companion";
type BillingCycle = "monthly" | "yearly";

export default function PaywallPage() {
  const [showSuccess, setShowSuccess] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
    
  useEffect(() => {
  const auth = getFirebaseAuth();

  const unsubscribe = onAuthStateChanged(auth, async (user) => {
    if (!user || user.isAnonymous) {
      return;
    }

    await configureRevenueCat(user.uid);
  });

  return () => unsubscribe();
}, []);

  const selectPlan = async (
  plan: TalkioPlan,
  billingCycle: BillingCycle
) => {
  if (purchasing) {
    return;
  }

  const auth = getFirebaseAuth();
  const user = auth.currentUser;

  if (!user || user.isAnonymous) {
    alert("Please sign in from the Welcome screen first.");
    window.location.href = "/";
    return;
  }

  setPurchasing(true);

  try {
    const offerings = await getTalkioOfferings();

    if (!offerings?.current) {
      alert("Subscriptions are not available yet. Please try again later.");
      return;
    }

    const currentOffering = offerings.current;

    const packageToPurchase = currentOffering.availablePackages.find((pkg) => {
      const identifier = pkg.identifier.toLowerCase();
      const productId = pkg.product.identifier.toLowerCase();

      return (
        (identifier.includes(plan) || productId.includes(plan)) &&
        (identifier.includes(billingCycle) ||
          productId.includes(billingCycle))
      );
    });

    if (!packageToPurchase) {
      alert("This subscription option is not available yet.");
      return;
    }

    console.log("RevenueCat purchase starting", {
      offering: currentOffering.identifier,
      packageIdentifier: packageToPurchase.identifier,
      productIdentifier: packageToPurchase.product.identifier,
    });

    const purchaseResult =
      await purchaseTalkioPackage(packageToPurchase);

    if (purchaseResult.customerInfo) {
      localStorage.setItem(
        "talkio_cached_plan",
        "Talkio Companion"
      );

      setShowSuccess(true);
      
    }
  } catch (error: any) {
    console.error("Purchase failed:", error);

    if (error?.userCancelled) {
      return;
    }

    alert(
      `Purchase failed.\n\nCode: ${error?.code || "none"}\nMessage: ${
        error?.message || JSON.stringify(error)
      }`
    );
  } finally {
    setPurchasing(false);
  }
};

  const restorePurchases = async () => {
  if (purchasing) return;

  setPurchasing(true);

  try {
    const auth = getFirebaseAuth();
    const user = auth.currentUser;

    if (!user || user.isAnonymous) {
      alert("Please sign in from the Welcome screen first.");
      window.location.href = "/";
      return;
    }

    const result = await restoreTalkioPurchases();

    const active = result.customerInfo.entitlements.active || {};
    const activeSubscriptions = result.customerInfo.activeSubscriptions || [];

    if (
      active["Talkio Companion"] ||
      active["companion"] ||
      activeSubscriptions.includes("talkio_companion_monthly")
    ) {
      localStorage.setItem("talkio_cached_plan", "Talkio Companion");
      setShowSuccess(true);
return;
    }

    alert("No active subscription found to restore.");
  
    } catch (error: any) {
  console.error("Restore purchases failed:", error);

  alert(
    `Restore failed.\n\nMessage: ${
      error?.message || JSON.stringify(error)
    }`
  );
} finally {
  setPurchasing(false);
}
};

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#f4fbf7] via-white to-[#f7faf8] px-5 py-6 text-stone-900">
      {showSuccess && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/35 px-5 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-[28px] bg-white p-6 text-center shadow-2xl">
            <h2 className="text-2xl font-semibold text-stone-950">
              Welcome to Talkio Companion
            </h2>

            <p className="mt-3 text-sm leading-6 text-stone-600">
              Your subscription is active and ready to use. Thank you for
              supporting Talkio.
            </p>

            <button
  type="button"
  onClick={() => {
    window.location.replace("/");
  }}
  className="mt-6 h-14 w-full rounded-full bg-[#10C67A] text-white font-semibold"
>
  Start Chatting
</button>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-5xl pt-2">
        <button
  type="button"
  disabled={purchasing}
  onClick={() => {
  if (purchasing) return;
  window.location.href = "/";
}}
  className={`relative z-50 mb-8 text-sm ${
    purchasing
      ? "opacity-50 cursor-not-allowed text-stone-400"
      : "text-stone-500 hover:text-stone-800"
  }`}
>
  ← Back to chat
</button>

        <section className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-600">
            Talkio Plans
          </p>

          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-stone-950 md:text-[58px]">
            You don&apos;t have to carry it all.
            <br />
            Let it out.
          </h1>

          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-stone-700">
            Start free. Vent, reflect, and feel lighter. Upgrade only when you
            want deeper access.
          </p>
        </section>

        <section className="mx-auto mt-14 grid max-w-3xl gap-5 md:grid-cols-2">
          <button
  type="button"
  disabled={purchasing}
  onClick={() => {
    if (purchasing) return;
    window.location.href = "/";
  }}
  className={[
    "rounded-[30px] border border-emerald-200 bg-white/90 p-6 text-left",
    "shadow-[0_10px_40px_rgba(0,0,0,0.06)] transition duration-200",
    purchasing
      ? "cursor-not-allowed opacity-60"
      : "hover:-translate-y-0.5 hover:scale-[1.01] hover:shadow-md",
  ].join(" ")}
>
            <div className="flex h-full min-h-[280px] flex-col justify-between">
              <div>
                <div className="flex items-start justify-between gap-4">
                  <p className="text-sm font-semibold uppercase tracking-wide text-emerald-600">
                    Free
                  </p>

                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                    Start Free
                  </span>
                </div>

                <h2 className="mt-4 text-4xl font-semibold tracking-tight text-stone-950">
                  $0
                </h2>

                <div className="mt-4 space-y-2 text-sm text-stone-600">
                  <div>✓ 10 free messages daily</div>
                  <div>✓ Vent without judgment</div>
                  <div>✓ Gain clarity and perspective</div>
                  <div>✓ No payment required</div>
                </div>
              </div>

              <div className="mt-7 flex h-14 w-full items-center justify-center rounded-full bg-[#10C67A] px-4 text-[16px] font-semibold tracking-[-0.01em] text-white shadow-[0_10px_25px_rgba(16,198,122,0.22)] transition-all hover:bg-[#0FBF74] hover:shadow-md">
  Continue Free
</div>
            </div>
          </button>

          <button
  type="button"
  disabled={purchasing}
  onClick={() => selectPlan("companion", "monthly")}
  className={[
    "rounded-[30px] border border-stone-200 bg-white/80 p-6 text-left",
    "shadow-[0_10px_40px_rgba(0,0,0,0.06)] backdrop-blur-xl",
    "transition duration-200",
    purchasing
      ? "cursor-not-allowed opacity-60"
      : "hover:-translate-y-0.5 hover:scale-[1.01] hover:shadow-md",
  ].join(" ")}
>
            <div className="flex h-full min-h-[280px] flex-col justify-between">
              <div>
                <div className="flex items-start justify-between gap-4">
                  <p className="text-sm font-semibold uppercase tracking-wide text-emerald-600">
                    Talkio Companion Monthly
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

                <p className="mt-4 max-w-[95%] text-[15px] leading-[1.35] text-stone-600">
                  Unlimited conversations.
Long-term memory and continuity.
Always there when you need it.
                </p>
              </div>

              <div className="mt-7 flex h-14 w-full items-center justify-center rounded-full bg-[#10C67A] px-4 text-[16px] font-semibold tracking-[-0.01em] text-white shadow-[0_10px_25px_rgba(16,198,122,0.22)] transition-all hover:bg-[#0FBF74] hover:shadow-md">
                {purchasing ? "Opening secure payment…" : "Talkio Companion"}
              </div>
            </div>
          </button>
        </section>

        <div className="mt-6 text-center">
  <button
    disabled={purchasing}
    onClick={restorePurchases}
    className={`text-sm font-medium underline underline-offset-4 ${
      purchasing
        ? "opacity-50 cursor-not-allowed"
        : "text-emerald-700"
    }`}
>
    Restore Purchases
  </button>
</div>
  
        <div className="mt-14 text-center text-sm leading-relaxed text-stone-500">
          <p>
            Free plan available.
            <br />
            Upgrade only if you want deeper conversations and continuity.
            <br />
            <br />
            Talkio Companion Monthly: $4.99/month.
            <br />
            Auto-renewable subscription.
            <br />
            Cancel anytime through your Apple or Google account settings.
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