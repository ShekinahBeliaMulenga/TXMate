import type { MetadataRoute } from "next";

/** Lets students and Academic Mates install TXMate on their phone or computer; it opens in its own window. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "TXMate",
    short_name: "TXMate",
    description: "Find verified Academic Mates, book tutoring sessions and keep up with your academic support.",
    start_url: "/student/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#7d1f2a",
    categories: ["education"],
    icons: [
      { src: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Find a Mate", url: "/student/find-academic-mate", icons: [{ src: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" }] },
      { name: "Sessions", url: "/student/sessions", icons: [{ src: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" }] },
      { name: "Notifications", url: "/student/notifications", icons: [{ src: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" }] },
    ],
  };
}
