import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Talkio",
  description:
    "A calm AI companion that helps you organize your thoughts and emotions.",
  openGraph: {
    title: "Talkio",
    description:
      "A calm AI companion that helps you organize your thoughts and emotions.",
    url: "https://talkiochat.com/download",
    siteName: "Talkio",
    images: [
      {
        url: "https://talkiochat.com/og-image.png",
        width: 1200,
        height: 630,
        alt: "Talkio",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Talkio",
    description:
      "A calm AI companion that helps you organize your thoughts and emotions.",
    images: ["https://talkiochat.com/og-image.png"],
  },
};

const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.talkio.app";

export default function DownloadPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-6 text-center">
      <div>
        <h1 className="text-2xl font-semibold text-stone-900">
          Download Talkio
        </h1>

        <p className="mt-3 text-sm text-stone-600">
          Your calm AI companion for reflection and emotional clarity.
        </p>

        <a
          href={PLAY_STORE_URL}
          className="mt-6 inline-block rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-medium text-white"
        >
          Open in Google Play
        </a>
      </div>
    </main>
  );
}