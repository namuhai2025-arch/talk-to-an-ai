"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, type User } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase";

import ReflectionDetail from "@/components/reflections/ReflectionDetail";
import { resolveTalkioTier, type TalkioTier } from "@/lib/subscription";

const FUNCTIONS_BASE_URL =
  "https://us-central1-talkio-production.cloudfunctions.net";

const GET_REFLECTIONS_URL = `${FUNCTIONS_BASE_URL}/getMyWeeklyReflections`;
const GENERATE_REFLECTION_URL = `${FUNCTIONS_BASE_URL}/generateMyWeeklyReflection`;

export type ReflectionItem = {
  text: string;
  sessionId?: string;
  messageId?: string;
  date?: string;
};

// COMPATIBLE SCHEMA: Supports both legacy string arrays and new rich object arrays
export type WeeklyReflection = {
  id?: string;
  status?: "ready" | "generating" | "failed" | "insufficient_activity";
  periodStart?: string;
  periodEnd?: string;

  lookingBack?: string;
  whatWeighedOnYou?: (string | ReflectionItem)[];
  whatHelped?: (string | ReflectionItem)[];
  momentsThatMattered?: (string | ReflectionItem)[];
  somethingToCarryForward?: string;
  oneThingINoticed?: string;

  generatedAt?: string;
};

type ReflectionListResponse = {
  ok?: boolean;
  reflections?: WeeklyReflection[];
  error?: string;
};

type ReflectionGenerationResponse = {
  ok?: boolean;
  outcome?: "generated" | "already_exists" | "insufficient_activity";
  reflection?: WeeklyReflection;
  error?: string;
};

async function getAuthToken(user: User): Promise<string> {
  return user.getIdToken();
}

async function readResponseJson<T>(response: Response): Promise<T> {
  const rawText = await response.text();
  if (!rawText) return {} as T;
  try {
    return JSON.parse(rawText) as T;
  } catch {
    throw new Error("Talkio received an invalid server response.");
  }
}

function formatReflectionPeriod(start?: string, end?: string): string {
  if (!start && !end) return "";
  const formatDate = (value?: string) => {
    if (!value) return "";
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(date);
  };
  const formattedStart = formatDate(start);
  const formattedEnd = formatDate(end);
  if (formattedStart && formattedEnd) return `${formattedStart} – ${formattedEnd}`;
  return formattedStart || formattedEnd;
}

// --- MAIN COMPONENT ---

