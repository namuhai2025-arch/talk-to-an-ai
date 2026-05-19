import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Talkio",
  description: "Talkio helped me organize my thoughts and emotions.",
  openGraph: {
    title: "Talkio",
    description: "Talkio helped me organize my thoughts and emotions.",
    url: "https://talkiochat.com/download",
    siteName: "Talkio",
    images: [
      {
        url: "https://talkiochat.com/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Talkio",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Talkio",
    description: "Talkio helped me organize my thoughts and emotions.",
    images: ["https://talkiochat.com/og-image.jpg"],
  },
  icons: {
    icon: "https://talkiochat.com/icon.png",
    apple: "https://talkiochat.com/apple-touch-icon.png",
  },
};

export default function DownloadLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}