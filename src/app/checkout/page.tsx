"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

function CheckoutContent() {
  const searchParams = useSearchParams();
  const plan = searchParams.get("plan") || "monthly";

  return (
    <main
      style={{
        maxWidth: 520,
        margin: "0 auto",
        padding: 24,
      }}
    >
      <button onClick={() => (window.location.href = "/paywall")}>
        ← Back
      </button>

      <h1 style={{ marginTop: 24 }}>Talkio Pro Checkout</h1>

      <p style={{ color: "#666", lineHeight: 1.6 }}>
        This is a temporary checkout screen while payment integration is being
        connected.
      </p>

      <div
        style={{
          marginTop: 24,
          border: "1px solid #ddd",
          borderRadius: 18,
          padding: 20,
        }}
      >
        <h2>Selected Plan</h2>

        <p
          style={{
            fontSize: 28,
            fontWeight: 700,
            marginTop: 8,
          }}
        >
          {plan === "yearly" ? "$49/year" : "$4.99/month"}
        </p>

        <p style={{ marginTop: 8, color: "#666" }}>
          Includes higher limits, better memory, longer replies, and future
          premium features.
        </p>

        <button
          style={{
            marginTop: 20,
            width: "100%",
            padding: 14,
            borderRadius: 14,
            border: "none",
            background: "#111",
            color: "#fff",
            fontWeight: 600,
          }}
          onClick={() => {
            alert("Stripe / Google Play Billing comes next.");
          }}
        >
          Continue to Payment
        </button>
      </div>
    </main>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={<main style={{ padding: 24 }}>Loading checkout...</main>}>
      <CheckoutContent />
    </Suspense>
  );
}