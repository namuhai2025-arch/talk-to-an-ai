"use client";

import { useEffect, useState } from "react";
import {
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  reauthenticateWithPopup,
  signInWithCredential,
  } from "firebase/auth";

import { logOutRevenueCat } from "@/lib/revenuecat";

import { Capacitor } from "@capacitor/core";
import {
  AppleSignIn,
  SignInScope,
} from "@capawesome/capacitor-apple-sign-in";

import { getFirebaseAuth } from "@/lib/firebase";
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";

export default function AccountSettingsPage() {
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);

  const handleGoogleSignIn = async () => {
  if (isSigningIn) return;

  setIsSigningIn(true);

  try {
    if (Capacitor.getPlatform() === "android") {
      const result =
        await FirebaseAuthentication.signInWithGoogle();

      console.log(
        "Android Google sign in success",
        result.user?.uid
      );

      localStorage.removeItem("talkio_signed_out");

      window.location.href = "/settings";
      return;
    }

    const auth = getFirebaseAuth();

    const provider = new GoogleAuthProvider();

    provider.setCustomParameters({
      prompt: "select_account",
    });

    const result = await signInWithPopup(
      auth,
      provider
    );

    console.log(
      "Google sign in success",
      result.user.uid
    );

    localStorage.removeItem("talkio_signed_out");

    window.location.href = "/settings";
  } catch (error: any) {
    console.error(
      "Google sign-in failed:",
      error
    );

    alert(
      `Google sign in failed.\n\nCode: ${
        error?.code || "none"
      }\nMessage: ${
        error?.message ||
        JSON.stringify(error)
      }`
    );

    setIsSigningIn(false);
  }
};

  const handleAppleSignIn = async () => {
  if (isSigningIn) return;

  setIsSigningIn(true);

  const auth = getFirebaseAuth();
  const provider = new OAuthProvider("apple.com");

  try {
    if (Capacitor.getPlatform() === "ios") {
  const result = await AppleSignIn.signIn({
    scopes: [SignInScope.Email, SignInScope.FullName],
  });

  const idToken =
  (result as any).idToken ||
  (result as any).identityToken;

  console.log("Apple result:", result);

  if (!idToken) {
    throw new Error("No Apple identity token returned.");
  }

  const credential = provider.credential({
  idToken,
});

const userCredential = await signInWithCredential(
  auth,
  credential
);

console.log(
  "Apple native sign in success",
  userCredential.user.uid
);

window.location.href = "/settings";
return;
}

    await signInWithRedirect(auth, provider);
  } catch (error: any) {
    console.error("Apple sign-in failed:", error);

    alert(
      `Apple sign in failed.\n\nCode: ${
        error?.code || "none"
      }\nMessage: ${error?.message || JSON.stringify(error)}`
    );

    setIsSigningIn(false);
  }
};

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
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isSigningIn}
            className="flex w-full items-center justify-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-4 text-base font-medium text-stone-900 shadow-sm transition hover:bg-stone-50 disabled:pointer-events-none disabled:opacity-50"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-xl font-semibold text-blue-500">
              G
            </span>
            {isSigningIn ? "Opening Google..." : "Continue with Google"}
          </button>

          <button
  type="button"
  onClick={handleAppleSignIn}
  disabled={isSigningIn}
  className="mt-3 flex w-full items-center justify-center gap-3 rounded-2xl border border-stone-200 bg-black px-4 py-4 text-base font-medium text-white shadow-sm transition hover:bg-stone-900 disabled:pointer-events-none disabled:opacity-50"
>
  <span className="text-xl font-semibold"></span>
  {isSigningIn ? "Opening Apple..." : "Continue with Apple"}
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
            disabled={!isDeleting ? false : true}
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