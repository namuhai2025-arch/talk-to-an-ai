"use client";

export default function CheckoutPage() {
  const plan =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("plan") || "monthly"
      : "monthly";

  return (
    <main style={{ padding: 24, maxWidth: 520, margin: "0 auto" }}>
      <h2>Checkout</h2>

      <p>
        Selected plan: <strong>{plan}</strong>
      </p>

      <p style={{ color: "#666" }}>
        Stripe or RevenueCat checkout will be connected here next.
      </p>

      <button onClick={() => (window.location.href = "/")}>
        Back to Talkio
      </button>
    </main>
  );
}