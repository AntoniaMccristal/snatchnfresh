export const BAG_KEY = "snatchn-bag-items";

export function getBagItemIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(BAG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id) => typeof id === "string");
  } catch {
    return [];
  }
}

export function setBagItemIds(ids: string[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(BAG_KEY, JSON.stringify(Array.from(new Set(ids))));
  window.dispatchEvent(new Event("snatchn:bag-updated"));
}

export function addToBag(itemId: string) {
  const ids = getBagItemIds();
  if (ids.includes(itemId)) return;
  setBagItemIds([...ids, itemId]);
}

export function removeFromBag(itemId: string) {
  const ids = getBagItemIds().filter((id) => id !== itemId);
  setBagItemIds(ids);
}
