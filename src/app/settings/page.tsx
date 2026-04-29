"use client";

export default function SettingsPage() {
  return (
    <main style={{ padding: 20 }}>
      <h2>Settings</h2>

      <section style={{ marginTop: 20 }}>
        <button onClick={() => (window.location.href = "/settings/account")}>
          Account ›
        </button>
      </section>
    </main>
  );
}