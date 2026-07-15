"use client";

import { useEffect, useState } from "react";
import {
  getIdTokenResult,
  onAuthStateChanged,
  type User,
} from "firebase/auth";

import { getFirebaseAuth } from "@/lib/firebase";

import {
  configureRevenueCat,
  getTalkioOfferings,
  purchaseTalkioPackage,
  restoreTalkioPurchases,
} from "@/lib/revenuecat";

type TalkioPlan = "companion";
type BillingCycle = "monthly" | "yearly";

type FirebaseAuthError = {
  code?: string;
  message?: string;
};

const TALKIO_VERIFICATION_ENDPOINT =
  "https://sendtalkioverificationemail-ndury54xsq-uc.a.run.app";

function readFirebaseError(error: unknown): FirebaseAuthError {
  if (!error || typeof error !== "object") {
    return {};
  }

  return error as FirebaseAuthError;
}

type VerificationEmailResponse = {
  ok?: boolean;
  sent?: boolean;
  alreadyVerified?: boolean;
  email?: string;
  error?: string;
  retryAfterSeconds?: number;
};

async function requestTalkioVerificationEmail(
  user: User
): Promise<VerificationEmailResponse> {
  const idToken = await user.getIdToken(true);

  const response = await fetch(TALKIO_VERIFICATION_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });

  const data =
    (await response.json().catch(() => ({}))) as VerificationEmailResponse;

  if (!response.ok) {
    const error = new Error(
      data.error || "Unable to send verification email."
    ) as Error & {
      status?: number;
      retryAfterSeconds?: number;
    };

    error.status = response.status;
    error.retryAfterSeconds = data.retryAfterSeconds;

    throw error;
  }

  return data;
}

/**
 * Determines how the current Firebase session was authenticated.
 *
 * The ID token's sign_in_provider claim is the strongest signal.
 * providerData is retained as a fallback for older or unusual sessions.
 */
async function getSignInProvider(user: User): Promise<string | null> {
  try {
    const tokenResult = await getIdTokenResult(user, true);

    const providerFromToken =
      typeof tokenResult.signInProvider === "string"
        ? tokenResult.signInProvider
        : null;

    if (providerFromToken) {
      return providerFromToken;
    }
  } catch (error) {
    console.warn(
      "Could not read Firebase sign-in provider from the ID token:",
      error
    );
  }

  const providerFromProfile =
    user.providerData.find(
      (provider) =>
        provider.providerId === "password" ||
        provider.providerId === "google.com" ||
        provider.providerId === "apple.com"
    )?.providerId ?? null;

  return providerFromProfile;
}

