import type { Metadata } from "next";
import DownloadClient from "./DownloadClient";

export const metadata: Metadata = {
  title: "Download Talkio",
  description:
    "A calm AI companion that helps you organize your thoughts and emotions.",
  openGraph: {
    title: "Download Talkio",
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
    title: "Download Talkio",
    description:
      "A calm AI companion that helps you organize your thoughts and emotions.",
    images: ["https://talkiochat.com/og-image.png"],
  },
};

export default function DownloadPage() {
  return <DownloadClient />;
}