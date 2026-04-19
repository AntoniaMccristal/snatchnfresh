import { supabase } from "@/lib/supabaseClient";

export async function hasCompletedPostalProfile(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("profiles")
    .select("phone,address_line1,suburb,state,postcode,country")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    const missingColumn =
      error.code === "42703" ||
      error.code === "PGRST204" ||
      String(error.message || "").toLowerCase().includes("column");

    if (missingColumn) {
      // If migration not yet applied, don't block app access.
      return true;
    }

    console.error("Profile completion check failed", error);
    return false;
  }

  if (!data) return false;

  const required = [
    data.phone,
    data.address_line1,
    data.suburb,
    data.state,
    data.postcode,
    data.country,
  ];

  return required.every((value) => String(value || "").trim().length > 0);
}
