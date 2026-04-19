export function buildUberParcelUrl(dropoffAddress?: string) {
  const base = "https://m.uber.com/ul/";
  const params = new URLSearchParams();

  params.set("action", "setPickup");
  params.set("pickup", "my_location");

  if (dropoffAddress) {
    params.set("dropoff[formatted_address]", dropoffAddress);
  }

  return `${base}?${params.toString()}`;
}

export function openUberParcel(dropoffAddress?: string) {
  const url = buildUberParcelUrl(dropoffAddress);
  window.open(url, "_blank", "noopener,noreferrer");
}
