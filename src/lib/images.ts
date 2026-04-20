export const FALLBACK_ITEM_IMAGE = "/placeholder-item.svg";

const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];

const MAX_FILE_SIZE_MB = 12;
const MAX_UPLOAD_DIMENSION = 1800;
const COMPRESS_QUALITY = 0.82;

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "-").toLowerCase();
}

export function getItemImageUrl(url?: string, itemId?: string, fallbackBust?: string | number) {
  const base = isPersistableItemImageUrl(url) ? url : FALLBACK_ITEM_IMAGE;

  if (!itemId || typeof window === "undefined") {
    return base;
  }

  const sessionBust = window.sessionStorage.getItem(`snatchn-item-bust-${itemId}`);
  const bust = sessionBust || fallbackBust;

  if (!bust) return base;
  return `${base}${base.includes("?") ? "&" : "?"}v=${encodeURIComponent(String(bust))}`;
}

export function isTransientLocalImageUrl(url?: string) {
  return Boolean(url && (url.startsWith("blob:") || url.startsWith("data:")));
}

export function isPersistableItemImageUrl(url?: string) {
  return Boolean(url && !isTransientLocalImageUrl(url));
}

export function validateImageFile(file: File) {
  if (!file) {
    return { ok: false, reason: "No file selected." };
  }

  const isImageType = file.type.startsWith("image/");
  if (!isImageType || !ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    return {
      ok: false,
      reason: "Use JPG, PNG, WEBP, or HEIC image files.",
    };
  }

  const maxSizeBytes = MAX_FILE_SIZE_MB * 1024 * 1024;
  if (file.size > maxSizeBytes) {
    return {
      ok: false,
      reason: `Image is too large. Max ${MAX_FILE_SIZE_MB}MB.`,
    };
  }

  return { ok: true, reason: "" };
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Could not read image."));
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error("Could not read image."));
    reader.readAsDataURL(file);
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Compression failed."));
          return;
        }
        resolve(blob);
      },
      "image/jpeg",
      quality,
    );
  });
}

export async function prepareImageForUpload(file: File) {
  const image = await loadImage(file);
  const largestSide = Math.max(image.width, image.height);

  if (largestSide <= MAX_UPLOAD_DIMENSION && file.size < 1.2 * 1024 * 1024) {
    return {
      file,
      compressed: false,
      originalSize: file.size,
      finalSize: file.size,
    };
  }

  const scale = Math.min(1, MAX_UPLOAD_DIMENSION / largestSide);
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Could not process image.");
  }

  context.drawImage(image, 0, 0, width, height);
  const blob = await canvasToBlob(canvas, COMPRESS_QUALITY);

  const normalizedName = sanitizeFileName(file.name.replace(/\.[^/.]+$/, ""));
  const compressedFile = new File([blob], `${normalizedName || "listing"}.jpg`, {
    type: "image/jpeg",
    lastModified: Date.now(),
  });

  return {
    file: compressedFile,
    compressed: true,
    originalSize: file.size,
    finalSize: compressedFile.size,
  };
}

export function buildStorageFilePath(userId: string, file: File) {
  const safeName = sanitizeFileName(file.name || "listing.jpg");
  return `${userId}/${Date.now()}-${safeName}`;
}
