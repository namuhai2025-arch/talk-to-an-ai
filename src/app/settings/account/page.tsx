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
  const [confirmText, setConfirmText] = useState("");
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

          if (!mergeRes.ok) {
            throw new Error("Merge failed");
          }

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
  if (confirmText !== "DELETE") return;

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

  return (
    <main style={{ padding: 20, maxWidth: 500, margin: "0 auto" }}>
      <button onClick={() => (window.location.href = "/settings")}>
        ← Back
      </button>

      <h2 style={{ marginTop: 20 }}>Account</h2>

      <section style={{ marginTop: 24 }}>
  <button style={{ width: "100%", padding: 10 }} onClick={handleGoogleSignIn}>
    Continue with Google
  </button>
</section>

<section style={{ marginTop: 12 }}>
  <button style={{ width: "100%", padding: 10 }} onClick={handleSignOut}>
    Sign out
  </button>
</section>

      <section style={{ marginTop: 40 }}>
        <h4>Delete account and data</h4>
        <p style={{ color: "#666" }}>
          This permanently deletes your Talkio account and related data.
        </p>

        <input
          placeholder="Type DELETE"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          style={{
            width: "100%",
            padding: "10px",
            marginTop: "10px",
          }}
        />

        <button
          onClick={handleDeleteAccount}
          disabled={confirmText !== "DELETE" || isDeleting}
          style={{
            marginTop: 10,
            color: "white",
            background: confirmText === "DELETE" ? "red" : "#999",
            padding: "10px",
            border: "none",
            cursor:
              confirmText === "DELETE" && !isDeleting
                ? "pointer"
                : "not-allowed",
          }}
        >
          {isDeleting ? "Deleting..." : "Delete account"}
        </button>
      </section>
    </main>
  );
}