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
  const isFirst = index === 0;
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
            <button onClick={skip} className="text-sm text-stone-500">
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

          <div className="absolute bottom-6 left-6 right-6">
            {isFirst ? (
              <button
                type="button"
                onClick={next}
                className="w-full rounded-full bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-md transition active:scale-[0.99]"
              >
                Continue
              </button>
            ) : (
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setIndex((prev) => prev - 1)}
                  className="w-[32%] rounded-full border border-stone-300 bg-white/90 px-4 py-3 text-sm font-medium text-stone-700 shadow-sm backdrop-blur transition active:scale-[0.99]"
                >
                  Back
                </button>

                <button
                  type="button"
                  onClick={next}
                  className="w-[68%] rounded-full bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-md transition active:scale-[0.99]"
                >
                  {isLast ? "Start Talking" : "Continue"}
                </button>
              </div>
            )}
          </div>
        </div>

        <p className="mt-4 text-center text-sm text-stone-400">
          Talkio • Vent. Reflect. Move Forward.
        </p>
      </div>
    </main>
  );
}