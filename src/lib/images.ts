export const FALLBACK_ITEM_IMAGE = "/placeholder-item.svg";

const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];

const MAX_FILE_SIZE_MB = 12;
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

export async function compressImage(file: File, maxWidthPx = 1200, quality = COMPRESS_QUALITY): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxWidthPx / img.width);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        reject(new Error("Could not process image."));
        return;
      }

      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("Compression failed."));
          return;
        }

        resolve(new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" }));
      }, "image/jpeg", quality);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image."));
    };

    img.src = url;
  });
}

export async function prepareImageForUpload(file: File) {
  const compressedFile = await compressImage(file);

  return {
    file: compressedFile,
    compressed: compressedFile.size < file.size || compressedFile.name !== file.name || compressedFile.type !== file.type,
    originalSize: file.size,
    finalSize: compressedFile.size,
  };
}

export function buildStorageFilePath(userId: string, file: File) {
  const safeName = sanitizeFileName(file.name || "listing.jpg");
  return `${userId}/${Date.now()}-${safeName}`;
}
