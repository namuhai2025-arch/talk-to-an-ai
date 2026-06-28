"use client";

import Image from "next/image";
import React from "react";
import { Capacitor } from "@capacitor/core";

export default function TalkioOnboarding() {
  const screens = [
    {
      image: "/onboarding-webp/screen1-heavy-thoughts.webp",
      buttonColor: "bg-[#90A88B]",
      finalButtonColor: "bg-[#0F8A5F]",
      dotColor: "bg-[#90A88B]",
    },
    {
      image: "/onboarding-webp/screen2-no-advice.webp",
      buttonColor: "bg-[#89A17E]",
      finalButtonColor: "bg-[#0F8A5F]",
      dotColor: "bg-[#89A17E]",
    },
    {
      image: "/onboarding-webp/screen3-no-judgment.webp",
      buttonColor: "bg-[#6F8A4A]",
      finalButtonColor: "bg-[#0F8A5F]",
      dotColor: "bg-[#6F8A4A]",
    },
    {
      image: "/onboarding-webp/screen4-clarity.webp",
      buttonColor: "bg-[#D08A4E]",
      finalButtonColor: "bg-[#B9743C]",
      dotColor: "bg-[#D08A4E]",
    },
    {
      image: "/onboarding-webp/screen5-feel-lighter.webp",
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
    window.location.href = Capacitor.isNativePlatform() ? "/" : "/signin";
  }

  function skip() {
    localStorage.setItem("talkio_onboarding_complete", "true");
    window.location.href = Capacitor.isNativePlatform() ? "/" : "/signin";
  }

  function back() {
    if (!isFirst) {
      setIndex((prev) => prev - 1);
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f1e8] px-5 pb-5 pt-12 text-stone-900">
      <div className="mx-auto flex min-h-[calc(100vh-68px)] w-full max-w-md flex-col">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex gap-2">
            {screens.map((screen, i) => (
              <div
                key={screen.image}
                className={`h-2 rounded-full transition-all ${
                  i === index ? `w-9 ${current.dotColor}` : "w-2 bg-stone-300"
                }`}
              />
            ))}
          </div>

          {!isLast && (
            <button
              type="button"
              onClick={skip}
              className="text-sm font-medium text-stone-500"
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
            priority={index === 0}
            loading={index === 0 ? "eager" : "lazy"}
            quality={75}
            sizes="100vw"
            className="object-contain"
          />

          <div className="absolute bottom-5 left-7 right-7">
            {isFirst ? (
              <button
                type="button"
                onClick={next}
                className={`mx-auto block min-h-[42px] w-[82%] rounded-full ${current.buttonColor} px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition active:scale-[0.99]`}
              >
                Continue
              </button>
            ) : (
              <div className="mx-auto flex w-[88%] gap-3">
                <button
                  type="button"
                  onClick={back}
                  className="min-h-[42px] w-[34%] rounded-full border border-stone-200 bg-white/90 px-4 py-2.5 text-sm font-medium text-stone-700 shadow-sm backdrop-blur transition active:scale-[0.99]"
                >
                  Back
                </button>

                <button
                  type="button"
                  onClick={next}
                  className={`min-h-[42px] w-[66%] rounded-full px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition active:scale-[0.99] ${
                    isLast ? current.finalButtonColor : current.buttonColor
                  }`}
                >
                  {isLast ? "Start Talking" : "Continue"}
                </button>
              </div>
            )}
          </div>
        </div>

        <p className="mt-3 text-center text-sm text-stone-400">
          Talkio • Vent. Reflect. Move Forward.
        </p>
      </div>
    </main>
  );
}