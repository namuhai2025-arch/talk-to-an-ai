import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Talkio",
  description:
    "Talkio is a calm AI companion that listens, understands, and helps you think clearly.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}

export const metadata = {
  title: "Talkio",
  description: "A safe space to talk, reflect, and organize your thoughts.",
  openGraph: {
    title: "Talkio",
    description: "A safe space to talk, reflect, and organize your thoughts.",
    url: "https://talkiochat.com",
    siteName: "Talkio",
    images: [
      {
        url: "https://talkiochat.com/og-image.png",
        width: 1200,
        height: 630,
        alt: "Talkio",
      },
    ],
    type: "website",
  },
};