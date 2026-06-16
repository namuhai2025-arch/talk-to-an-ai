"use client";

import { useEffect, useState } from "react";

type Mode = "setup" | "enabled" | "change";

export default function PrivacySettingsPage() {
  const [pinEnabled, setPinEnabled] = useState(false);
  const [mode, setMode] = useState<Mode>("setup");

  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");

  useEffect(() => {
    const enabled = localStorage.getItem("talkio_pin_enabled") === "true";
    setPinEnabled(enabled);
    setMode(enabled ? "enabled" : "setup");
  }, []);

  const cleanPin = (value: string) =>
    value.replace(/\D/g, "").slice(0, 4);

  const saveNewPin = () => {
    if (!/^\d{4}$/.test(newPin)) {
      alert("Please enter a 4-digit PIN.");
      return;
    }

    if (newPin !== confirmPin) {
      alert("PINs do not match.");
      return;
    }

    localStorage.setItem("talkio_pin_enabled", "true");
    localStorage.setItem("talkio_pin_code", newPin);

    setPinEnabled(true);
    setMode("enabled");
    setCurrentPin("");
    setNewPin("");
    setConfirmPin("");

    alert("PIN Lock enabled.");
  };

  const changePin = () => {
    const savedPin = localStorage.getItem("talkio_pin_code");

    if (currentPin !== savedPin) {
      alert("Current PIN is incorrect.");
      return;
    }

    if (!/^\d{4}$/.test(newPin)) {
      alert("Please enter a new 4-digit PIN.");
      return;
    }

    if (newPin !== confirmPin) {
      alert("New PINs do not match.");
      return;
    }

    localStorage.setItem("talkio_pin_code", newPin);

    setMode("enabled");
    setCurrentPin("");
    setNewPin("");
    setConfirmPin("");

    alert("PIN changed.");
  };

  const disablePin = () => {
    const savedPin = localStorage.getItem("talkio_pin_code");

    if (currentPin !== savedPin) {
      alert("Current PIN is incorrect.");
      return;
    }

    localStorage.removeItem("talkio_pin_enabled");
    localStorage.removeItem("talkio_pin_code");

    setPinEnabled(false);
    setMode("setup");
    setCurrentPin("");
    setNewPin("");
    setConfirmPin("");

    alert("PIN Lock disabled.");
  };

  return (
    <main className="min-h-screen bg-stone-50 px-5 pb-6 pt-[calc(env(safe-area-inset-top)+3.5rem)]">
      <div className="mx-auto max-w-md">
        <button
          type="button"
          onClick={() => (window.location.href = "/settings")}
          className="mb-8 text-sm text-stone-500 hover:text-stone-800"
        >
          ← Back
        </button>

        <h1 className="text-4xl font-semibold tracking-tight text-stone-900">
          Privacy Lock
        </h1>

        <p className="mt-3 text-sm leading-6 text-stone-500">
          Optional. Require a 4-digit PIN before opening Talkio on this device.
        </p>

        <p className="mt-3 text-xs leading-5 text-stone-400">
  If you forget your PIN, you will need to reinstall Talkio on this device.
</p>

        <section className="mt-8 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5">
          <p className="font-medium text-stone-900">
            {pinEnabled ? "PIN Lock is enabled" : "Set a 4-digit PIN"}
          </p>

          {!pinEnabled && (
            <div className="mt-5 space-y-3">
              <input
                value={newPin}
                onChange={(e) => setNewPin(cleanPin(e.target.value))}
                inputMode="numeric"
                type="password"
                placeholder="Enter PIN"
                className="w-full rounded-2xl border border-stone-200 px-4 py-4 text-base outline-none focus:border-emerald-500"
              />

              <input
                value={confirmPin}
                onChange={(e) => setConfirmPin(cleanPin(e.target.value))}
                inputMode="numeric"
                type="password"
                placeholder="Confirm PIN"
                className="w-full rounded-2xl border border-stone-200 px-4 py-4 text-base outline-none focus:border-emerald-500"
              />

              <button
                type="button"
                onClick={saveNewPin}
                className="w-full rounded-2xl bg-emerald-500 px-4 py-4 text-base font-semibold text-white shadow-sm"
              >
                Enable PIN Lock
              </button>
            </div>
          )}

          {pinEnabled && mode === "enabled" && (
            <div className="mt-5 space-y-3">
              <button
                type="button"
                onClick={() => setMode("change")}
                className="w-full rounded-2xl bg-emerald-500 px-4 py-4 text-base font-semibold text-white shadow-sm"
              >
                Change PIN
              </button>

              <input
                value={currentPin}
                onChange={(e) => setCurrentPin(cleanPin(e.target.value))}
                inputMode="numeric"
                type="password"
                placeholder="Current PIN to disable"
                className="w-full rounded-2xl border border-stone-200 px-4 py-4 text-base outline-none focus:border-emerald-500"
              />

              <button
                type="button"
                onClick={disablePin}
                className="w-full rounded-2xl border border-red-100 bg-red-50 px-4 py-4 text-base font-semibold text-red-600"
              >
                Disable PIN Lock
              </button>
            </div>
          )}

          {pinEnabled && mode === "change" && (
            <div className="mt-5 space-y-3">
              <input
                value={currentPin}
                onChange={(e) => setCurrentPin(cleanPin(e.target.value))}
                inputMode="numeric"
                type="password"
                placeholder="Current PIN"
                className="w-full rounded-2xl border border-stone-200 px-4 py-4 text-base outline-none focus:border-emerald-500"
              />

              <input
                value={newPin}
                onChange={(e) => setNewPin(cleanPin(e.target.value))}
                inputMode="numeric"
                type="password"
                placeholder="New PIN"
                className="w-full rounded-2xl border border-stone-200 px-4 py-4 text-base outline-none focus:border-emerald-500"
              />

              <input
                value={confirmPin}
                onChange={(e) => setConfirmPin(cleanPin(e.target.value))}
                inputMode="numeric"
                type="password"
                placeholder="Confirm new PIN"
                className="w-full rounded-2xl border border-stone-200 px-4 py-4 text-base outline-none focus:border-emerald-500"
              />

              <button
                type="button"
                onClick={changePin}
                className="w-full rounded-2xl bg-emerald-500 px-4 py-4 text-base font-semibold text-white shadow-sm"
              >
                Save New PIN
              </button>

              <button
                type="button"
                onClick={() => {
                  setMode("enabled");
                  setCurrentPin("");
                  setNewPin("");
                  setConfirmPin("");
                }}
                className="w-full rounded-2xl border border-stone-200 px-4 py-4 text-base font-semibold text-stone-700"
              >
                Cancel
              </button>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}