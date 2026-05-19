export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-stone-50 px-5 py-8 text-stone-900">
      <div className="mx-auto max-w-3xl rounded-3xl bg-white p-6 shadow-sm">
        <a
  href="/"
  className="mb-6 inline-block text-sm text-stone-500 hover:text-stone-800"
>
  ← Back to Talkio
</a>

        <h1 className="text-3xl font-semibold tracking-tight">
          Privacy Policy
        </h1>

        <p className="mt-2 text-sm text-stone-500">
          Effective Date: May 10, 2026
        </p>

        <div className="mt-8 space-y-6 text-sm leading-7 text-stone-700">
          <section>
            <h2 className="text-lg font-semibold text-stone-900">1. What Talkio Is</h2>
            <p>
              Talkio is an AI-powered conversational support application designed to provide emotional support,
              reflection, grounding conversations, and general companionship through artificial intelligence.
              Talkio is not a medical provider, therapist, crisis center, or emergency service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-stone-900">2. Information We Collect</h2>
            <p>
              We may collect anonymous authentication identifiers, Firebase user identifiers, subscription status,
              device information, app version information, conversation data, usage analytics, crash reports,
              notification interactions, and technical diagnostics.
            </p>
            <p className="mt-3">
              Conversation data may be processed and stored to generate AI responses, maintain continuity,
              provide memory features, support check-ins, and improve safety systems.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-stone-900">3. How We Use Information</h2>
            <p>
              We use information to operate Talkio, generate AI responses, personalize conversations, improve
              emotional continuity, maintain security, detect abuse, analyze performance, provide customer support,
              manage subscriptions, and comply with legal obligations.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-stone-900">4. AI and Safety Systems</h2>
            <p>
              Talkio uses automated AI systems to generate conversational responses. Some messages may be analyzed
              by behavioral safety systems to detect crisis situations, reduce harmful responses, and improve
              emotional safety. Talkio may temporarily limit or pause interactions during high-risk situations.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-stone-900">5. Third-Party Services</h2>
            <p>
              Talkio may use Google Firebase, Firebase Analytics, Firebase Crashlytics, Firebase Authentication,
              Firebase Cloud Messaging, Firestore Database, Google Play Billing, cloud hosting providers, and AI
              model providers. These services may process data according to their own privacy policies.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-stone-900">6. Push Notifications</h2>
            <p>
              If enabled, Talkio may send check-in reminders, conversation reminders, subscription-related notices,
              and service announcements. You can disable notifications at any time through your device settings.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-stone-900">7. Data Storage and Security</h2>
            <p>
              We use commercially reasonable safeguards to protect user information. Data may be stored using secure
              cloud infrastructure including Google Firebase services. However, no online service can guarantee
              absolute security.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-stone-900">8. Data Retention and Deletion</h2>
            <p>
              We retain information only as long as reasonably necessary to provide services, maintain functionality,
              comply with legal obligations, resolve disputes, and enforce policies.
            </p>
            <p className="mt-3">
              You may request deletion of your account and associated data through the app settings or by contacting
              support@talkiochat.com. Some limited records may remain temporarily for security, fraud prevention,
              legal compliance, or technical backup purposes.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-stone-900">9. Children’s Privacy</h2>
            <p>
              Talkio is not intended for children under 13 years old. We do not knowingly collect personal information
              from children under 13. If we become aware that such data has been collected, we will take reasonable
              steps to delete it.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-stone-900">10. Medical and Emergency Disclaimer</h2>
            <p>
              Talkio is not medical advice, psychiatric care, therapy, emergency support, or crisis intervention.
              If you are in immediate danger or experiencing a mental health emergency, contact local emergency
              services, a licensed mental health professional, or a crisis hotline in your country.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-stone-900">11. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. Updated versions will be posted at
              https://talkiochat.com/privacy. Continued use of Talkio after updates constitutes acceptance of the
              revised policy.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-stone-900">12. Contact Us</h2>
            <p>
              For questions about this Privacy Policy or your data, contact Talkio Support at support@talkiochat.com.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}