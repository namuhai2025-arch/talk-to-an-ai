"use client";

type ReflectionDetailStatus =
  | "preparing"
  | "ready"
  | "generating"
  | "empty"
  | "failed"
  | "insufficient_activity";

type ReflectionDetailProps = {
  title: string;
  subtitle: string;
  description: string;
  status: ReflectionDetailStatus;
  onBack: () => void;
};

export default function ReflectionDetail({
  title,
  subtitle,
  description,
  status,
  onBack,
}: ReflectionDetailProps) {
  const statusLabel =
    status === "generating"
      ? "Preparing now"
      : status === "ready"
        ? "Ready"
        : status === "empty"
          ? "Waiting to begin"
          : status === "insufficient_activity"
            ? "More conversations needed"
            : status === "failed"
              ? "Generation paused"
              : "Preparing your reflection";

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
              {statusLabel}
            </p>

            <h2 className="mt-3 text-xl font-semibold leading-relaxed text-stone-900">
              {description}
            </h2>
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