export default function PaywallPage() {
  const [showSuccess, setShowSuccess] = useState(false);
  const [purchasing, setPurchasing] = useState(false);

  useEffect(() => {
    const auth = getFirebaseAuth();

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user || user.isAnonymous) {
        return;
      }

      try {
        await configureRevenueCat(user.uid);
      } catch (error) {
        console.error(
          "RevenueCat configuration failed on the paywall:",
          error
        );
      }
    });

    return unsubscribe;
  }, []);

  /**
   * Blocks billing for unverified email/password accounts.
   *
   * Google and Apple accounts are allowed immediately because their identity
   * has already been authenticated by the provider.
   */
  const requireVerifiedEmailForBilling =
    async (): Promise<boolean> => {
      const auth = getFirebaseAuth();
      const currentUser = auth.currentUser;

      if (!currentUser || currentUser.isAnonymous) {
        alert("Please sign in from the Welcome screen first.");
        window.location.href = "/";
        return false;
      }

      try {
        await currentUser.reload();
      } catch (error) {
        console.error("Could not refresh the Firebase user:", error);

        alert(
          "We could not check your account right now. Please check your connection and try again."
        );

        return false;
      }

      const refreshedUser = auth.currentUser;

      if (!refreshedUser || refreshedUser.isAnonymous) {
        alert(
          "Your sign-in session could not be found. Please sign in again."
        );

        window.location.href = "/";
        return false;
      }

      const signInProvider = await getSignInProvider(refreshedUser);

      console.log("Talkio billing identity check", {
        uid: refreshedUser.uid,
        email: refreshedUser.email,
        emailVerified: refreshedUser.emailVerified,
        signInProvider,
        providerData: refreshedUser.providerData.map(
          (provider) => provider.providerId
        ),
      });

      const usesEmailAndPassword =
        signInProvider === "password" ||
        refreshedUser.providerData.some(
          (provider) => provider.providerId === "password"
        );

      /**
       * Google and Apple continue immediately.
       *
       * A verified email/password account also continues.
       */
      if (!usesEmailAndPassword || refreshedUser.emailVerified) {
        return true;
      }
      
  try {
  const result =
    await requestTalkioVerificationEmail(refreshedUser);

  if (result.alreadyVerified) {
    await refreshedUser.reload();

    if (getFirebaseAuth().currentUser?.emailVerified) {
      return true;
    }
  }

  alert(
    [
      "Verify your email before subscribing.",
      "",
      "We sent a Talkio verification email to:",
      result.email ??
        refreshedUser.email ??
        "your email address",
      "",
      "Open the email and tap Verify Email.",
      "",
      "After verifying, return to Talkio and choose Companion again.",
      "",
      "Please also check Spam or Promotions.",
    ].join("\n")
  );
} catch (error: any) {
  console.error(error);

  if (error.status === 429) {
    alert(
      [
        "A verification email was recently requested.",
        "",
        "Please check your inbox first.",
      ].join("\n")
    );
  } else if (error.status === 401) {
    alert("Please sign in again.");
    window.location.href = "/";
  } else {
    alert(
      error.message ??
        "Unable to send the verification email."
    );
  }
}

return false;

};

  const selectPlan = async (
    plan: TalkioPlan,
    billingCycle: BillingCycle
  ) => {
    if (purchasing) {
      return;
    }

    setPurchasing(true);

    try {
      /**
       * Nothing related to RevenueCat or Google Play runs until this returns
       * true.
       */
      const canContinue =
        await requireVerifiedEmailForBilling();

      if (!canContinue) {
        return;
      }

      const auth = getFirebaseAuth();
      const user = auth.currentUser;

      if (!user || user.isAnonymous) {
        return;
      }

      await configureRevenueCat(user.uid);

      const offerings = await getTalkioOfferings();

      if (!offerings?.current) {
        alert(
          "Subscriptions are not available yet. Please try again later."
        );
        return;
      }

      const currentOffering = offerings.current;

      const packageToPurchase =
        currentOffering.availablePackages.find((pkg) => {
          const identifier = pkg.identifier.toLowerCase();
          const productId =
            pkg.product.identifier.toLowerCase();

          const matchesPlan =
            identifier.includes(plan) ||
            productId.includes(plan);

          const matchesBillingCycle =
            identifier.includes(billingCycle) ||
            productId.includes(billingCycle);

          return matchesPlan && matchesBillingCycle;
        });

      if (!packageToPurchase) {
        alert(
          "This subscription option is not available yet."
        );
        return;
      }

      console.log("RevenueCat purchase starting", {
        uid: user.uid,
        offering: currentOffering.identifier,
        packageIdentifier: packageToPurchase.identifier,
        productIdentifier:
          packageToPurchase.product.identifier,
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
    } catch (error: unknown) {
      const purchaseError =
        error && typeof error === "object"
          ? (error as {
              code?: string | number;
              message?: string;
              userCancelled?: boolean;
            })
          : {};

      console.error("Purchase failed:", error);

      if (purchaseError.userCancelled) {
        return;
      }

      alert(
        [
          "Purchase failed.",
          "",
          `Code: ${purchaseError.code ?? "none"}`,
          `Message: ${
            purchaseError.message ?? JSON.stringify(error)
          }`,
        ].join("\n")
      );
    } finally {
      setPurchasing(false);
    }
  };

  const restorePurchases = async () => {
    if (purchasing) {
      return;
    }

    setPurchasing(true);

    try {
      /**
       * Restore is also a billing/account-ownership action, so email/password
       * users must verify before restoring.
       */
      const canContinue =
        await requireVerifiedEmailForBilling();

      if (!canContinue) {
        return;
      }

      const auth = getFirebaseAuth();
      const user = auth.currentUser;

      if (!user || user.isAnonymous) {
        return;
      }

      await configureRevenueCat(user.uid);

      const result = await restoreTalkioPurchases();

      const active =
        result.customerInfo.entitlements.active ?? {};

      const activeSubscriptions =
        result.customerInfo.activeSubscriptions ?? [];

      const hasCompanion =
        Boolean(active["Talkio Companion"]) ||
        Boolean(active.companion) ||
        activeSubscriptions.includes(
          "talkio_companion_monthly"
        );

      if (hasCompanion) {
        localStorage.setItem(
          "talkio_cached_plan",
          "Talkio Companion"
        );

        setShowSuccess(true);
        return;
      }

      alert("No active subscription was found to restore.");
    } catch (error: unknown) {
      const restoreError =
        error && typeof error === "object"
          ? (error as { message?: string })
          : {};

      console.error("Restore purchases failed:", error);

      alert(
        [
          "Restore failed.",
          "",
          `Message: ${
            restoreError.message ?? JSON.stringify(error)
          }`,
        ].join("\n")
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
              Your subscription is active and ready to use.
              Thank you for supporting Talkio.
            </p>

            <button
              type="button"
              onClick={() => {
                window.location.replace("/");
              }}
              className="mt-6 h-14 w-full rounded-full bg-[#10C67A] font-semibold text-white"
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
            if (purchasing) {
              return;
            }

            window.location.href = "/";
          }}
          className={`relative z-50 mb-8 text-sm ${
            purchasing
              ? "cursor-not-allowed text-stone-400 opacity-50"
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
            Start free. Vent, reflect, and feel lighter.
            Upgrade only when you want deeper access.
          </p>
        </section>

        <section className="mx-auto mt-14 grid max-w-3xl gap-5 md:grid-cols-2">
          <button
            type="button"
            disabled={purchasing}
            onClick={() => {
              if (purchasing) {
                return;
              }

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
            onClick={() =>
              selectPlan("companion", "monthly")
            }
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

                <p className="mt-4 max-w-[95%] whitespace-pre-line text-[15px] leading-[1.35] text-stone-600">
                  {"Unlimited conversations.\nLong-term memory and continuity.\nAlways there when you need it."}
                </p>
              </div>

              <div className="mt-7 flex h-14 w-full items-center justify-center rounded-full bg-[#10C67A] px-4 text-[16px] font-semibold tracking-[-0.01em] text-white shadow-[0_10px_25px_rgba(16,198,122,0.22)] transition-all hover:bg-[#0FBF74] hover:shadow-md">
                {purchasing
                  ? "Checking your account…"
                  : "Talkio Companion"}
              </div>
            </div>
          </button>
        </section>

        <div className="mt-6 text-center">
          <button
            type="button"
            disabled={purchasing}
            onClick={restorePurchases}
            className={`text-sm font-medium underline underline-offset-4 ${
              purchasing
                ? "cursor-not-allowed opacity-50"
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
            Upgrade only if you want deeper conversations and
            continuity.
            <br />
            <br />
            Talkio Companion Monthly: $4.99/month.
            <br />
            Auto-renewable subscription.
            <br />
            Cancel anytime through your Apple or Google account
            settings.
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