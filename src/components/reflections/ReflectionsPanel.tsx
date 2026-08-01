"use client";

export default function ReflectionsPanel() {
  return (
    <section className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
      <div className="rounded-3xl border border-stone-200 bg-white/70 p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">
          Weekly Reflection
        </p>

        <h2 className="mt-3 text-2xl font-semibold text-stone-900">
          Your reflections will appear here.
        </h2>

        <p className="mt-3 text-sm leading-6 text-stone-600">
          Keep talking naturally. Talkio will gently reflect your week back to
          you when enough meaningful conversation is available.
        </p>
      </div>
    </section>
  );
}