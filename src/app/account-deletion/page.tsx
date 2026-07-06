export default function AccountDeletionPage() {
  return (
    <main className="min-h-screen bg-[#f7f6f1] px-6 py-10 text-[#171717]">
      <div className="mx-auto max-w-3xl">
        <a href="/" className="text-sm text-[#6f746b]">
          ← Back to Talkio
        </a>

        <section className="mt-10 rounded-[28px] bg-white p-8 shadow-sm ring-1 ring-black/5">
          <h1 className="text-4xl font-bold tracking-tight">
            Delete Your Talkio Account
          </h1>

          <p className="mt-5 text-lg leading-8 text-[#6f746b]">
            Talkio users can permanently delete their account and associated
            data at any time from inside the app.
          </p>

          <div className="mt-8 rounded-3xl border border-[#d9eadf] bg-[#f2fbf6] p-6">
            <h2 className="text-xl font-semibold">How to delete your account</h2>

            <ol className="mt-4 list-decimal space-y-3 pl-6 text-[#4f554d]">
              <li>Open the Talkio app.</li>
              <li>Go to <strong>Settings</strong>.</li>
              <li>Open <strong>Account</strong>.</li>
              <li>Tap <strong>Delete account</strong>.</li>
              <li>Confirm the deletion.</li>
            </ol>
          </div>

          <div className="mt-8">
            <h2 className="text-xl font-semibold">What data is deleted</h2>

            <ul className="mt-4 list-disc space-y-3 pl-6 text-[#4f554d]">
              <li>Your Talkio account</li>
              <li>Your conversation history</li>
              <li>Your saved memories and reflections</li>
              <li>Your profile information</li>
              <li>Your device tokens used for notifications</li>
              <li>Your scheduled reminders, if any</li>
            </ul>
          </div>

          <div className="mt-8">
            <h2 className="text-xl font-semibold">Data retention</h2>

            <p className="mt-4 leading-8 text-[#4f554d]">
              Account deletion is permanent. Talkio removes your account and
              associated personal data from active systems. Some limited records
              may be retained only when required for legal, security, fraud
              prevention, or financial compliance purposes.
            </p>
          </div>

          <div className="mt-8 rounded-3xl border border-[#e8e2d7] bg-[#fbfaf6] p-6">
            <h2 className="text-xl font-semibold">Need help?</h2>

            <p className="mt-4 leading-8 text-[#4f554d]">
              If you cannot access the app or need help deleting your account,
              contact Talkio support at{" "}
              <a
                href="mailto:support@talkiochat.com"
                className="font-medium text-[#0f766e]"
              >
                support@talkiochat.com
              </a>
              .
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}