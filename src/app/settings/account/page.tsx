"use client";

import { useState } from "react";
import {
  GoogleAuthProvider,
  linkWithPopup,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase";


export default function AccountSettingsPage() {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleGoogleSignIn = async () => {
    const auth = getFirebaseAuth();
    const provider = new GoogleAuthProvider();

    try {
      if (auth.currentUser && auth.currentUser.isAnonymous) {
        const oldUid = auth.currentUser.uid;

        try {
          await linkWithPopup(auth.currentUser, provider);
          alert("Google account connected.");
          return;
        } catch (error: any) {
          console.error("Google link failed:", error);

          if (error?.code === "auth/credential-already-in-use") {
            const result = await signInWithPopup(auth, provider);
            const token = await result.user.getIdToken();

            const mergeRes = await fetch(
              "https://generatetalkioreply-ndury54xsq-uc.a.run.app/mergeUserData",
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ oldUid }),
              }
            );

            if (!mergeRes.ok) throw new Error("Merge failed");

            alert("Google account connected and data merged.");
            return;
          }

          throw error;
        }
      }

      await signInWithPopup(auth, provider);
      alert("Signed in with Google.");
    } catch (error: any) {
      console.error("Google sign-in failed:", error);
      alert(`Error: ${error?.code || "unknown"} | ${error?.message || ""}`);
    }
  };

  const handleSignOut = async () => {
  const auth = getFirebaseAuth();

  await signOut(auth);

  window.location.href = "/";
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
      const token = await user.getIdToken();

      const res = await fetch(
        "https://generatetalkioreply-ndury54xsq-uc.a.run.app/deleteMyAccount",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!res.ok) throw new Error("Failed to delete");

      await signOut(auth);
      window.location.href = "/";
    } catch (error) {
      console.error("Delete account failed:", error);
      alert("Failed to delete account.");
      setIsDeleting(false);
    }
  };

  const canDelete = !isDeleting;

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
          <button
            type="button"
            onClick={handleGoogleSignIn}
            className="flex w-full items-center justify-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-4 text-base font-medium text-stone-900 shadow-sm transition hover:bg-stone-50"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-xl font-semibold text-blue-500">
              G
            </span>
            Continue with Google
          </button>

          <button
            type="button"
            onClick={handleSignOut}
            className="mt-4 flex w-full items-center justify-between rounded-2xl border border-stone-200 bg-white px-4 py-4 text-left text-base font-medium text-stone-900 transition hover:bg-stone-50"
          >
            <span>Sign out</span>
            <span className="text-stone-400">›</span>
          </button>
        </section>

        <section className="mt-6 overflow-hidden rounded-3xl bg-white shadow-sm">
  <button
    type="button"
    onClick={() => {
      const confirmed = window.confirm(
        "Delete your Talkio account?\n\nThis permanently removes your account and conversations."
      );

      if (confirmed) {
        handleDeleteAccount();
      }
    }}
    className="flex w-full items-center justify-between px-5 py-4 text-left transition hover:bg-stone-50"
  >
    <div>
      <p className="font-medium text-red-600">
        Delete account
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