export default function ReflectionsPanel({ onBack }: { onBack: () => void }) {
  const router = useRouter();

  const [reflectionView, setReflectionView] = useState<
    "home" | "weekly" | "monthly" | "quarterly" | "yearly" | "portrait"
  >("home");

  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [reflections, setReflections] = useState<WeeklyReflection[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [weeklyGenerationChecked, setWeeklyGenerationChecked] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [tier, setTier] = useState<TalkioTier>("free");
  const [tierLoading, setTierLoading] = useState(true);
  const [lockedFeature, setLockedFeature] = useState<{
    title: string;
    requiredTier: string;
  } | null>(null);
  const [comingSoonFeature, setComingSoonFeature] = useState<string | null>(null);

  const handleNavigateToChat = (item: ReflectionItem) => {
    if (item.sessionId) {
      router.push(`/chat?session=${item.sessionId}`);
    } else if (item.date) {
      router.push(`/chat?date=${item.date}`);
    }
  };

  const loadReflections = useCallback(async (signedInUser: User) => {
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

      const data = await readResponseJson<ReflectionListResponse>(response);

      if (!response.ok || data.ok === false) {
        throw new Error(data.error || "Could not load your reflections.");
      }

      setReflections(Array.isArray(data.reflections) ? data.reflections.slice(0, 5) : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load your reflections.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const auth = getFirebaseAuth();
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
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
    });
    return unsubscribe;
  }, [loadReflections]);

  async function generateReflection(force: boolean = false) {
    if (!user || generating) return;

    if (!force) {
      const lastCheck = localStorage.getItem(`last_reflection_check_${user.uid}`);
      const fourHours = 4 * 60 * 60 * 1000;
      if (lastCheck && Date.now() - parseInt(lastCheck, 10) < fourHours && reflections.length > 0) {
        return;
      }
    }

    setGenerating(true);
    setError("");
    setNotice("");

    try {
      const token = await getAuthToken(user);
      const response = await fetch(GENERATE_REFLECTION_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ force }),
      });

      const data = await readResponseJson<ReflectionGenerationResponse>(response);

      localStorage.setItem(`last_reflection_check_${user.uid}`, Date.now().toString());

      if (!response.ok || data.ok === false) {
        throw new Error(data.error || "Talkio could not create your reflection.");
      }

      if (data.outcome === "insufficient_activity" || data.reflection?.status === "insufficient_activity") {
        setNotice("Keep talking naturally, and Talkio will reflect it back when there is enough activity for this week.");
      } else if (data.outcome === "already_exists") {
        setNotice("You are all caught up! Your reflection for the latest period is already displayed.");
      } else {
        setNotice("Your latest reflection has been updated.");
      }

      await loadReflections(user);
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : "Talkio could not create your reflection.");
    } finally {
      setGenerating(false);
    }
  }

  useEffect(() => {
    if (
      reflectionView !== "weekly" ||
      !user ||
      tier === "free" ||
      tierLoading ||
      loading ||
      generating ||
      weeklyGenerationChecked
    ) {
      return;
    }
    setWeeklyGenerationChecked(true);
    void generateReflection();
  }, [reflectionView, user, tier, tierLoading, loading, generating, weeklyGenerationChecked]);

  const readyReflections = reflections.filter((r) => r.status === "ready");
  const latestReflection = readyReflections[0];

  if (reflectionView === "home") {
    return (
      <>
        <ReflectionsHome
          tier={tier}
          tierLoading={tierLoading}
          onBack={onBack}
          onOpenWeekly={() => {
            setWeeklyGenerationChecked(false);
            setReflectionView("weekly");
          }}
          onOpenMonthly={() => setReflectionView("monthly")}
          onOpenLocked={(title, requiredTier) => setLockedFeature({ title, requiredTier })}
          onOpenComingSoon={(title) => setComingSoonFeature(title)}
        />
        {lockedFeature && (
          <FeatureDialog
            title={lockedFeature.title}
            message={`${lockedFeature.title} is available with Talkio ${lockedFeature.requiredTier}.`}
            primaryLabel="View plans"
            onPrimary={() => { window.location.href = "/paywall"; }}
            onClose={() => setLockedFeature(null)}
          />
        )}
        {comingSoonFeature && (
          <FeatureDialog
            title={comingSoonFeature}
            message={`${comingSoonFeature} is included with your plan and is coming soon.`}
            primaryLabel="Okay"
            onPrimary={() => setComingSoonFeature(null)}
            onClose={() => setComingSoonFeature(null)}
          />
        )}
      </>
    );
  }

  if (reflectionView === "monthly") {
    return (
      <ReflectionDetail
        title="Monthly Reflection"
        subtitle="Notice the emotions and themes that keep returning."
        description="Your monthly reflection is quietly taking shape."
        status="preparing"
        currentDays={18}
        totalDays={30}
        expectedDate="At the end of this month"
        discoveries={[
          "Recurring emotions and concerns",
          "Relationship patterns that stood out",
          "Wins and progress you may have overlooked",
          "Themes that kept returning",
        ]}
        onBack={() => setReflectionView("home")}
      />
    );
  }

  if (!authChecked || loading) {
    return (
      <section className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
        <div className="mx-auto w-full max-w-2xl">
          <ReflectionsHeader onBack={() => setReflectionView("home")} title="Weekly Reflection" subtitle="A clear look at your week." />
          <div className="rounded-3xl border border-stone-200 bg-white/70 p-6">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">Weekly Reflection</p>
            <div className="mt-5 flex items-center gap-3 text-sm text-stone-600">
              <span aria-hidden="true" className="h-5 w-5 animate-spin rounded-full border-2 border-stone-300 border-t-emerald-700" />
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
          <ReflectionsHeader onBack={() => setReflectionView("home")} title="Weekly Reflection" subtitle="A clear look at your week." />
          <div className="rounded-3xl border border-stone-200 bg-white/70 p-6">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">Weekly Reflection</p>
            <h2 className="mt-3 text-2xl font-semibold text-stone-900">Sign in to see your reflections.</h2>
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
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">
                  Weekly Reflection
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-stone-900">
                  Your week, reflected back with care.
                </h2>
              </div>
              <button
                type="button"
                disabled={generating}
                onClick={() => void generateReflection(true)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 shadow-sm transition hover:bg-stone-50 active:scale-95 disabled:opacity-50"
              >
                <svg
                  className={`h-3.5 w-3.5 ${generating ? "animate-spin" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                {generating ? "Updating..." : "Update"}
              </button>
            </div>
            <p className="mt-3 text-sm leading-6 text-stone-600">
              Talkio gently reflects on your conversations from the past week to help you understand yourself a little better, notice meaningful patterns, and move forward with greater clarity.
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800"
            >
              {error}
            </div>
          )}

          {notice && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
              {notice}
            </div>
          )}

          {generating && (
            <div className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-800 animate-pulse">
              ✦ Talkio is looking through your week now...
            </div>
          )}

          {!latestReflection && !generating ? (
            <div className="rounded-3xl border border-stone-200 bg-white/70 p-6">
              <h3 className="text-lg font-semibold text-stone-900">
                No weekly reflection yet
              </h3>
              <p className="mt-2 text-sm leading-6 text-stone-600">
                Talk more with Talkio to unlock your weekly summary.
              </p>
              <button
                type="button"
                onClick={() => void generateReflection(true)}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-[#D9B96E] to-[#C59A43] px-5 py-3.5 text-sm font-semibold text-[#342A18] shadow-sm transition hover:from-[#E0C47E] hover:to-[#B98C37]"
              >
                <span>Generate my weekly reflection</span>
              </button>
            </div>
          ) : latestReflection ? (
            <>
              <article className="rounded-3xl border border-stone-200 bg-white/80 p-6 shadow-sm">
                <div className="border-b border-stone-200 pb-4">
                  <div className="flex items-center gap-3">
                    <ReflectionSectionIcon type="lookingBack" />
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
                        Looking back
                      </p>
                      <p className="mt-1 text-sm text-stone-500">
                        {formatReflectionPeriod(
                          latestReflection.periodStart,
                          latestReflection.periodEnd
                        )}
                      </p>
                    </div>
                  </div>
                </div>
                <p className="mt-5 whitespace-pre-wrap text-[15px] leading-7 text-stone-800">
                  {latestReflection.lookingBack}
                </p>
              </article>

              {latestReflection.whatWeighedOnYou &&
                latestReflection.whatWeighedOnYou.length > 0 && (
                  <ReflectionSection
                    icon="weighed"
                    title="What weighed on you"
                    items={latestReflection.whatWeighedOnYou}
                    onNavigateToChat={handleNavigateToChat}
                  />
                )}

              {latestReflection.whatHelped &&
                latestReflection.whatHelped.length > 0 && (
                  <ReflectionSection
                    icon="helped"
                    title="What helped"
                    items={latestReflection.whatHelped}
                    onNavigateToChat={handleNavigateToChat}
                  />
                )}

              {latestReflection.momentsThatMattered &&
                latestReflection.momentsThatMattered.length > 0 && (
                  <ReflectionSection
                    icon="moments"
                    title="Moments that mattered"
                    items={latestReflection.momentsThatMattered}
                    onNavigateToChat={handleNavigateToChat}
                  />
                )}

              {latestReflection.somethingToCarryForward && (
                <GoldenLineCard
                  text={latestReflection.somethingToCarryForward}
                />
              )}

              {latestReflection.oneThingINoticed && (
                <TextReflectionCard
                  icon="noticed"
                  title="One thing I noticed"
                  text={latestReflection.oneThingINoticed}
                />
              )}
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}

// --- HELPER UI COMPONENTS ---

function ReflectionsHeader({ onBack, title, subtitle }: { onBack: () => void; title: string; subtitle?: string }) {
  return (
    <div className="mb-5 flex items-start gap-3">
      <button
        type="button"
        onClick={onBack}
        aria-label="Go back"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-stone-200 bg-white/80 text-xl text-stone-700 shadow-sm transition active:scale-95"
      >
        ←
      </button>
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-stone-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm leading-5 text-stone-500">{subtitle}</p>}
      </div>
    </div>
  );
}

type ReflectionIconName = "weekly" | "monthly" | "quarterly" | "yearly" | "portrait";

function ReflectionsHome({
  tier,
  tierLoading,
  onBack,
  onOpenWeekly,
  onOpenMonthly,
  onOpenLocked,
  onOpenComingSoon,
}: {
  tier: TalkioTier;
  tierLoading: boolean;
  onBack: () => void;
  onOpenWeekly: () => void;
  onOpenMonthly: () => void;
  onOpenLocked: (title: string, requiredTier: string) => void;
  onOpenComingSoon: (title: string) => void;
}) {
  const weeklyUnlocked = !tierLoading && tier !== "free";
  const showAdvancedReflections = !tierLoading && (tier === "presence" || tier === "professional" || tier === "elite");
  const showMemoryPortrait = !tierLoading && (tier === "professional" || tier === "elite");

  return (
    <section className="min-h-0 flex-1 overflow-y-auto px-4 pb-10">
      <div className="mx-auto w-full max-w-2xl">
        <ReflectionsHeader onBack={onBack} title="Your reflections" subtitle="See patterns. Understand more. Grow, one step at a time." />
        <div className="rounded-[30px] border border-stone-200/80 bg-white/35 p-3 shadow-[0_16px_50px_rgba(69,58,42,0.06)] backdrop-blur-sm">
          <div className="space-y-2">
            <ReflectionHomeCard icon="weekly" title="Weekly Reflection" description="A thoughtful look back at what shaped your week." locked={!weeklyUnlocked} onClick={weeklyUnlocked ? onOpenWeekly : () => onOpenLocked("Weekly Reflection", "Companion")} />
            {showAdvancedReflections && (
              <>
                <ReflectionHomeCard icon="monthly" title="Monthly Reflection" description="Notice the emotions and themes that keep returning." locked={false} onClick={onOpenMonthly} />
                <ReflectionHomeCard icon="quarterly" title="Quarterly Reflection" description="See how your choices and patterns are evolving." locked={false} onClick={() => onOpenComingSoon("Quarterly Reflection")} />
                <ReflectionHomeCard icon="yearly" title="Yearly Reflection" description="Understand the larger story your year has been telling." locked={false} onClick={() => onOpenComingSoon("Yearly Reflection")} />
              </>
            )}
            {showMemoryPortrait && (
              <ReflectionHomeCard icon="portrait" title="Memory Portrait" description="A meaningful portrait of who you became this year." locked={false} onClick={() => onOpenComingSoon("Memory Portrait")} />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function ReflectionHomeCard({
  icon,
  title,
  description,
  locked = false,
  onClick,
}: {
  icon: ReflectionIconName;
  title: string;
  description: string;
  locked?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative flex min-h-[112px] w-full items-center gap-4 overflow-hidden rounded-[24px] border px-4 py-4 text-left transition-all duration-200 ${locked ? "border-stone-200/70 bg-[#f8f5ef]/70" : "border-[#d8dfce] bg-gradient-to-br from-[#eef3e7] via-[#f5f7f0] to-white shadow-sm"}`}
    >
      <div className={`flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-[20px] border ${locked ? "border-stone-200 bg-stone-100/80 text-stone-400" : "border-[#d4ddc9] bg-[#e3ebda] text-[#637454] shadow-inner"}`}>
        <ReflectionTypeIcon name={icon} className="h-7 w-7" />
      </div>
      <div className="min-w-0 flex-1">
        <h2 className={`text-[16px] font-semibold tracking-[-0.01em] ${locked ? "text-stone-500" : "text-stone-900"}`}>{title}</h2>
        <p className={`mt-2 max-w-md text-[13px] leading-[1.55] ${locked ? "text-stone-400" : "text-stone-600"}`}>{description}</p>
      </div>
    </button>
  );
}

function ReflectionTypeIcon({ name, className = "" }: { name: ReflectionIconName; className?: string }) {
  if (name === "weekly") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
        <rect x="4" y="5" width="16" height="15" rx="3" stroke="currentColor" strokeWidth="1.8" />
        <path d="M8 3.5V7M16 3.5V7M4 9H20M8 13H10M14 13H16M8 17H10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  return <svg viewBox="0 0 24 24" fill="none" className={className}><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8"/></svg>;
}

function FeatureDialog({ title, message, primaryLabel, onPrimary, onClose }: { title: string; message: string; primaryLabel: string; onPrimary: () => void; onClose: () => void; }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 px-5 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-sm rounded-[28px] border border-stone-200 bg-[#fbf8f2] p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-xl font-semibold text-stone-900">{title}</h2>
        <p className="mt-3 text-sm leading-6 text-stone-600">{message}</p>
        <div className="mt-6 flex gap-3">
          <button type="button" onClick={onClose} className="h-12 flex-1 rounded-2xl border border-stone-300 bg-white text-sm font-semibold text-stone-700">Not now</button>
          <button type="button" onClick={onPrimary} className="h-12 flex-1 rounded-2xl bg-[#78906f] text-sm font-semibold text-white">{primaryLabel}</button>
        </div>
      </div>
    </div>
  );
}

type ReflectionContentIcon = "lookingBack" | "weighed" | "helped" | "moments" | "strengths" | "strengthen" | "gratitude" | "pattern" | "noticed" | "standout" | "golden";

function normalizeItem(item: string | ReflectionItem): ReflectionItem {
  if (typeof item === "string") {
    return { text: item };
  }
  return item;
}

function ReflectionSection({
  icon,
  title,
  items,
  onNavigateToChat,
}: {
  icon: ReflectionContentIcon;
  title: string;
  items: (string | ReflectionItem)[];
  onNavigateToChat?: (item: ReflectionItem) => void;
}) {
  return (
    <section className="rounded-3xl border border-stone-200 bg-white/70 p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <ReflectionSectionIcon type={icon} />
        <h3 className="text-base font-semibold text-stone-900">{title}</h3>
      </div>
      <ul className="mt-5 space-y-2">
        {items.map((rawItem, index) => {
          const item = normalizeItem(rawItem);
          const hasLink = Boolean(item.sessionId || item.date);

          return (
            <li key={index}>
              {hasLink ? (
                <button
                  type="button"
                  onClick={() => onNavigateToChat?.(item)}
                  className="group flex w-full items-start gap-3 rounded-2xl p-2.5 text-left transition hover:bg-stone-100/80 active:scale-[0.99]"
                >
                  <span
                    aria-hidden="true"
                    className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#78906f] group-hover:scale-125 transition-transform"
                  />
                  <div className="flex-1">
                    <span className="text-sm leading-6 text-stone-800 font-normal">
                      {item.text}
                    </span>
                    <span className="mt-0.5 block text-xs font-medium text-emerald-700 opacity-90">
                      View conversation {item.date ? `from ${item.date}` : ""} →
                    </span>
                  </div>
                </button>
              ) : (
                <div className="flex gap-3 px-2.5 py-1 text-sm leading-6 text-stone-700">
                  <span
                    aria-hidden="true"
                    className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#78906f]"
                  />
                  <span>{item.text}</span>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function TextReflectionCard({ icon, title, text }: { icon: ReflectionContentIcon; title: string; text: string }) {
  return (
    <section className="rounded-3xl border border-stone-200 bg-white/70 p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <ReflectionSectionIcon type={icon} />
        <h3 className="text-base font-semibold text-stone-900">{title}</h3>
      </div>
      <p className="mt-5 whitespace-pre-wrap text-sm leading-7 text-stone-700">{text}</p>
    </section>
  );
}

function GoldenLineCard({ text }: { text: string }) {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-[#e5ce8d] bg-gradient-to-br from-[#fff9e8] via-[#fbf4df] to-[#f7edcf] px-6 py-7 shadow-sm">
      <div className="flex items-center gap-3">
        <ReflectionSectionIcon type="golden" />
        <p className="text-xs font-semibold uppercase tracking-[0.17em] text-[#9a792e]">Something to carry forward</p>
      </div>
      <div className="mt-5 border-l-2 border-[#d9b96e] pl-4">
        <p className="text-[18px] font-semibold leading-8 tracking-[-0.01em] text-[#4a3b22]">“{text}”</p>
      </div>
    </section>
  );
}

function ReflectionSectionIcon({ type }: { type: ReflectionContentIcon }) {
  const styles: Record<ReflectionContentIcon, string> = {
    lookingBack: "border-[#d8dfce] bg-[#e8eee1] text-[#637454]",
    weighed: "border-[#e2d7cc] bg-[#f3ebe4] text-[#8a6954]",
    helped: "border-[#d7e2ce] bg-[#e9f0e2] text-[#607653]",
    moments: "border-[#e8dbb7] bg-[#f8f0d9] text-[#a17d2f]",
    strengths: "border-[#d7e2ce] bg-[#e9f0e2] text-[#607653]",
    strengthen: "border-[#d8dde4] bg-[#edf0f3] text-[#66717d]",
    gratitude: "border-[#ead9a8] bg-[#fbf1d7] text-[#b58a28]",
    pattern: "border-[#d8dfce] bg-[#edf1e8] text-[#68785a]",
    noticed: "border-[#ddd6e5] bg-[#f0ebf4] text-[#756683]",
    standout: "border-[#d5dfca] bg-[#e6edde] text-[#607653]",
    golden: "border-[#e6cf8e] bg-[#faedc8] text-[#a77e24]",
  };
  return (
    <span aria-hidden="true" className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border ${styles[type]}`}>
      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5"><circle cx="12" cy="12" r="6" stroke="currentColor" strokeWidth="1.8" /></svg>
    </span>
  );
}