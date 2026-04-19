import { supabase } from "./supabaseClient";

const CANDIDATE_BUCKETS = ["avatars", "items"];

function isBucketMissingError(error: any) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("bucket not found") || message.includes("not found");
}

export async function uploadAvatar(userId: string, file: File) {
  const extension = file.name.split(".").pop() || "jpg";
  const fileName = `${Date.now()}.${extension}`;
  let lastError: any = null;

  for (const bucket of CANDIDATE_BUCKETS) {
    const path = bucket === "items" ? `avatars/${userId}/${fileName}` : `${userId}/${fileName}`;
    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(path, file, { upsert: true });

    if (uploadError) {
      lastError = uploadError;
      if (isBucketMissingError(uploadError)) continue;
      throw uploadError;
    }

    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  }

  throw lastError || new Error("Avatar upload failed.");
}

