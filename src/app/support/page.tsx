export default function SupportPage() {
  return (
    <main className="min-h-screen bg-[#f5efe6] px-6 py-16 text-stone-900">
      <section className="mx-auto max-w-2xl rounded-3xl bg-white/70 p-8 shadow-sm">
        <a href="/" className="text-sm text-stone-500 hover:text-stone-800">
          ← Back to Talkio
        </a>

        <h1 className="mt-8 text-4xl font-semibold tracking-tight">
          Talkio Support
        </h1>

        <p className="mt-4 text-lg leading-8 text-stone-700">
          Need help with Talkio? We are here to assist you.
        </p>

        <div className="mt-8 space-y-4">
          <a
            href="mailto:support@talkiochat.com?subject=Talkio%20Support%20Request"
            className="block rounded-2xl border border-stone-200 bg-white p-5 shadow-sm transition hover:bg-stone-50"
          >
            <p className="font-semibold">Contact Support</p>
            <p className="mt-1 text-sm text-stone-500">
              support@talkiochat.com
            </p>
          </a>

          <a
            href="mailto:privacy@talkiochat.com?subject=Talkio%20Privacy%20Request"
            className="block rounded-2xl border border-stone-200 bg-white p-5 shadow-sm transition hover:bg-stone-50"
          >
            <p className="font-semibold">Privacy Requests</p>
            <p className="mt-1 text-sm text-stone-500">
              privacy@talkiochat.com
            </p>
          </a>

          <a
            href="mailto:hello@talkiochat.com?subject=Talkio%20General%20Question"
            className="block rounded-2xl border border-stone-200 bg-white p-5 shadow-sm transition hover:bg-stone-50"
          >
            <p className="font-semibold">General Questions</p>
            <p className="mt-1 text-sm text-stone-500">
              hello@talkiochat.com
            </p>
          </a>
        </div>

        <div className="mt-8 rounded-2xl bg-emerald-50 p-5 text-sm leading-6 text-emerald-800">
          Response time: 24–48 hours.
        </div>

        <div className="mt-8 flex gap-4 text-sm">
          <a href="/privacy" className="text-emerald-700 underline">
            Privacy Policy
          </a>
          <a href="/terms" className="text-emerald-700 underline">
            Terms of Use
          </a>
        </div>
      </section>
    </main>
  );
}