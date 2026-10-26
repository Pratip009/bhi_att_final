import type { Metadata, Viewport } from "next";
import "@fontsource/atkinson-hyperlegible/400.css";
import "@fontsource/atkinson-hyperlegible/700.css";
import "@fontsource/caveat/500.css";
import "./globals.css";

export const metadata: Metadata = { title: { default: "BHI Attendance", template: "%s · BHI Attendance" }, robots: { index: false } };
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
