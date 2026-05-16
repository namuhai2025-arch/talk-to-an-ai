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
    "A safe space to talk, reflect, and organize your thoughts.",

  metadataBase: new URL("https://talkiochat.com"),

  openGraph: {
    title: "Talkio",
    description:
      "A safe space to talk, reflect, and organize your thoughts.",
    url: "https://talkiochat.com",
    siteName: "Talkio",
    images: [
      {
        url: "/og-image.png",
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
      "A safe space to talk, reflect, and organize your thoughts.",
    images: ["/og-image.png"],
  },

  icons: {
    icon: "/icon.png",
    apple: "/icon.png",
  },
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