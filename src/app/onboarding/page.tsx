"use client";

import React from "react";

export default function TalkioOnboarding() {
  const screens = [
    {
      title: "Some thoughts stay too heavy to carry alone.",
      body:
        "Talkio is a calm space to think, vent, reflect, and breathe.",
    },
    {
      title: "You don’t always need advice.",
      body:
        "Sometimes you just need to feel understood.",
    },
    {
      title: "A grounded human conversation.",
      body:
        "Not a productivity tool. Not a therapy script. Just a calm space to talk naturally.",
    },
    {
      title: "No pressure. No judgment.",
      body:
        "You don’t need perfect words here.",
    },
    {
      title: "What’s been on your mind lately?",
      body:
        "Start where you are. Even small thoughts matter.",
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
    <main className="min-h-screen bg-stone-50 text-stone-900 flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-between">
          <div className="flex gap-2">
            {screens.map((_, i) => (
              <div
                key={i}
                className={`h-2 rounded-full transition-all duration-300 ${
                  i === index
                    ? "w-10 bg-emerald-500"
                    : "w-2 bg-stone-300"
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

        <div className="rounded-[32px] bg-white p-8 shadow-sm border border-stone-200 min-h-[420px] flex flex-col justify-between">
          <div>
            <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-2xl">
              💬
            </div>

            <h1 className="text-3xl font-semibold leading-tight tracking-tight text-stone-900">
              {current.title}
            </h1>

            <p className="mt-5 text-base leading-7 text-stone-600">
              {current.body}
            </p>
          </div>

          <div className="mt-10">
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
              className="w-full rounded-2xl bg-emerald-500 px-5 py-4 text-base font-medium text-white transition hover:bg-emerald-600 active:scale-[0.99]"
            >
              {current.cta || "Continue"}
            </button>
          </div>
        </div>

        <p className="mt-6 text-center text-sm text-stone-400">
          Talkio • calm conversations for heavy moments
        </p>
      </div>
    </main>
  );
}
