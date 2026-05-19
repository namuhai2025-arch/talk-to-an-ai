"use client";

export default function SettingsPage() {
  return (
    <main className="min-h-screen bg-stone-50 px-5 py-6">
      <div className="mx-auto max-w-md">
        <button
          type="button"
          onClick={() => (window.location.href = "/")}
          className="mb-6 text-sm text-stone-500 hover:text-stone-800"
        >
          ← Back to Talkio
        </button>

        <h1 className="text-3xl font-semibold tracking-tight text-stone-900">
          Settings
        </h1>

        <p className="mt-1 text-sm text-stone-500">
          Control your account and conversation experience.
        </p>

        <section className="mt-8 rounded-3xl bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-emerald-600">
            Plan
          </p>

          <div className="mt-2 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-stone-900">
              Free Plan
            </h2>

            <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs text-emerald-700">
              Current
            </span>
          </div>

          <p className="mt-1 text-sm font-medium text-emerald-600">
            Upgrade to unlock unlimited conversations
          </p>

          <p className="mt-2 text-sm leading-6 text-stone-500">
            Use Talkio freely until your daily limit. Upgrade anytime when you
            want to keep chatting.
          </p>

          <button
            type="button"
            onClick={() => (window.location.href = "/paywall")}
            className="mt-5 w-full rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-white shadow-md transition-all hover:bg-emerald-600 hover:shadow-lg"
          >
            Upgrade to Paid
          </button>
        </section>

        <section className="mt-6 overflow-hidden rounded-3xl bg-white shadow-sm">
          <button
            type="button"
            onClick={() => {
  localStorage.setItem("openNicknamePrompt", "true");
  window.location.href = "/";
}}
            className="flex w-full items-center justify-between px-5 py-4 text-left transition hover:bg-stone-50"
          >
            <div>
              <p className="font-medium text-stone-900">Nickname</p>
              <p className="mt-1 text-sm text-stone-500">
                Personalize how Talkio addresses you.
              </p>
            </div>
            <span className="text-stone-400">›</span>
          </button>

          <div className="mx-5 border-t border-stone-100" />

          <button
  type="button"
  onClick={() => (window.location.href = "/settings/account")}
  className="flex w-full items-center justify-between px-5 py-4 text-left transition hover:bg-stone-50"
>
            <div>
              <p className="font-medium text-stone-900">Account</p>
              <p className="mt-1 text-sm text-stone-500">
                Sign in, sign out, or delete account data.
              </p>
            </div>
            <span className="text-stone-400">›</span>
          </button>
        </section>

        <section className="mt-6 overflow-hidden rounded-3xl bg-white shadow-sm">
  <button
    type="button"
    onClick={async () => {
      const shareData = {
        title: "Talkio",
        text: "Talkio is a calm AI companion that listens and helps you think clearly.",
        url: "https://talkiochat.com",
      };

      try {
        if (navigator.share) {
          await navigator.share(shareData);
        } else {
          await navigator.clipboard.writeText(shareData.url);
          alert("Talkio link copied to clipboard.");
        }
      } catch (err) {
        console.log(err);
      }
    }}
    className="flex w-full items-center justify-between px-5 py-4 text-left transition hover:bg-stone-50"
  >
    <div>
      <p className="font-medium text-stone-900">Share Talkio</p>

      <p className="mt-1 text-sm text-stone-500">
        Invite someone to try Talkio.
      </p>
    </div>

    <span className="text-stone-400">↗</span>
  </button>
</section>

        <p className="mt-8 text-center text-xs leading-5 text-stone-400">
          Talkio is an AI conversation tool, not emergency or medical care.
        </p>
      </div>
    </main>
  );
}