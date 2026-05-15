"use client";

import { useEffect } from "react";

const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.talkio.app";

export default function DownloadPage() {
  useEffect(() => {
    window.location.href = PLAY_STORE_URL;
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-6 text-center">
      <div>
        <h1 className="text-2xl font-semibold text-stone-900">Opening Talkio…</h1>
        <p className="mt-3 text-sm text-stone-600">
          If nothing happens, tap below.
        </p>

        <a
          href={PLAY_STORE_URL}
          className="mt-6 inline-block rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-medium text-white"
        >
          Open in Google Play
        </a>
      </div>
    </main>
  );
}