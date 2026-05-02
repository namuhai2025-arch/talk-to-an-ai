"use client";

export default function SettingsPage() {
  return (
    <main style={{ padding: 20, maxWidth: 500, margin: "0 auto" }}>
      <h2>Settings</h2>

      <section style={{ marginTop: 20 }}>
        <button
          style={{ width: "100%", padding: 10 }}
          onClick={() => (window.location.href = "/paywall")}
        >
          Upgrade
        </button>
      </section>

      <section style={{ marginTop: 12 }}>
        <button
          style={{ width: "100%", padding: 10 }}
          onClick={() => (window.location.href = "/")}
        >
          Edit Nickname
        </button>
      </section>

      <section style={{ marginTop: 20 }}>
        <button
          style={{ width: "100%", padding: 10 }}
          onClick={() => (window.location.href = "/settings/account")}
        >
          Account ›
        </button>
      </section>
    </main>
  );
}