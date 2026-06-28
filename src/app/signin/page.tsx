"use client";

import { GoogleAuthProvider, OAuthProvider, signInWithPopup } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase";

export default function SignInPage() {
  const handleGoogleSignIn = async () => {
    try {
      const auth = getFirebaseAuth();

      await signInWithPopup(auth, new GoogleAuthProvider());

      window.location.replace("/");
    } catch (err) {
      console.error(err);
      alert("Google sign in failed.");
    }
  };

  const handleAppleSignIn = async () => {
    try {
      const auth = getFirebaseAuth();

      const provider = new OAuthProvider("apple.com");
      provider.addScope("email");
      provider.addScope("name");

      await signInWithPopup(auth, provider);

      window.location.replace("/");
    } catch (err) {
      console.error(err);
      alert("Apple sign in failed.");
    }
  };

  return (
    <main className="min-h-screen bg-stone-50 flex items-center justify-center px-5">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-sm">

        <h1 className="text-4xl font-semibold text-stone-900">
          Welcome to Talkio
        </h1>

        <p className="mt-3 text-stone-500 leading-7">
          Continue with the same Google or Apple account you use on your iPhone
          or Android device.
        </p>

        <button
          onClick={handleGoogleSignIn}
          className="mt-8 w-full rounded-2xl bg-emerald-600 py-3 font-semibold text-white"
        >
          Continue with Google
        </button>

        <button
          onClick={handleAppleSignIn}
          className="mt-4 w-full rounded-2xl bg-black py-3 font-semibold text-white"
        >
          Continue with Apple
        </button>

      </div>
    </main>
  );
}