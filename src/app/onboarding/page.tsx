"use client";

import Image from "next/image";
import React from "react";

export default function TalkioOnboarding() {
  const screens = [
    {
      title: "Some thoughts are too heavy to carry alone.",
      body: "Talkio gives you a calm place to let them out.",
      image: "/onboarding/screen1-heavy-thoughts.png",
    },
    {
      title: "You don’t always need advice.",
      body: "Sometimes you just need space to say what you’re really thinking.",
      image: "/onboarding/screen2-no-advice.png",
    },
    {
      title: "No judgment. No pressure.",
      body: "Be honest about stress, frustration, heartbreak, or uncertainty.",
      image: "/onboarding/screen3-no-judgment.png",
    },
    {
      title: "Find clarity.",
      body: "Talkio helps turn heavy thoughts into calmer next steps.",
      image: "/onboarding/screen4-clarity.png",
    },
    {
      title: "Feel lighter.",
      body: "You don’t have to carry it all alone. Let it out.",
      image: "/onboarding/screen5-feel-lighter.png",
      cta: "Start Talking",
    },
  ];

  const [index, setIndex] = React.useState(0);

  const current = screens[index];
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
    <main className="flex min-h-screen items-center justify-center bg-[#f7f1e8] px-5 py-8 text-stone-900">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex gap-2">
            {screens.map((_, i) => (
              <div
                key={i}
                className={`h-2 rounded-full transition-all duration-300 ${
                  i === index ? "w-10 bg-emerald-500" : "w-2 bg-stone-300"
                }`}
              />
            ))}
          </div>

          {!isLast && (
            <button
              onClick={skip}
              className="text-sm text-stone-500 hover:text-stone-700"
            >
              Skip
            </button>
          )}
        </div>

        <div
          key={index}
          className="animate-[onboardingFade_280ms_ease-out] overflow-hidden rounded-[36px] border border-stone-200 bg-white shadow-sm"
        >
          <div className="relative h-[330px] w-full bg-emerald-50">
            <Image
              src={current.image}
              alt={current.title}
              fill
              priority
              className="object-cover"
            />
          </div>

          <div className="p-7">
            <h1 className="text-[31px] font-semibold leading-[1.08] tracking-[-0.03em] text-stone-950">
              {current.title}
            </h1>

            <p className="mt-4 text-[16px] leading-7 text-stone-600">
              {current.body}
            </p>

            <div className="mt-8">
              {index > 0 && (
                <button
                  onClick={() => setIndex((prev) => prev - 1)}
                  className="mb-3 w-full rounded-2xl border border-stone-300 px-5 py-4 text-base font-medium text-stone-700 transition hover:bg-stone-100"
                >
                  Back
                </button>
              )}

              <button
                onClick={next}
                className="w-full rounded-2xl bg-emerald-500 px-5 py-4 text-base font-semibold text-white transition hover:bg-emerald-600 active:scale-[0.99]"
              >
                {current.cta || "Continue"}
              </button>
            </div>
          </div>
        </div>

        <p className="mt-5 text-center text-sm text-stone-400">
          Talkio • Vent. Reflect. Move Forward.
        </p>
      </div>

      <style jsx>{`
        @keyframes onboardingFade {
          from {
            opacity: 0;
            transform: translateY(10px) scale(0.985);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </main>
  );
}