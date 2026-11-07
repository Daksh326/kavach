import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Kavach — scam help for India",
    short_name: "Kavach",
    description:
      "Scammed or got a suspicious message? Emergency steps, number and link checks, and complaint help.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#1e3a8a",
    lang: "en-IN",
    categories: ["utilities", "security"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      { name: "Emergency steps", short_name: "Emergency", url: "/en/emergency" },
      { name: "इमरजेंसी कदम", short_name: "इमरजेंसी", url: "/hi/emergency" },
      { name: "Check a number or link", short_name: "Check", url: "/en/check" },
    ],
  };
}
