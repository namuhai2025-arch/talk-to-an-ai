"use client";

import React, { useState, useEffect } from "react";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User,
} from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase";

// Single authorized operator
const AUTHORIZED_EMAIL = "lacidamuriel@gmail.com";

interface AuthGateProps {
  children: (user: User, handleSignOut: () => void) => React.ReactNode;
}

export default function AuthGate({ children }: AuthGateProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const auth = getFirebaseAuth();
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        if (currentUser.email?.toLowerCase() !== AUTHORIZED_EMAIL.toLowerCase()) {
          await signOut(auth);
          setUser(null);
          setError("Access denied. Unauthorized operator.");
        } else {
          setUser(currentUser);
          setError("");
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetEmail = email.trim().toLowerCase();

    if (targetEmail !== AUTHORIZED_EMAIL.toLowerCase()) {
      setError("Access denied. This workspace is restricted.");
      return;
    }

    if (!password) {
      setError("Please provide your password.");
      return;
    }

    setError("");
    setIsSubmitting(true);

    try {
      const auth = getFirebaseAuth();
      const userCredential = await signInWithEmailAndPassword(auth, targetEmail, password);

      if (userCredential.user.email?.toLowerCase() !== AUTHORIZED_EMAIL.toLowerCase()) {
        await signOut(auth);
        setError("Access denied.");
      }
    } catch (err: any) {
      const msg = err?.code || err?.message || "";
      if (msg.includes("user-not-found") || msg.includes("wrong-password") || msg.includes("invalid-credential")) {
        setError("Invalid credentials. Access rejected.");
      } else if (msg.includes("operation-not-allowed")) {
        setError("Email/Password provider is disabled in Firebase Console.");
      } else {
        setError("Authentication failure: " + (err?.message || "Unauthorized"));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    const auth = getFirebaseAuth();
    await signOut(auth);
    setUser(null);
  };

  if (loading) {
    return (
      <div className="flex h-dvh w-full items-center justify-center bg-[#fafafa] dark:bg-[#181818]">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-stone-300 border-t-stone-800 dark:border-stone-700 dark:border-t-stone-200" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-dvh w-full items-center justify-center bg-[#fafafa] px-4 dark:bg-[#181818]">
        <div className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-[#202020]">
          <div className="mb-6">
            <h1 className="text-xl font-semibold text-stone-900 dark:text-stone-100">
              Intel Personal
            </h1>
            <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
              Private access. Authorized operator only.
            </p>
          </div>

          <form onSubmit={handleSignIn} className="space-y-3">
            <div>
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Operator email"
                className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 outline-none transition focus:border-stone-500 focus:bg-white dark:border-stone-700 dark:bg-[#181818] dark:text-stone-100 dark:placeholder:text-stone-500 dark:focus:border-stone-500"
              />
            </div>

            <div>
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 outline-none transition focus:border-stone-500 focus:bg-white dark:border-stone-700 dark:bg-[#181818] dark:text-stone-100 dark:placeholder:text-stone-500 dark:focus:border-stone-500"
              />
            </div>

            {error && (
              <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-600 dark:bg-rose-950/30 dark:text-rose-400">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-2 w-full rounded-xl bg-stone-900 py-2.5 text-sm font-semibold text-white transition hover:bg-black disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white"
            >
              {isSubmitting ? "Authenticating..." : "Unlock Workspace"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return <>{children(user, handleSignOut)}</>;
}