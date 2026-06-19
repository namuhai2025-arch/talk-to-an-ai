"use client";

import Image from "next/image";
import React from "react";

export default function TalkioOnboarding() {
  const screens = [
    { image: "/onboarding/screen1-heavy-thoughts.png" },
    { image: "/onboarding/screen2-no-advice.png" },
    { image: "/onboarding/screen3-no-judgment.png" },
    { image: "/onboarding/screen4-clarity.png" },
    { image: "/onboarding/screen5-feel-lighter.png" },
  ];

  const [index, setIndex] = React.useState(0);
  const isLast = index === screens.length - 1;

  function next() {
    if (!isLast) {
      setIndex((prev) => prev + 1);
      return;
    }

    localStorage.setItem("talkio_onboarding_complete", "true");
    window.location.href = "/";
  }

  function skip() {
    localStorage.setItem("talkio_onboarding_complete", "true");
    window.location.href = "/";
  }

  return (
    <main className="min-h-screen bg-[#f7f1e8] px-5 pb-6 pt-14 text-stone-900">
      <div className="mx-auto flex min-h-[calc(100vh-80px)] w-full max-w-md flex-col">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex gap-2">
            {screens.map((_, i) => (
              <div
                key={i}
                className={`h-2 rounded-full transition-all ${
                  i === index ? "w-10 bg-emerald-500" : "w-2 bg-stone-300"
                }`}
              />
            ))}
          </div>

          {!isLast && (
            <button
              onClick={skip}
              className="text-sm text-stone-500"
            >
              Skip
            </button>
          )}
        </div>

        <div className="relative flex-1 overflow-hidden rounded-[34px] bg-[#f7f1e8]">
          <Image
            key={screens[index].image}
            src={screens[index].image}
            alt="Talkio onboarding"
            fill
            priority
            className="object-contain"
          />
        </div>

        <div className="mt-5 space-y-3">
          {index > 0 && (
            <button
              onClick={() => setIndex((prev) => prev - 1)}
              className="w-full rounded-2xl border border-stone-300 bg-white px-5 py-4 text-base font-medium text-stone-700"
            >
              Back
            </button>
          )}

          <button
            onClick={next}
            className="w-full rounded-2xl bg-emerald-500 px-5 py-4 text-base font-semibold text-white"
          >
            {isLast ? "Start Talking" : "Continue"}
          </button>
        </div>

        <p className="mt-4 text-center text-sm text-stone-400">
          Talkio • Vent. Reflect. Move Forward.
        </p>
      </div>
    </main>
  );
}