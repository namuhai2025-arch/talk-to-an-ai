import type { Metadata } from "next";
import DownloadClient from "./DownloadClient";

export const metadata: Metadata = {
  title: "Download Talkio",
  description:
    "Your own thinking space to reflect, organize your thoughts, and find clarity.",

  openGraph: {
    title: "Download Talkio",
    description:
      "Your own thinking space to reflect, organize your thoughts, and find clarity.",
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
      "Your own thinking space to reflect, organize your thoughts, and find clarity.",
    images: ["https://talkiochat.com/og-image.png"],
  },
};

export default function DownloadPage() {
  return <DownloadClient />;
}