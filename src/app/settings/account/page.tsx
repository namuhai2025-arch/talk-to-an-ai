"use client";

import { useEffect, useState } from "react";
import {
  GoogleAuthProvider,
  signOut,
  reauthenticateWithPopup,
} from "firebase/auth";
import { logOutRevenueCat } from "@/lib/revenuecat";
import { getFirebaseAuth } from "@/lib/firebase";

export default function AccountSettingsPage() {
  const [isDeleting, setIsDeleting] = useState(false);
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const [accountProvider, setAccountProvider] = useState<string | null>(null);

  useEffect(() => {
    const auth = getFirebaseAuth();

    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (!user || user.isAnonymous) {
        setAccountEmail(null);
        setAccountProvider(null);
        return;
      }

      setAccountEmail(user.email);

      const providerId = user.providerData[0]?.providerId;

      if (providerId === "apple.com") {
        setAccountProvider("Apple");
      } else if (providerId === "google.com") {
        setAccountProvider("Google");
      } else {
        setAccountProvider(providerId || "Signed in");
      }
    });

    return () => unsubscribe();
  }, []);

  const handleSignOut = async () => {
    try {
      const auth = getFirebaseAuth();

      localStorage.setItem("talkio_signed_out", "true");

      await logOutRevenueCat();
      await signOut(auth);

      window.location.replace("/");
    } catch (error) {
      console.error("Sign out failed:", error);
    }
  };

  const handleDeleteAccount = async () => {
    const auth = getFirebaseAuth();
    const user = auth.currentUser;

    if (!user) {
      alert("Please sign in again.");
      return;
    }

    setIsDeleting(true);

    try {
      const provider = new GoogleAuthProvider();

      await reauthenticateWithPopup(user, provider);

      const token = await user.getIdToken(true);

      const res = await fetch(
        "https://generatetalkioreply-ndury54xsq-uc.a.run.app/deleteMyAccount",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!res.ok) {
        throw new Error("Failed to delete");
      }

      localStorage.setItem("talkio_signed_out", "true");

      await logOutRevenueCat();
      await signOut(auth);

      window.location.replace("/");
    } catch (error) {
      console.error("Delete account failed:", error);
      alert("Failed to delete account.");
      setIsDeleting(false);
    }
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
          Account
        </h1>

        <p className="mt-3 text-sm leading-6 text-stone-500">
          Manage your Talkio account and access.
        </p>

        <section className="mt-8 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5">
          {accountEmail ? (
            <>
              <div className="mb-4 rounded-2xl bg-emerald-50 px-4 py-4 ring-1 ring-emerald-100">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                  Signed in as
                </p>

                <p className="mt-2 text-sm font-semibold text-stone-900">
                  {accountEmail}
                </p>

                {accountProvider && (
                  <p className="mt-1 text-xs text-stone-500">
                    Provider: {accountProvider}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={handleSignOut}
                className="mt-4 flex w-full items-center justify-between rounded-2xl border border-stone-200 bg-white px-4 py-4 text-left text-base font-medium text-stone-900 transition hover:bg-stone-50"
              >
                <span>Switch account / Sign out</span>
                <span className="text-stone-400">›</span>
              </button>
            </>
          ) : (
            <div className="rounded-2xl bg-stone-50 px-4 py-4 text-sm leading-6 text-stone-500">
              You are not signed in. Return to Talkio to sign in.
            </div>
          )}
        </section>

        <section className="mt-6 overflow-hidden rounded-3xl bg-white shadow-sm">
          <button
            type="button"
            disabled={isDeleting}
            onClick={() => {
              const confirmed = window.confirm(
                "Delete your Talkio account?\n\nThis permanently removes your account and conversations."
              );

              if (confirmed) {
                handleDeleteAccount();
              }
            }}
            className="flex w-full items-center justify-between px-5 py-4 text-left transition hover:bg-stone-50 disabled:pointer-events-none disabled:opacity-50"
          >
            <div>
              <p className="font-medium text-red-600">
                {isDeleting ? "Deleting..." : "Delete account"}
              </p>

              <p className="mt-1 text-sm text-stone-500">
                Permanently remove your account and conversations.
              </p>
            </div>

            <span className="text-stone-400">›</span>
          </button>
        </section>

        <section className="mt-6 rounded-3xl border border-emerald-100 bg-white p-5 shadow-sm">
          <p className="font-medium text-stone-900">
            Your privacy and conversations matter.
          </p>
          <p className="mt-1 text-sm leading-6 text-stone-500">
            You stay in control of your account and data.
          </p>
        </section>
      </div>
    </main>
  );
}