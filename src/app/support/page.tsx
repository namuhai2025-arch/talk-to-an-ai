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
          Questions, subscriptions, privacy requests, or account support — we're
          here to help.
        </p>

        <div className="mt-6 rounded-2xl bg-stone-50 p-5 text-sm leading-7 text-stone-700">
          <p className="font-semibold text-stone-900">How can we help?</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Subscription questions</li>
            <li>Billing issues</li>
            <li>Account access</li>
            <li>Privacy requests</li>
            <li>General Talkio support</li>
          </ul>
        </div>

        <div className="mt-8 space-y-4">
          <a
            href="mailto:support@talkiochat.com?subject=Talkio%20Support%20Request"
            className="block rounded-2xl border border-stone-200 bg-white p-5 shadow-sm transition hover:bg-stone-50"
          >
            <p className="font-semibold">Contact Support</p>
            <p className="mt-1 text-sm text-stone-500">
              Tap to email support@talkiochat.com
            </p>
          </a>

          <a
            href="mailto:support@talkiochat.com?subject=Talkio%20Subscription%20Support"
            className="block rounded-2xl border border-stone-200 bg-white p-5 shadow-sm transition hover:bg-stone-50"
          >
            <p className="font-semibold">Subscription Support</p>
            <p className="mt-1 text-sm text-stone-500">
              Questions about Companion subscriptions, billing, renewals, or
              cancellations.
            </p>
          </a>

          <a
            href="mailto:privacy@talkiochat.com?subject=Talkio%20Privacy%20Request"
            className="block rounded-2xl border border-stone-200 bg-white p-5 shadow-sm transition hover:bg-stone-50"
          >
            <p className="font-semibold">Privacy Requests</p>
            <p className="mt-1 text-sm text-stone-500">
              Tap to email privacy@talkiochat.com
            </p>
          </a>

          <a
            href="mailto:hello@talkiochat.com?subject=Talkio%20General%20Question"
            className="block rounded-2xl border border-stone-200 bg-white p-5 shadow-sm transition hover:bg-stone-50"
          >
            <p className="font-semibold">General Questions</p>
            <p className="mt-1 text-sm text-stone-500">
              Tap to email hello@talkiochat.com
            </p>
          </a>
        </div>

        <div className="mt-8 rounded-2xl bg-emerald-50 p-5 text-sm leading-6 text-emerald-800">
          Response time: 24–48 hours.
        </div>

        <div className="mt-8 flex flex-wrap gap-4 text-sm">
          <a href="/privacy" className="text-emerald-700 underline">
            Privacy Policy
          </a>

          <a href="/terms" className="text-emerald-700 underline">
            Terms of Use
          </a>

          <a href="/" className="text-emerald-700 underline">
            Main Website
          </a>
        </div>

        <p className="mt-8 text-xs leading-5 text-stone-400">
          Talkio Version 1.0
          <br />© 2026 Talkio
        </p>
      </section>
    </main>
  );
}