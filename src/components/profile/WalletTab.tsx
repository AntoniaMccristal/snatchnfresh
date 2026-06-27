import { useEffect, useMemo, useState } from "react";
import SnatchnWallet from "@/components/SnatchnWallet";
import { supabase } from "@/lib/supabaseClient";

type WalletTabProps = {
  userId: string;
  stripeConnected: boolean;
  onConnectStripe: () => void;
};

type EarningsRow = {
  itemId: string;
  title: string;
  imageUrl: string;
  rentals: number;
  totalEarned: number;
};

function formatAUD(value: number) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

export default function WalletTab({ userId, stripeConnected, onConnectStripe }: WalletTabProps) {
  const [earningsRows, setEarningsRows] = useState<EarningsRow[]>([]);
  const [loadingEarnings, setLoadingEarnings] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadEarnings() {
      setLoadingEarnings(true);
      try {
        const { data: bookings, error } = await supabase
          .from("bookings")
          .select("id,item_id,lender_payout_amount,rental_subtotal,total_price,status")
          .eq("owner_id", userId)
          .eq("status", "completed");

        if (error) throw error;

        const itemIds = Array.from(new Set((bookings || []).map((booking: any) => booking.item_id).filter(Boolean)));
        const itemMap = new Map<string, any>();

        if (itemIds.length > 0) {
          const { data: items, error: itemsError } = await supabase
            .from("items")
            .select("id,title,image_url")
            .in("id", itemIds);

          if (itemsError) throw itemsError;
          (items || []).forEach((item: any) => itemMap.set(item.id, item));
        }

        const grouped = new Map<string, EarningsRow>();
        (bookings || []).forEach((booking: any) => {
          const itemId = String(booking.item_id || "unknown");
          const item = itemMap.get(itemId);
          const existing = grouped.get(itemId) || {
            itemId,
            title: item?.title || "Listing",
            imageUrl: item?.image_url || "",
            rentals: 0,
            totalEarned: 0,
          };

          existing.rentals += 1;
          existing.totalEarned += Number(
            booking.lender_payout_amount ?? booking.rental_subtotal ?? booking.total_price ?? 0,
          );
          grouped.set(itemId, existing);
        });

        if (!cancelled) {
          setEarningsRows(Array.from(grouped.values()).sort((a, b) => b.totalEarned - a.totalEarned));
        }
      } catch (error) {
        console.error("Failed to load earnings breakdown", error);
        if (!cancelled) setEarningsRows([]);
      } finally {
        if (!cancelled) setLoadingEarnings(false);
      }
    }

    void loadEarnings();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const lifetimeEarnings = useMemo(
    () => earningsRows.reduce((sum, row) => sum + row.totalEarned, 0),
    [earningsRows],
  );

  return (
    <section className="space-y-3">
      <SnatchnWallet
        userId={userId}
        stripeConnected={stripeConnected}
        onConnectStripe={onConnectStripe}
      />

      <div className="rounded-3xl border border-border/50 bg-card p-4 shadow-card space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total lifetime earnings</p>
          <p className="mt-1 text-3xl font-bold text-foreground">{formatAUD(lifetimeEarnings)}</p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-foreground">Earnings by item</h3>
            {loadingEarnings && <span className="text-xs text-muted-foreground">Loading...</span>}
          </div>

          {!loadingEarnings && earningsRows.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
              Completed rentals will appear here once items are returned.
            </div>
          )}

          {earningsRows.map((row) => (
            <div key={row.itemId} className="flex items-center gap-3 rounded-2xl border border-border/50 bg-background p-2.5">
              {row.imageUrl ? (
                <img src={row.imageUrl} alt={row.title} className="h-[50px] w-10 rounded-xl object-cover" />
              ) : (
                <div className="flex h-[50px] w-10 items-center justify-center rounded-xl bg-muted text-xs font-bold text-muted-foreground">
                  {row.title.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">{row.title}</p>
                <p className="text-xs text-muted-foreground">
                  {row.rentals} rental{row.rentals === 1 ? "" : "s"}
                </p>
              </div>
              <p className="text-sm font-bold text-green-600">{formatAUD(row.totalEarned)}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
