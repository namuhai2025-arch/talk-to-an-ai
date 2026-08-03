"use client";

import Image from "next/image";
import React from "react";
import { Capacitor } from "@capacitor/core";

export default function TalkioOnboarding() {
  const screens = [
  {
    image: "/onboarding-webp/screen1-welcome-safe-space.webp",
    dotColor: "bg-[#6F8A4A]",
  },
  {
    image: "/onboarding-webp/screen5-how-it-works.webp",
    dotColor: "bg-[#6F8A4A]",
  },
  {
    image: "/onboarding-webp/screen6-reflection-journey.webp",
    dotColor: "bg-[#B8893D]",
  },
  {
    image: "/onboarding-webp/screen2-heavy-thoughts.webp",
    dotColor: "bg-[#90A88B]",
  },
  {
    image: "/onboarding-webp/screen3-no-advice.webp",
    dotColor: "bg-[#89A17E]",
  },
  {
    image: "/onboarding-webp/screen4-no-judgment.webp",
    dotColor: "bg-[#6F8A4A]",
  },
  {
    image: "/onboarding-webp/screen7-clarity.webp",
    dotColor: "bg-[#D08A4E]",
  },
  {
    image: "/onboarding-webp/screen8-feel-lighter.webp",
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
              className="text-[15px] font-medium text-stone-500"
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

  <div className="absolute inset-x-0 bottom-4 bg-gradient-to-t from-black/0 via-transparent to-transparent px-12 pb-4 pt-14">
    {isFirst ? (
      <button
        type="button"
        onClick={next}
        className="
          mx-auto block min-h-[40px] w-[66%] rounded-full
          border border-white/30 bg-white/5
          px-5 py-2 text-[15px] font-semibold text-white
          shadow-none backdrop-blur-[2px]
          transition hover:bg-white/10
          active:scale-[0.99]
          focus-visible:outline-none
          focus-visible:ring-2
          focus-visible:ring-white/80
        "
      >
        Continue
      </button>
    ) : (
      <div className="mx-auto flex w-[72%] gap-2">
  <button
    type="button"
    onClick={back}
    className="
min-h-[42px] w-[32%] rounded-full
border border-white/30
bg-white/5
px-3 py-2
text-[15px] font-medium text-white
shadow-none
backdrop-blur-[2px]
transition
hover:bg-white/10
active:scale-[0.99]
focus-visible:outline-none
focus-visible:ring-2
focus-visible:ring-white/40
"
  >
    Back
  </button>

  <button
    type="button"
    onClick={next}
    className={`
min-h-[42px] w-[68%] rounded-full
border border-white/30
px-4 py-2
text-[15px] font-semibold text-white
shadow-none
backdrop-blur-[2px]
transition
active:scale-[0.99]
focus-visible:outline-none
focus-visible:ring-2
focus-visible:ring-white/40
${
  isLast
    ? "bg-[#173F2B]/25 hover:bg-[#173F2B]/35"
    : "bg-white/5 hover:bg-white/15"
}
`}
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