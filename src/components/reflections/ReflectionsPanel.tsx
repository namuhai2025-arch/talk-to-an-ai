  "use client";

  import { useCallback, useEffect, useState } from "react";
  import { onAuthStateChanged, type User } from "firebase/auth";
  import { getFirebaseAuth } from "@/lib/firebase";

  import {
  resolveTalkioTier,
  type TalkioTier,
} from "@/lib/subscription";

  const FUNCTIONS_BASE_URL =
    "https://us-central1-talkio-production.cloudfunctions.net";

  const GET_REFLECTIONS_URL =
    `${FUNCTIONS_BASE_URL}/getMyWeeklyReflections`;

  const GENERATE_REFLECTION_URL =
    `${FUNCTIONS_BASE_URL}/generateMyWeeklyReflection`;

  type WeeklyReflection = {
    id?: string;
    status?: "ready" | "generating" | "failed" | "insufficient_activity";
    periodStart?: string;
    periodEnd?: string;
    lookingBack?: string;
    whatWeighedOnYou?: string[];
    whatHelped?: string[];
    momentsThatMattered?: string[];
    somethingToCarryForward?: string;
    oneThingINoticed?: string;
    language?: string;
    generatedAt?: string;
  };

  type ReflectionListResponse = {
    ok?: boolean;
    reflections?: WeeklyReflection[];
    error?: string;
  };

  type ReflectionGenerationResponse = {
    ok?: boolean;
    outcome?:
      | "generated"
      | "already_exists"
      | "insufficient_activity";
    reflection?: WeeklyReflection;
    error?: string;
  };

  async function getAuthToken(user: User): Promise<string> {
    return user.getIdToken();
  }

  async function readResponseJson<T>(response: Response): Promise<T> {
    const rawText = await response.text();

    if (!rawText) {
      return {} as T;
    }

    try {
      return JSON.parse(rawText) as T;
    } catch {
      throw new Error("Talkio received an invalid server response.");
    }
  }

  function formatReflectionPeriod(
    start?: string,
    end?: string
  ): string {
    if (!start && !end) return "";

    const formatDate = (value?: string) => {
      if (!value) return "";

      const date = new Date(`${value}T00:00:00`);

      if (Number.isNaN(date.getTime())) {
        return value;
      }

      return new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(date);
    };

    const formattedStart = formatDate(start);
    const formattedEnd = formatDate(end);

    if (formattedStart && formattedEnd) {
      return `${formattedStart} – ${formattedEnd}`;
    }

    return formattedStart || formattedEnd;
  }

  function ReflectionsHeader({
    onBack,
    title,
    subtitle,
  }: {
    onBack: () => void;
    title: string;
    subtitle?: string;
  }) {
    return (
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

          {subtitle ? (
            <p className="mt-1 text-sm leading-5 text-stone-500">
              {subtitle}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  type ReflectionIconName =
    | "weekly"
    | "monthly"
    | "quarterly"
    | "yearly"
    | "portrait";

  function ReflectionsHome({
  tier,
  tierLoading,
  onBack,
  onOpenWeekly,
  onOpenLocked,
  onOpenComingSoon,
}: {
  tier: TalkioTier;
  tierLoading: boolean;
  onBack: () => void;
  onOpenWeekly: () => void;
  onOpenLocked: (title: string, requiredTier: string) => void;
  onOpenComingSoon: (title: string) => void;
}) {
  const weeklyUnlocked =
    !tierLoading && tier !== "free";

  const advancedUnlocked =
    !tierLoading &&
    (tier === "presence" ||
      tier === "professional" ||
      tier === "elite");

  const portraitUnlocked =
  !tierLoading &&
  (tier === "professional" || tier === "elite");  

  return (
      <section className="min-h-0 flex-1 overflow-y-auto px-4 pb-10">
        <div className="mx-auto w-full max-w-2xl">
          <ReflectionsHeader
            onBack={onBack}
            title="Your reflections"
            subtitle="See patterns. Understand more. Grow, one step at a time."
          />

          <div className="rounded-[30px] border border-stone-200/80 bg-white/35 p-3 shadow-[0_16px_50px_rgba(69,58,42,0.06)] backdrop-blur-sm">
            <div className="space-y-2">
              <ReflectionHomeCard
  icon="weekly"
  title="Weekly Reflection"
  description="A thoughtful look back at what shaped your week."
  tierLabel={!weeklyUnlocked ? "Companion" : undefined}
  locked={!weeklyUnlocked}
  onClick={
    weeklyUnlocked
      ? onOpenWeekly
      : () => onOpenLocked("Weekly Reflection", "Companion")
  }
/>

<ReflectionHomeCard
  icon="monthly"
  title="Monthly Reflection"
  description="Notice the emotions and themes that keep returning."
  tierLabel={
  !advancedUnlocked
    ? "Presence • Professional • Elite"
    : undefined
}
  locked={!advancedUnlocked}
  onClick={
    advancedUnlocked
      ? () => onOpenComingSoon("Monthly Reflection")
      : () => onOpenLocked(
  "Monthly Reflection",
  "Presence, Professional, or Elite"
)
  }
/>  

<ReflectionHomeCard
  icon="quarterly"
  title="Quarterly Reflection"
  description="See how your choices and patterns are evolving."
  tierLabel={
  !advancedUnlocked
    ? "Presence • Professional • Elite"
    : undefined
}
  locked={!advancedUnlocked}
  onClick={
    advancedUnlocked
      ? () => onOpenComingSoon("Quarterly Reflection")
      : () => onOpenLocked(
  "Quarterly Reflection",
  "Presence, Professional, or Elite"
)
  }
/>

<ReflectionHomeCard
  icon="yearly"
  title="Yearly Reflection"
  description="Understand the larger story your year has been telling."
  tierLabel={
  !advancedUnlocked
    ? "Presence • Professional • Elite"
    : undefined
}
  locked={!advancedUnlocked}
  onClick={
    advancedUnlocked
      ? () => onOpenComingSoon("Yearly Reflection")
      : () => onOpenLocked(
  "Yearly Reflection",
  "Presence, Professional, or Elite"
)
  }
/>

<ReflectionHomeCard
  icon="portrait"
  title="Memory Portrait"
  description="A meaningful portrait of who you became this year."
  tierLabel={
    !portraitUnlocked
      ? "Professional • Elite"
      : undefined
  }
  locked={!portraitUnlocked}
  onClick={
    portraitUnlocked
      ? () => onOpenComingSoon("Memory Portrait")
      : () =>
          onOpenLocked(
            "Memory Portrait",
            "Professional or Elite"
          )
  }
/>
            </div>
          </div>

          <div className="mx-auto mt-6 max-w-md text-center">
            <div className="mb-2 flex items-center justify-center gap-2 text-[#7a8c69]">
              <LockIcon className="h-3.5 w-3.5" />

              <span className="text-[11px] font-semibold uppercase tracking-[0.16em]">
                Private to you
              </span>
            </div>

            <p className="text-xs leading-5 text-stone-500">
              Your reflections are created from your private conversations with
              Talkio and are never presented as scores or judgments.
            </p>
          </div>
        </div>
      </section>
    );
  }

  function ReflectionHomeCard({
    icon,
    title,
    description,
    tierLabel,
    locked = false,
    onClick,
  }: {
    icon: ReflectionIconName;
    title: string;
    description: string;
    tierLabel?: string;
    locked?: boolean;
    onClick?: () => void;
  }) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={
          locked
            ? `${title}, available with Talkio ${tierLabel}`
            : `Open ${title}`
        }
        className={`
          group
          relative
          flex min-h-[112px] w-full
          items-center gap-4
          overflow-hidden
          rounded-[24px]
          border
          px-4 py-4
          text-left
          transition-all
          duration-200
          ${
            locked
              ? `
                cursor-pointer active:scale-[0.985]
                border-stone-200/70
                bg-[#f8f5ef]/70
              `
              : `
                border-[#d8dfce]
                bg-gradient-to-br
                from-[#eef3e7]
                via-[#f5f7f0]
                to-white
                shadow-[0_9px_28px_rgba(95,113,72,0.10)]
                active:scale-[0.985]
              `
          }
        `}
      >
        {!locked ? (
          <div
            aria-hidden="true"
            className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-[#8da17c] to-[#c9ad67]"
          />
        ) : null}

        <div
          className={`
            flex h-[60px] w-[60px] shrink-0
            items-center justify-center
            rounded-[20px]
            border
            ${
              locked
                ? `
                  border-stone-200
                  bg-stone-100/80
                  text-stone-400
                `
                : `
                  border-[#d4ddc9]
                  bg-[#e3ebda]
                  text-[#637454]
                  shadow-inner
                `
            }
          `}
        >
          <ReflectionTypeIcon
            name={icon}
            className="h-7 w-7"
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2
              className={`
                text-[16px] font-semibold tracking-[-0.01em]
                ${
                  locked
                    ? "text-stone-500"
                    : "text-stone-900"
                }
              `}
            >
              {title}
            </h2>

            {tierLabel ? (
              <span
                className="
                  rounded-full
                  border border-[#e1d3ad]
                  bg-[#f4ead0]/80
                  px-2.5 py-1
                  text-[10px] font-semibold
                  uppercase tracking-[0.08em]
                  text-[#8a6d2c]
                "
              >
                {tierLabel}
              </span>
            ) : (
              <span
                className="
                  rounded-full
                  border border-[#cfdac4]
                  bg-[#e7eedf]
                  px-2.5 py-1
                  text-[10px] font-semibold
                  uppercase tracking-[0.08em]
                  text-[#627453]
                "
              >
                Available
              </span>
            )}
          </div>

          <p
            className={`
              mt-2 max-w-md
              text-[13px] leading-[1.55]
              ${
                locked
                  ? "text-stone-400"
                  : "text-stone-600"
              }
            `}
          >
            {description}
          </p>
        </div>

        <div
          aria-hidden="true"
          className={`
            flex h-9 w-9 shrink-0
            items-center justify-center
            rounded-full
            ${
              locked
                ? "bg-stone-100 text-stone-400"
                : "bg-white/80 text-[#68785a] shadow-sm"
            }
          `}
        >
          {locked ? (
            <LockIcon className="h-4 w-4" />
          ) : (
            <ChevronRightIcon className="h-5 w-5" />
          )}
        </div>
      </button>
    );
  }

  function ReflectionTypeIcon({
    name,
    className = "",
  }: {
    name: ReflectionIconName;
    className?: string;
  }) {
    if (name === "weekly") {
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className={className}
          aria-hidden="true"
        >
          <rect
            x="4"
            y="5"
            width="16"
            height="15"
            rx="3"
            stroke="currentColor"
            strokeWidth="1.8"
          />
          <path
            d="M8 3.5V7M16 3.5V7M4 9H20"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <path
            d="M8 13H10M14 13H16M8 17H10"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      );
    }

    if (name === "monthly") {
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className={className}
          aria-hidden="true"
        >
          <rect
            x="4"
            y="5"
            width="16"
            height="15"
            rx="3"
            stroke="currentColor"
            strokeWidth="1.8"
          />
          <path
            d="M8 3.5V7M16 3.5V7M4 9H20"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <circle cx="9" cy="14" r="1" fill="currentColor" />
          <circle cx="12" cy="14" r="1" fill="currentColor" />
          <circle cx="15" cy="14" r="1" fill="currentColor" />
          <circle cx="9" cy="17" r="1" fill="currentColor" />
          <circle cx="12" cy="17" r="1" fill="currentColor" />
        </svg>
      );
    }

    if (name === "quarterly") {
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className={className}
          aria-hidden="true"
        >
          <path
            d="M5 19V13M10 19V9M15 19V5M20 19V11"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <path
            d="M4 20H21"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      );
    }

    if (name === "yearly") {
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className={className}
          aria-hidden="true"
        >
          <path
            d="M4 18L9 11L12 15L16 8L21 18H4Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <path
            d="M4 20H21"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <circle
            cx="17.5"
            cy="5"
            r="1.5"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </svg>
      );
    }

    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className={className}
        aria-hidden="true"
      >
        <path
          d="M6 4.5H16.5C17.9 4.5 19 5.6 19 7V20H8C6.34 20 5 18.66 5 17V5.5C5 4.95 5.45 4.5 6 4.5Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path
          d="M8 4.5V20"
          stroke="currentColor"
          strokeWidth="1.8"
        />
        <path
          d="M11 9H16M11 12.5H16M11 16H14"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  function LockIcon({
    className = "",
  }: {
    className?: string;
  }) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className={className}
        aria-hidden="true"
      >
        <rect
          x="5"
          y="10"
          width="14"
          height="10"
          rx="2.5"
          stroke="currentColor"
          strokeWidth="1.8"
        />
        <path
          d="M8 10V7.5C8 5.29 9.79 3.5 12 3.5C14.21 3.5 16 5.29 16 7.5V10"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  function ChevronRightIcon({
    className = "",
  }: {
    className?: string;
  }) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className={className}
        aria-hidden="true"
      >
        <path
          d="M9 6L15 12L9 18"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  type ReflectionsPanelProps = {
    onBack: () => void;
  };

  export default function ReflectionsPanel({
    onBack,
  }: ReflectionsPanelProps) {

    const [reflectionView, setReflectionView] =
    useState<"home" | "weekly">("home");

    const [user, setUser] = useState<User | null>(null);
    const [authChecked, setAuthChecked] = useState(false);

    const [reflections, setReflections] = useState<
      WeeklyReflection[]
    >([]);

    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");

    const [tier, setTier] = useState<TalkioTier>("free");
    const [tierLoading, setTierLoading] = useState(true);

    const [lockedFeature, setLockedFeature] = useState<{
    title: string;
    requiredTier: string;
    } | null>(null);

    const [comingSoonFeature, setComingSoonFeature] =
    useState<string | null>(null);

    const loadReflections = useCallback(
      async (signedInUser: User) => {
        setLoading(true);
        setError("");

        try {
          const token = await getAuthToken(signedInUser);

          const response = await fetch(GET_REFLECTIONS_URL, {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/json",
            },
            cache: "no-store",
          });

          const data =
            await readResponseJson<ReflectionListResponse>(
              response
            );

          if (!response.ok || data.ok === false) {
            throw new Error(
              data.error || "Could not load your reflections."
            );
          }

          setReflections(
            Array.isArray(data.reflections)
              ? data.reflections
              : []
          );
        } catch (loadError) {
          console.error(
            "Failed to load weekly reflections:",
            loadError
          );

          setError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load your reflections."
          );
        } finally {
          setLoading(false);
        }
      },
      []
    );

    useEffect(() => {
      const auth = getFirebaseAuth();

      const unsubscribe = onAuthStateChanged(
        auth,
        (currentUser) => {
          setUser(currentUser);
          setAuthChecked(true);

          if (currentUser) {
  void (async () => {
    const resolvedTier = await resolveTalkioTier();

    setTier(resolvedTier);
    setTierLoading(false);

    if (resolvedTier !== "free") {
      await loadReflections(currentUser);
    } else {
      setReflections([]);
      setLoading(false);
    }
  })();
} else {
  setTier("free");
  setTierLoading(false);
  setReflections([]);
  setLoading(false);
}
        }
      );

      return unsubscribe;
    }, [loadReflections]);

    async function generateReflection() {
      if (!user || generating) return;

      setGenerating(true);
      setError("");
      setNotice("");

      try {
        const token = await getAuthToken(user);

        const response = await fetch(
          GENERATE_REFLECTION_URL,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({
              force: false,
            }),
          }
        );

        const data =
          await readResponseJson<ReflectionGenerationResponse>(
            response
          );

        if (!response.ok || data.ok === false) {
          throw new Error(
            data.error ||
              "Talkio could not create your reflection."
          );
        }

        if (
          data.outcome === "insufficient_activity" ||
          data.reflection?.status ===
            "insufficient_activity"
        ) {
          setNotice(
            "There is not enough conversation from the previous week yet. Keep talking naturally, and Talkio will reflect it back when there is enough to understand."
          );
        } else if (
          data.outcome === "already_exists"
        ) {
          setNotice(
            "Your reflection for this period is already ready."
          );
        } else {
          setNotice(
            "Your weekly reflection is ready."
          );
        }

        await loadReflections(user);
      } catch (generationError) {
        console.error(
          "Failed to generate weekly reflection:",
          generationError
        );

        setError(
          generationError instanceof Error
            ? generationError.message
            : "Talkio could not create your reflection."
        );
      } finally {
        setGenerating(false);
      }
    }

    const readyReflections = reflections.filter(
      (reflection) => reflection.status === "ready"
    );

    const latestReflection = readyReflections[0];

    if (reflectionView === "home") {
  return (
    <>
      <ReflectionsHome
        tier={tier}
        tierLoading={tierLoading}
        onBack={onBack}
        onOpenWeekly={() => setReflectionView("weekly")}
        onOpenLocked={(title, requiredTier) => {
          setLockedFeature({ title, requiredTier });
        }}
        onOpenComingSoon={(title) => {
          setComingSoonFeature(title);
        }}
      />

      {lockedFeature ? (
        <FeatureDialog
          title={lockedFeature.title}
          message={`${lockedFeature.title} is available with Talkio ${lockedFeature.requiredTier}.`}
          primaryLabel="View plans"
          onPrimary={() => {
            window.location.href = "/paywall";
          }}
          onClose={() => setLockedFeature(null)}
        />
      ) : null}

      {comingSoonFeature ? (
        <FeatureDialog
          title={comingSoonFeature}
          message={`${comingSoonFeature} is included with your plan and is coming soon.`}
          primaryLabel="Okay"
          onPrimary={() => setComingSoonFeature(null)}
          onClose={() => setComingSoonFeature(null)}
        />
      ) : null}
    </>
  );
}
    if (!authChecked || loading) {
    return (
      <section className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
        <div className="mx-auto w-full max-w-2xl">
          <ReflectionsHeader
    onBack={() => setReflectionView("home")}
    title="Weekly Reflection"
    subtitle="A clear look at your week."
  />

          <div className="rounded-3xl border border-stone-200 bg-white/70 p-6">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">
              Weekly Reflection
            </p>

            <div className="mt-5 flex items-center gap-3 text-sm text-stone-600">
              <span
                aria-hidden="true"
                className="h-5 w-5 animate-spin rounded-full border-2 border-stone-300 border-t-emerald-700"
              />

              Loading your reflections…
            </div>
          </div>
        </div>
      </section>
    );
  }

    if (!user) {
    return (
      <section className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
        <div className="mx-auto w-full max-w-2xl">
          <ReflectionsHeader
    onBack={() => setReflectionView("home")}
    title="Weekly Reflection"
    subtitle="A clear look at your week."
  />

          <div className="rounded-3xl border border-stone-200 bg-white/70 p-6">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">
              Weekly Reflection
            </p>

            <h2 className="mt-3 text-2xl font-semibold text-stone-900">
              Sign in to see your reflections.
            </h2>

            <p className="mt-3 text-sm leading-6 text-stone-600">
              Your reflections are private and connected to your Talkio account.
            </p>
          </div>
        </div>
      </section>
    );
  }

    return (
    <section className="min-h-0 flex-1 overflow-y-auto px-4 pb-8">
      <div className="mx-auto w-full max-w-2xl">
        <ReflectionsHeader
    onBack={() => setReflectionView("home")}
    title="Weekly Reflection"
    subtitle="A clear look at your week."
  />

        <div className="space-y-4">
          <div className="rounded-3xl border border-stone-200 bg-white/75 p-6 shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">
              Weekly Reflection
            </p>

            <h2 className="mt-3 text-2xl font-semibold text-stone-900">
              Your week, reflected back with care.
            </h2>

            <p className="mt-3 text-sm leading-6 text-stone-600">
              Talkio gently reflects on your conversations from the past week to help you understand yourself a little better, notice meaningful patterns, and move forward with greater clarity—without judgment or turning your honesty into a score.
            </p>
          </div>

          {error ? (
            <div
              role="alert"
              className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800"
            >
              {error}
            </div>
          ) : null}

          {notice ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
              {notice}
            </div>
          ) : null}

          {!latestReflection ? (
            <div className="rounded-3xl border border-stone-200 bg-white/70 p-6">
              <h3 className="text-lg font-semibold text-stone-900">
                No weekly reflection yet
              </h3>

              <p className="mt-2 text-sm leading-6 text-stone-600">
                For this first test, you can ask Talkio to
                prepare your previous week now.
              </p>

              <button
    type="button"
    onClick={generateReflection}
    disabled={generating}
    className="
      mt-5
      flex
      w-full
      items-center
      justify-center
      gap-2
      rounded-2xl
      bg-gradient-to-br
      from-[#D9B96E]
      to-[#C59A43]
      px-5
      py-3.5
      text-sm
      font-semibold
      text-[#342A18]
      shadow-[0_8px_24px_rgba(197,154,67,0.28)]
      transition-all
      duration-200
      hover:from-[#E0C47E]
      hover:to-[#B98C37]
      hover:shadow-[0_10px_28px_rgba(197,154,67,0.36)]
      active:scale-[0.98]
      disabled:cursor-not-allowed
      disabled:from-[#DDD0AA]
      disabled:to-[#CDBE96]
      disabled:text-[#756646]
      disabled:shadow-none
    "
  >
    <span
      aria-hidden="true"
      className={`text-lg text-emerald-700 ${
        generating ? "animate-pulse" : ""
      }`}
    >
      ✦
    </span>

    <span>
      {generating
        ? "Preparing your reflection…"
        : "Generate my weekly reflection"}
    </span>
  </button>
            </div>
          ) : (
            <>
              <article className="rounded-3xl border border-stone-200 bg-white/80 p-6 shadow-sm">
                <div className="border-b border-stone-200 pb-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
                    Looking back
                  </p>

                  <p className="mt-2 text-sm text-stone-500">
                    {formatReflectionPeriod(
                      latestReflection.periodStart,
                      latestReflection.periodEnd
                    )}
                  </p>
                </div>

                <p className="mt-5 whitespace-pre-wrap text-[15px] leading-7 text-stone-800">
                  {latestReflection.lookingBack}
                </p>
              </article>

              {latestReflection.whatWeighedOnYou?.length ? (
                <ReflectionSection
                  title="What weighed on you"
                  items={latestReflection.whatWeighedOnYou}
                />
              ) : null}

              {latestReflection.whatHelped?.length ? (
                <ReflectionSection
                  title="What helped"
                  items={latestReflection.whatHelped}
                />
              ) : null}

              {latestReflection.momentsThatMattered?.length ? (
                <ReflectionSection
                  title="Moments that mattered"
                  items={
                    latestReflection.momentsThatMattered
                  }
                />
              ) : null}

              {latestReflection.somethingToCarryForward ? (
                <TextReflectionCard
                  title="Something to carry forward"
                  text={
                    latestReflection.somethingToCarryForward
                  }
                />
              ) : null}

              {latestReflection.oneThingINoticed ? (
                <TextReflectionCard
                  title="One thing I noticed"
                  text={latestReflection.oneThingINoticed}
                />
              ) : null}

              <button
                type="button"
                onClick={() => void loadReflections(user)}
                disabled={loading || generating}
                className="w-full rounded-2xl border border-stone-300 bg-white/70 px-5 py-3 text-sm font-semibold text-stone-700 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                Refresh reflection
              </button>
            </>
          )}
              </div>
      </div>
    </section>
  );
  }

  function FeatureDialog({
  title,
  message,
  primaryLabel,
  onPrimary,
  onClose,
}: {
  title: string;
  message: string;
  primaryLabel: string;
  onPrimary: () => void;
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reflection-dialog-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 px-5 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-[28px] border border-stone-200 bg-[#fbf8f2] p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2
          id="reflection-dialog-title"
          className="text-xl font-semibold text-stone-900"
        >
          {title}
        </h2>

        <p className="mt-3 text-sm leading-6 text-stone-600">
          {message}
        </p>

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="h-12 flex-1 rounded-2xl border border-stone-300 bg-white text-sm font-semibold text-stone-700"
          >
            Not now
          </button>

          <button
            type="button"
            onClick={onPrimary}
            className="h-12 flex-1 rounded-2xl bg-[#78906f] text-sm font-semibold text-white"
          >
            {primaryLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

  function ReflectionSection({
    title,
    items,
  }: {
    title: string;
    items: string[];
  }) {
    return (
      <section className="rounded-3xl border border-stone-200 bg-white/70 p-6">
        <h3 className="text-base font-semibold text-stone-900">
          {title}
        </h3>

        <ul className="mt-4 space-y-3">
          {items.map((item, index) => (
            <li
              key={`${title}-${index}`}
              className="flex gap-3 text-sm leading-6 text-stone-700"
            >
              <span
                aria-hidden="true"
                className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-700"
              />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  function TextReflectionCard({
    title,
    text,
  }: {
    title: string;
    text: string;
  }) {
    return (
      <section className="rounded-3xl border border-stone-200 bg-white/70 p-6">
        <h3 className="text-base font-semibold text-stone-900">
          {title}
        </h3>

        <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-stone-700">
          {text}
        </p>
      </section>
    );
  }