"use client";

type ReflectionDetailStatus =
  | "preparing"
  | "ready"
  | "generating"
  | "empty";

type ReflectionDetailProps = {
  title: string;
  subtitle: string;
  description: string;
  status: ReflectionDetailStatus;
  currentDays?: number;
  totalDays?: number;
  expectedDate?: string;
  discoveries: string[];
  onBack: () => void;
};

export default function ReflectionDetail({
  title,
  subtitle,
  description,
  status,
  currentDays,
  totalDays,
  expectedDate,
  discoveries,
  onBack,
}: ReflectionDetailProps) {
  const hasProgress =
    typeof currentDays === "number" &&
    typeof totalDays === "number" &&
    totalDays > 0;

  const progressPercent = hasProgress
    ? Math.min(100, Math.max(0, (currentDays / totalDays) * 100))
    : 0;

  return (
    <section className="min-h-0 flex-1 overflow-y-auto px-4 pb-10">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-5 flex items-start gap-3">
          <button
            type="button"
            onClick={onBack}
            aria-label="Go back"
            className="
              flex h-10 w-10 shrink-0
              items-center justify-center
              rounded-full
              border border-stone-200
              bg-white/80
              text-xl text-stone-700
              shadow-sm
              transition
              active:scale-95
            "
          >
            ←
          </button>

          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-stone-900">
              {title}
            </h1>

            <p className="mt-1 text-sm leading-5 text-stone-500">
              {subtitle}
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <section className="rounded-[28px] border border-stone-200 bg-white/75 p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#758565]">
              {status === "generating"
                ? "Preparing now"
                : status === "ready"
                  ? "Ready"
                  : status === "empty"
                    ? "Waiting to begin"
                    : "Preparing your reflection"}
            </p>

            <h2 className="mt-3 text-xl font-semibold text-stone-900">
              {description}
            </h2>

            {hasProgress ? (
              <div className="mt-6">
                <div className="h-2 overflow-hidden rounded-full bg-stone-200">
                  <div
                    className="h-full rounded-full bg-[#829470] transition-all duration-500"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>

                <div className="mt-3 flex items-center justify-between gap-4 text-sm">
                  <span className="font-medium text-stone-700">
                    {currentDays} of {totalDays} days collected
                  </span>

                  <span className="text-stone-500">
                    {Math.round(progressPercent)}%
                  </span>
                </div>
              </div>
            ) : null}

            {expectedDate ? (
              <div className="mt-5 rounded-2xl bg-[#f3f0e8] px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                  Expected
                </p>

                <p className="mt-1 text-sm font-semibold text-stone-800">
                  {expectedDate}
                </p>
              </div>
            ) : null}
          </section>

          <section className="rounded-[28px] border border-stone-200 bg-white/65 p-6">
            <h2 className="text-lg font-semibold text-stone-900">
              What you’ll discover
            </h2>

            <ul className="mt-4 space-y-3">
              {discoveries.map((item) => (
                <li
                  key={item}
                  className="flex gap-3 text-sm leading-6 text-stone-700"
                >
                  <span
                    aria-hidden="true"
                    className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#829470]"
                  />

                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-[28px] border border-stone-200 bg-white/55 p-6 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#758565]">
              Private to you
            </p>

            <p className="mt-2 text-sm leading-6 text-stone-600">
              Only you can see this reflection. It is created from your private
              conversations with Talkio and is never presented as a score or
              judgment.
            </p>
          </section>
        </div>
      </div>
    </section>
  );
}