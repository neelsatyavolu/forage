import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata, Viewport } from "next";
import { Newsreader } from "next/font/google";
import { Nav } from "@/components/nav";
import "./globals.css";

const newsreader = Newsreader({ subsets: ["latin"], axes: ["opsz"], style: ["normal", "italic"], variable: "--font-newsreader" });

const TITLE = "Forage";
const DESCRIPTION = "Restaurant picks from the places you've already eaten. Log a visit in a tap, then get recommendations near you or anywhere you travel.";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
  title: { default: TITLE, template: "%s · Forage" },
  description: DESCRIPTION,
  openGraph: { title: TITLE, description: DESCRIPTION, siteName: "Forage", type: "website" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0E0E0D" },
    { media: "(prefers-color-scheme: light)", color: "#F7F5EF" },
  ],
};

// Applies a saved theme choice before first paint so the page never flashes the wrong one.
const THEME_SCRIPT = `try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} ${newsreader.variable} h-full`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">
        <Nav />
        {children}
      </body>
    </html>
  );
}
