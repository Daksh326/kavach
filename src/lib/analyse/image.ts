"use client";

import { ANALYSE_IMAGE_MAX_BYTES } from "@/lib/validation/analyse";

export type PreparedImage = {
  mimeType: "image/jpeg";
  dataBase64: string;
  previewUrl: string;
  bytes: number;
};

/**
 * Shrinks a screenshot in the browser (longest side 1600px, JPEG) before it
 * is sent anywhere: smaller uploads on slow connections, and the Worker
 * never has to decode or resize images. Text in screenshots stays legible.
 */
export async function prepareScreenshot(file: File): Promise<PreparedImage> {
  const bitmap = await createImageBitmap(file);
  try {
    for (const [maxSide, quality] of [
      [1600, 0.82],
      [1280, 0.72],
      [1024, 0.6],
    ] as const) {
      const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
      const w = Math.round(bitmap.width * scale);
      const h = Math.round(bitmap.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas unavailable");
      ctx.fillStyle = "#fff"; // transparent PNGs become white, not black
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(bitmap, 0, 0, w, h);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", quality),
      );
      if (blob && blob.size <= ANALYSE_IMAGE_MAX_BYTES) {
        return {
          mimeType: "image/jpeg",
          dataBase64: await toBase64(blob),
          previewUrl: URL.createObjectURL(blob),
          bytes: blob.size,
        };
      }
    }
    throw new Error("image too large");
  } finally {
    bitmap.close();
  }
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
