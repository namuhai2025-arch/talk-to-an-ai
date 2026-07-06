export default function ProjectSunriseHome() {
  return (
    <main className="min-h-screen bg-[#f7f1e8] text-[#171717]">
      <nav className="fixed left-0 right-0 top-0 z-50 border-b border-stone-200/60 bg-[#f7f1e8]/85 px-6 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <a href="/home-v2" className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm">
              🌅
            </span>
            <span className="text-lg font-semibold tracking-[-0.03em]">
              Talkio
            </span>
          </a>

          <div className="hidden items-center gap-8 text-sm font-medium text-stone-600 md:flex">
            <a href="#reflections">Reflections</a>
            <a href="#your-story">Your Story</a>
            <a href="/privacy">Privacy</a>
            <a href="/download">Download</a>
          </div>

          <a
            href="/download"
            className="hidden rounded-full bg-stone-950 px-5 py-2.5 text-sm font-semibold text-white md:block"
          >
            Begin your story
          </a>
        </div>
      </nav>

      <section className="relative overflow-hidden px-6 pb-24 pt-36 md:pt-40">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_35%,rgba(216,192,138,0.24),transparent_38%)]" />

        <div className="relative mx-auto grid min-h-[78vh] max-w-7xl items-center gap-14 lg:grid-cols-[1fr_0.9fr]">
          <div>
            <div className="mb-8 flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-sm">
                🌅
              </span>
              <p className="text-sm font-semibold uppercase tracking-[0.32em] text-[#78906f]">
                Talkio Reflect
              </p>
            </div>

            <h1 className="max-w-3xl text-6xl font-semibold leading-[0.92] tracking-[-0.075em] text-stone-950 md:text-8xl">
              Some thoughts are too heavy to carry alone.
            </h1>

            <p className="mt-10 max-w-2xl text-xl leading-9 text-stone-600 md:text-2xl md:leading-10">
              A quiet place to let it out, understand yourself more clearly,
              and remember the story you are already living.
            </p>

            <div className="mt-12 flex flex-col gap-4 sm:flex-row sm:items-center">
              <a
                href="/download"
                className="flex min-h-[58px] items-center justify-center rounded-xl bg-black px-6 py-3 text-white shadow-sm"
              >
                <span className="mr-3 text-3xl leading-none"></span>
                <span className="text-left leading-tight">
                  <span className="block text-[11px] font-medium">
                    Download on the
                  </span>
                  <span className="block text-xl font-semibold">
                    App Store
                  </span>
                </span>
              </a>

              <a
                href="/download"
                className="flex min-h-[58px] items-center justify-center rounded-xl border border-stone-300 bg-white/75 px-6 py-3 text-stone-950 shadow-sm"
              >
                <span className="mr-3 text-2xl leading-none">▶</span>
                <span className="text-left leading-tight">
                  <span className="block text-[11px] font-medium">
                    Get it on
                  </span>
                  <span className="block text-xl font-semibold">
                    Google Play
                  </span>
                </span>
              </a>

              <a
                href="#reflections"
                className="flex min-h-[58px] items-center justify-center rounded-xl border border-stone-300 bg-white/60 px-6 py-3 text-base font-semibold text-stone-900 shadow-sm"
              >
                See Reflections
              </a>
            </div>
          </div>

          <div className="mx-auto w-full max-w-lg lg:max-w-xl">
            <div className="relative">
              <div className="absolute -inset-12 rounded-full bg-[#d8c08a]/30 blur-3xl" />

              <img
                src="/project-sunrise-phone.png"
                alt="Talkio conversation preview"
                className="relative w-full rounded-[2.8rem] shadow-2xl shadow-stone-400/40"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 py-32">
        <div className="mx-auto max-w-4xl text-center">
          <p className="text-5xl font-semibold leading-tight tracking-[-0.06em] text-stone-950 md:text-7xl">
            Sometimes, we don&apos;t need perfect advice.
          </p>

          <p className="mx-auto mt-10 max-w-2xl text-xl leading-9 text-stone-600">
            We simply need somewhere safe to put down what we&apos;ve been
            carrying for a while.
          </p>
        </div>
      </section>

      <section id="reflections" className="bg-white/55 px-6 py-32">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-4xl text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.32em] text-[#78906f]">
              Reflections
            </p>

            <h2 className="mt-6 text-5xl font-semibold leading-tight tracking-[-0.06em] text-stone-950 md:text-7xl">
              Some conversations help today. Others help you understand the year.
            </h2>

            <p className="mt-8 text-xl leading-9 text-stone-600">
              Talkio helps you notice the patterns, changes, and quiet growth
              that are easy to miss while life is happening.
            </p>

            <p className="mt-6 text-lg font-medium text-stone-800">
              Every conversation becomes a page. Every reflection becomes a
              chapter.
            </p>
          </div>

          <div className="mt-20 grid gap-5 md:grid-cols-4">
            {[
              ["Today", "You let it out."],
              ["This Week", "You notice patterns."],
              ["This Month", "You understand yourself better."],
              ["This Year", "You see who you became."],
            ].map(([title, body]) => (
              <div
                key={title}
                className="rounded-[2rem] border border-stone-200 bg-[#f7f1e8] p-8 shadow-sm"
              >
                <p className="text-sm font-semibold text-[#78906f]">{title}</p>
                <p className="mt-6 text-3xl font-semibold leading-tight tracking-[-0.04em] text-stone-950">
                  {body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="your-story" className="px-6 py-36">
        <div className="mx-auto grid max-w-7xl items-center gap-16 lg:grid-cols-2">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.32em] text-[#78906f]">
              Your Story
            </p>

            <h2 className="mt-6 text-5xl font-semibold leading-tight tracking-[-0.06em] text-stone-950 md:text-7xl">
              Every December 31, receive the volume of the story you spent the
              year writing.
            </h2>

            <p className="mt-8 text-xl leading-9 text-stone-600">
              Not chat logs. Not statistics. A thoughtful reflection on your
              year — built from the conversations you chose to have throughout
              it.
            </p>
          </div>

          <div className="mx-auto w-full max-w-md rounded-[2.5rem] bg-stone-950 p-10 text-[#f7f1e8] shadow-2xl shadow-stone-400/30">
            <p className="text-sm uppercase tracking-[0.32em] text-[#d8c08a]">
              Volume I
            </p>

            <h3 className="mt-24 text-6xl font-semibold tracking-[-0.06em]">
              Your Story
            </h3>

            <p className="mt-5 text-3xl text-stone-300">2026</p>

            <div className="mt-28 border-t border-white/20 pt-7">
              <p className="text-base leading-7 text-stone-300">
                A year of becoming. Written by you. Remembered with Talkio.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[#eef0e8] px-6 py-32">
        <div className="mx-auto max-w-5xl text-center">
          <h2 className="text-5xl font-semibold tracking-[-0.06em] text-stone-950 md:text-7xl">
            Some stories are meant to stay between the two of you.
          </h2>

          <div className="mt-14 grid gap-5 md:grid-cols-3">
            {[
              [
                "Private",
                "Your conversations are treated with care.",
              ],
              [
                "Secure",
                "Built for thoughts you choose to share.",
              ],
              [
                "Delete anytime",
                "You stay in control of your account and data.",
              ],
            ].map(([title, body]) => (
              <div key={title} className="rounded-[2rem] bg-white/70 p-8">
                <p className="text-xl font-semibold text-stone-950">{title}</p>
                <p className="mt-4 leading-7 text-stone-600">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="download" className="flex min-h-[85vh] items-center justify-center px-6 py-32 text-center">
        <div className="mx-auto max-w-4xl">
          <p className="text-6xl font-semibold leading-[0.95] tracking-[-0.075em] text-stone-950 md:text-8xl">
            Every story begins with a single page.
          </p>

          <p className="mx-auto mt-10 max-w-xl text-xl leading-9 text-stone-600">
            Begin yours with Talkio.
          </p>

          <div className="mt-12 flex flex-col justify-center gap-4 sm:flex-row">
            <a
              href="/download"
              className="flex min-h-[58px] items-center justify-center rounded-xl bg-black px-6 py-3 text-white shadow-sm"
            >
              <span className="mr-3 text-3xl leading-none"></span>
              <span className="text-left leading-tight">
                <span className="block text-[11px] font-medium">
                  Download on the
                </span>
                <span className="block text-xl font-semibold">App Store</span>
              </span>
            </a>

            <a
              href="/download"
              className="flex min-h-[58px] items-center justify-center rounded-xl border border-stone-300 bg-white/75 px-6 py-3 text-stone-950 shadow-sm"
            >
              <span className="mr-3 text-2xl leading-none">▶</span>
              <span className="text-left leading-tight">
                <span className="block text-[11px] font-medium">
                  Get it on
                </span>
                <span className="block text-xl font-semibold">
                  Google Play
                </span>
              </span>
            </a>
          </div>

          <footer className="mt-20 flex flex-wrap justify-center gap-6 text-sm text-stone-500">
            <a href="/privacy">Privacy</a>
            <a href="/terms">Terms</a>
            <a href="/support">Support</a>
            <a href="/account-deletion">Delete Account</a>
          </footer>
        </div>
      </section>
    </main>
  );
}