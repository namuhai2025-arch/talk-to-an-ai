"use client";

import { GoogleAuthProvider, linkWithPopup, signInWithPopup } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase";

export default function PaywallPage() {
  const connectGoogleIfNeeded = async () => {
    const auth = getFirebaseAuth();
    const provider = new GoogleAuthProvider();

    if (auth.currentUser && !auth.currentUser.isAnonymous) {
      return;
    }

    if (auth.currentUser && auth.currentUser.isAnonymous) {
      try {
        await linkWithPopup(auth.currentUser, provider);
        return;
      } catch (error: any) {
        if (error?.code === "auth/credential-already-in-use") {
          await signInWithPopup(auth, provider);
          return;
        }

        throw error;
      }
    }

    await signInWithPopup(auth, provider);
  };

  const selectPlan = async (plan: "monthly" | "yearly") => {
    try {
      await connectGoogleIfNeeded();

      // Temporary checkout placeholder.
      // Later this becomes your Stripe / RevenueCat checkout URL.
      window.location.href = `/checkout?plan=${plan}`;
    } catch (error: any) {
      console.error("Upgrade sign-in failed:", error);
      alert(`Google sign-in failed: ${error?.code || "unknown"}`);
    }
  };

  return (
    <main style={{ padding: 24, maxWidth: 520, margin: "0 auto" }}>
      <button onClick={() => (window.location.href = "/")}>← Back to chat</button>

      <h2 style={{ marginTop: 28 }}>Continue with Talkio Paid</h2>

      <p style={{ color: "#666", lineHeight: 1.5 }}>
        You can use Talkio Free without signing in. To continue beyond the free
        limit, connect your Google email and choose a paid plan.
      </p>

      <section style={{ marginTop: 28, display: "grid", gap: 12 }}>
        <button
          onClick={() => selectPlan("monthly")}
          style={{ padding: 14, width: "100%" }}
        >
          Monthly Plan
        </button>

        <button
          onClick={() => selectPlan("yearly")}
          style={{ padding: 14, width: "100%" }}
        >
          Yearly Plan
        </button>
      </section>

      <p style={{ marginTop: 20, fontSize: 13, color: "#777" }}>
        Google is only required when you choose a paid plan, so your subscription
        can be secured and restored.
      </p>
    </main>
  );
}