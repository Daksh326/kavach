import Link from "next/link";
import "./globals.css";

// Requests that never matched a locale (rare: the proxy adds one). Kept minimal.
export default function GlobalNotFound() {
  return (
    <html lang="en">
      <body className="flex min-h-dvh items-center justify-center p-6 text-center">
        <div>
          <h1 className="text-2xl font-bold">Page not found</h1>
          <p className="mt-2">
            <Link className="text-primary underline" href="/">
              Go to Kavach home
            </Link>
          </p>
        </div>
      </body>
    </html>
  );
}
