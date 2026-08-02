"use client";

import { useCallback, useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase";

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

export default function ReflectionsPanel() {
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  const [reflections, setReflections] = useState<
    WeeklyReflection[]
  >([]);

  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

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
          void loadReflections(currentUser);
        } else {
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

  if (!authChecked || loading) {
    return (
      <section className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
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
      </section>
    );
  }

  if (!user) {
    return (
      <section className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
        <div className="rounded-3xl border border-stone-200 bg-white/70 p-6">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">
            Weekly Reflection
          </p>

          <h2 className="mt-3 text-2xl font-semibold text-stone-900">
            Sign in to see your reflections.
          </h2>

          <p className="mt-3 text-sm leading-6 text-stone-600">
            Your reflections are private and connected to
            your Talkio account.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="min-h-0 flex-1 overflow-y-auto px-4 pb-8">
      <div className="mx-auto w-full max-w-2xl space-y-4">
        <div className="rounded-3xl border border-stone-200 bg-white/75 p-6 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">
            Weekly Reflection
          </p>

          <h2 className="mt-3 text-2xl font-semibold text-stone-900">
            Your week, reflected back with care.
          </h2>

          <p className="mt-3 text-sm leading-6 text-stone-600">
            Talkio looks at the conversations from your
            previous week and gently reflects what seemed
            meaningful—without judging you or turning your
            honesty into a score.
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
              className="mt-5 w-full rounded-2xl bg-stone-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {generating
                ? "Preparing your reflection…"
                : "Generate my weekly reflection"}
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
    </section>
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