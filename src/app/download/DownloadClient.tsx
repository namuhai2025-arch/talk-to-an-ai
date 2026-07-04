"use client";

import { useEffect } from "react";

const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.talkio.app";

const APP_STORE_URL = "PASTE_YOUR_APP_STORE_LINK_HERE";

export default function DownloadClient() {

  useEffect(() => {
    const ua = navigator.userAgent;

    if (/iPhone|iPad|iPod/i.test(ua) && APP_STORE_URL !== "PASTE_YOUR_APP_STORE_LINK_HERE") {
      window.location.href = APP_STORE_URL;
      return;
    }

    if (/Android/i.test(ua)) {
      window.location.href = PLAY_STORE_URL;
    }
  }, []);

   useEffect(() => {
  console.log("Current URL:", window.location.href);
  console.log("User Agent:", navigator.userAgent);

  const ua = navigator.userAgent;

  if (
    /iPhone|iPad|iPod/i.test(ua) &&
    APP_STORE_URL !== "PASTE_YOUR_APP_STORE_LINK_HERE"
  ) {
    window.location.href = APP_STORE_URL;
    return;
  }

  if (/Android/i.test(ua)) {
    window.location.href = PLAY_STORE_URL;
  }
}, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-6 text-center">
      <div>
        <h1 className="text-2xl font-semibold text-stone-900">
          Download Talkio
        </h1>

        <p className="mt-3 text-sm text-stone-600">
          Your calm AI companion for reflection and emotional clarity.
        </p>

        <div className="mt-6 flex flex-col gap-3">
          {APP_STORE_URL !== "PASTE_YOUR_APP_STORE_LINK_HERE" && (
            <a
              href={APP_STORE_URL}
              className="rounded-2xl bg-stone-900 px-5 py-3 text-sm font-medium text-white"
            >
              Download on the App Store
            </a>
          )}

          <a
            href={PLAY_STORE_URL}
            className="rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-medium text-white"
          >
            Open in Google Play
          </a>
        </div>
      </div>
    </main>
  );
}