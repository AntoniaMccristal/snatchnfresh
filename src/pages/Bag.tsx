import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ShoppingBag, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { getBagItemIds, removeFromBag } from "@/lib/bag";
import { getItemImageUrl } from "@/lib/images";

export default function Bag() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<any[]>([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const ids = getBagItemIds();
      if (ids.length === 0) {
        setItems([]);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("items")
        .select("*")
        .in("id", ids)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Bag load error", error);
        setItems([]);
      } else {
        setItems(data || []);
      }

      setLoading(false);
    };

    load();
    const onBagUpdate = () => load();
    window.addEventListener("snatchn:bag-updated", onBagUpdate);
    return () => window.removeEventListener("snatchn:bag-updated", onBagUpdate);
  }, []);

  const totalPerDay = useMemo(
    () => items.reduce((sum, item) => sum + Number(item.price_per_day || 0), 0),
    [items],
  );

  return (
    <div className="app-shell bg-warm-gradient pb-28 page-transition">
      <header className="px-5 pt-[max(0.75rem,env(safe-area-inset-top))] pb-4 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-full bg-card border border-border/60 flex items-center justify-center shadow-soft"
        >
          <ArrowLeft size={18} className="text-foreground" />
        </button>
        <div>
          <h1 className="text-base font-display font-semibold text-foreground">Your Bag</h1>
          <p className="text-xs text-muted-foreground">{items.length} item{items.length === 1 ? "" : "s"}</p>
        </div>
      </header>

      <div className="px-5 space-y-3">
        {loading && <div className="rounded-2xl border border-border/60 bg-card p-4 text-sm">Loading bag...</div>}

        {!loading && items.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border p-5 bg-card text-center">
            <ShoppingBag size={20} className="mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">Your bag is empty</p>
            <p className="text-xs text-muted-foreground mt-1">Save listings here before booking.</p>
            <button
              onClick={() => navigate("/discover")}
              className="mt-3 h-9 px-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold"
            >
              Browse listings
            </button>
          </div>
        )}

        {items.map((item) => (
          <div key={item.id} className="rounded-2xl border border-border/60 bg-card p-3 shadow-soft">
            <div className="flex gap-3">
              <img
                src={getItemImageUrl(item.image_url, item.id, item.updated_at || item.created_at)}
                alt={item.title}
                className="w-20 h-24 rounded-xl object-cover"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{item.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">${item.price_per_day}/day</p>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => navigate(`/item/${item.id}`)}
                    className="h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-semibold"
                  >
                    Book now
                  </button>
                  <button
                    onClick={() => removeFromBag(item.id)}
                    className="h-8 px-3 rounded-lg border border-border text-xs font-semibold inline-flex items-center gap-1"
                  >
                    <Trash2 size={12} /> Remove
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {!loading && items.length > 0 && (
        <div className="fixed bottom-0 inset-x-0 glass border-t border-border/50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] z-[120]">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Estimated total/day</span>
            <span className="text-foreground font-semibold">${totalPerDay}</span>
          </div>
        </div>
      )}
    </div>
  );
}
