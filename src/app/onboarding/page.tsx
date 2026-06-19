"use client";

import Image from "next/image";
import React from "react";

export default function TalkioOnboarding() {
  const screens = [
    {
      image: "/onboarding/screen1-heavy-thoughts.png",
      buttonColor: "bg-[#14A978]",
      finalButtonColor: "bg-[#0F8A5F]",
      dotColor: "bg-[#14A978]",
    },
    {
      image: "/onboarding/screen2-no-advice.png",
      buttonColor: "bg-[#3F8F62]",
      finalButtonColor: "bg-[#0F8A5F]",
      dotColor: "bg-[#3F8F62]",
    },
    {
      image: "/onboarding/screen3-no-judgment.png",
      buttonColor: "bg-[#6F8A4A]",
      finalButtonColor: "bg-[#0F8A5F]",
      dotColor: "bg-[#6F8A4A]",
    },
    {
      image: "/onboarding/screen4-clarity.png",
      buttonColor: "bg-[#D08A4E]",
      finalButtonColor: "bg-[#B9743C]",
      dotColor: "bg-[#D08A4E]",
    },
    {
      image: "/onboarding/screen5-feel-lighter.png",
      buttonColor: "bg-[#7F8F58]",
      finalButtonColor: "bg-[#687A42]",
      dotColor: "bg-[#7F8F58]",
    },
  ];

  const [index, setIndex] = React.useState(0);

  const current = screens[index];
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

  function back() {
    if (!isFirst) {
      setIndex((prev) => prev - 1);
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f1e8] px-5 pb-6 pt-14 text-stone-900">
      <div className="mx-auto flex min-h-[calc(100vh-80px)] w-full max-w-md flex-col">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex gap-2">
            {screens.map((screen, i) => (
              <div
                key={screen.image}
                className={`h-2 rounded-full transition-all ${
                  i === index ? `w-10 ${current.dotColor}` : "w-2 bg-stone-300"
                }`}
              />
            ))}
          </div>

          {!isLast && (
            <button
              type="button"
              onClick={skip}
              className="text-sm text-stone-500"
            >
              Skip
            </button>
          )}
        </div>

        <div className="relative flex-1 overflow-hidden rounded-[34px] bg-[#f7f1e8]">
          <Image
            key={current.image}
            src={current.image}
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
                className={`w-full rounded-full ${current.buttonColor} px-5 py-3 text-sm font-semibold text-white shadow-sm transition active:scale-[0.99]`}
              >
                Continue
              </button>
            ) : (
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={back}
                  className="w-[32%] rounded-full border border-stone-200 bg-white/90 px-4 py-3 text-sm font-medium text-stone-700 shadow-sm backdrop-blur transition active:scale-[0.99]"
                >
                  Back
                </button>

                <button
                  type="button"
                  onClick={next}
                  className={`w-[68%] rounded-full px-5 text-sm font-semibold text-white transition active:scale-[0.99] ${
                    isLast
                      ? `${current.finalButtonColor} py-3.5 shadow-md tracking-wide`
                      : `${current.buttonColor} py-3 shadow-sm`
                  }`}
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