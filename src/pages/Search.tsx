import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Gem, Layers, Search as SearchIcon, Shirt, ShoppingBag, Sparkles, X } from "lucide-react";
import ItemCard from "@/components/ItemCard";
import { supabase } from "@/lib/supabaseClient";

type Filters = {
  category: string;
  size: string;
  minPrice?: number;
  maxPrice?: number;
  condition: string;
};

type PriceOption = {
  label: string;
  minPrice?: number;
  maxPrice?: number;
};

const categories = ["All", "Dresses", "Tops", "Outerwear", "Bottoms", "Accessories", "Sets"];
const popularCategories = ["Dresses", "Tops", "Outerwear", "Bottoms", "Accessories", "Sets"];
const sizes = ["XS", "S", "M", "L", "XL", "One size"];
const conditions = ["Brand new", "Like new", "Good", "Fair"];
const priceOptions: PriceOption[] = [
  { label: "Under $10", maxPrice: 10 },
  { label: "$10-$20", minPrice: 10, maxPrice: 20 },
  { label: "$20-$50", minPrice: 20, maxPrice: 50 },
  { label: "$50+", minPrice: 50 },
];

const categoryIcons = [Sparkles, Shirt, Layers, Shirt, Gem, ShoppingBag];

const emptyFilters: Filters = {
  category: "",
  size: "",
  condition: "",
};

function hasActiveFilters(filters: Filters) {
  return Boolean(filters.category || filters.size || filters.condition || filters.minPrice || filters.maxPrice);
}

function isActivePrice(filters: Filters, option: PriceOption) {
  return filters.minPrice === option.minPrice && filters.maxPrice === option.maxPrice;
}

function FilterPill({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-9 shrink-0 rounded-full px-4 text-sm font-semibold transition-colors ${
        active
          ? "bg-foreground text-background"
          : "border border-border bg-background text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

export default function Search() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedQuery(query), 300);
    return () => window.clearTimeout(timeout);
  }, [query]);

  useEffect(() => {
    const focusSearch = () => inputRef.current?.focus();
    window.addEventListener("snatchn:focus-search", focusSearch);
    return () => window.removeEventListener("snatchn:focus-search", focusSearch);
  }, []);

  const searchItems = async (searchQuery: string, activeFilters: Filters) => {
    const buildBaseQuery = () => {
      let q = supabase
        .from("items")
        .select("id,title,brand,price_per_day,image_url,size,category,location,condition,availability_status,owner_id,user_id,updated_at,created_at")
        .eq("is_available", true)
        .or("availability_status.is.null,availability_status.eq.available");

      if (activeFilters.category) q = q.ilike("category", `%${activeFilters.category}%`);
      if (activeFilters.size) q = q.ilike("size", `%${activeFilters.size}%`);
      if (activeFilters.maxPrice) q = q.lte("price_per_day", activeFilters.maxPrice);
      if (activeFilters.minPrice) q = q.gte("price_per_day", activeFilters.minPrice);
      if (activeFilters.condition) q = q.ilike("condition", `%${activeFilters.condition}%`);

      return q;
    };

    const trimmedQuery = searchQuery.trim();
    let q = buildBaseQuery();

    if (trimmedQuery) {
      q = q.textSearch("fts", trimmedQuery, { type: "websearch" });
    }

    const { data, error } = await q.order("created_at", { ascending: false }).limit(50);
    if (!error) return data || [];

    const missingFts =
      String(error.message || "").toLowerCase().includes("fts") ||
      error.code === "42703" ||
      error.code === "PGRST204";

    if (!trimmedQuery || !missingFts) {
      console.error("Search failed", error);
      return [];
    }

    const fallback = buildBaseQuery()
      .or(`title.ilike.%${trimmedQuery}%,brand.ilike.%${trimmedQuery}%,category.ilike.%${trimmedQuery}%`)
      .order("created_at", { ascending: false })
      .limit(50);
    const { data: fallbackData, error: fallbackError } = await fallback;
    if (fallbackError) {
      console.error("Fallback search failed", fallbackError);
      return [];
    }

    return fallbackData || [];
  };

  useEffect(() => {
    const active = hasActiveFilters(filters) || debouncedQuery.trim().length > 0;
    if (!active) {
      setItems([]);
      setHasSearched(false);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const runSearch = async () => {
      setLoading(true);
      setHasSearched(true);
      const results = await searchItems(debouncedQuery, filters);
      if (!cancelled) {
        setItems(results);
        setLoading(false);
      }
    };

    void runSearch();
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, filters]);

  const resultLabel = useMemo(() => {
    if (loading) return "Searching...";
    return `${items.length} item${items.length === 1 ? "" : "s"} found`;
  }, [items.length, loading]);

  const setCategory = (category: string) => {
    setFilters((prev) => ({ ...prev, category: category === "All" ? "" : category }));
  };

  return (
    <div className="app-shell bg-white pb-24">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 py-3 space-y-3">
          <div className="relative">
            <SearchIcon size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search dresses, brands, sizes..."
              className="h-12 w-full rounded-2xl border border-border bg-background pl-11 pr-11 text-base font-medium outline-none focus:border-foreground"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-muted text-muted-foreground"
                aria-label="Clear search"
              >
                <X size={15} />
              </button>
            )}
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1">
            {categories.map((category) => (
              <FilterPill
                key={category}
                active={category === "All" ? !filters.category : filters.category === category}
                onClick={() => setCategory(category)}
              >
                {category}
              </FilterPill>
            ))}

            {sizes.map((size) => (
              <FilterPill
                key={size}
                active={filters.size === size}
                onClick={() => setFilters((prev) => ({ ...prev, size: prev.size === size ? "" : size }))}
              >
                {size}
              </FilterPill>
            ))}

            {priceOptions.map((option) => (
              <FilterPill
                key={option.label}
                active={isActivePrice(filters, option)}
                onClick={() =>
                  setFilters((prev) =>
                    isActivePrice(prev, option)
                      ? { ...prev, minPrice: undefined, maxPrice: undefined }
                      : { ...prev, minPrice: option.minPrice, maxPrice: option.maxPrice },
                  )
                }
              >
                {option.label}
              </FilterPill>
            ))}

            {conditions.map((condition) => (
              <FilterPill
                key={condition}
                active={filters.condition === condition}
                onClick={() => setFilters((prev) => ({ ...prev, condition: prev.condition === condition ? "" : condition }))}
              >
                {condition}
              </FilterPill>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-5">
        {!hasSearched ? (
          <section>
            <div className="mb-4">
              <h1 className="text-2xl font-bold text-foreground">Search Snatch&apos;n</h1>
              <p className="mt-1 text-sm text-muted-foreground">Find pieces by category, brand, size, condition, or price.</p>
            </div>
            <h2 className="mb-3 text-sm font-bold text-foreground">Popular categories</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {popularCategories.map((category, index) => {
                const Icon = categoryIcons[index] || Sparkles;
                return (
                  <button
                    key={category}
                    type="button"
                    onClick={() => {
                      setFilters((prev) => ({ ...prev, category }));
                      setHasSearched(true);
                    }}
                    className="rounded-3xl border border-border bg-card p-5 text-left shadow-sm transition-transform active:scale-[0.99]"
                  >
                    <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-foreground text-background">
                      <Icon size={20} />
                    </div>
                    <p className="text-base font-bold text-foreground">{category}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Browse {category.toLowerCase()}</p>
                  </button>
                );
              })}
            </div>
          </section>
        ) : (
          <section>
            <p className="mb-4 text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{resultLabel}</span>
            </p>

            {!loading && items.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-border bg-card p-8 text-center">
                <SearchIcon size={24} className="mx-auto mb-3 text-muted-foreground" />
                <p className="text-sm font-bold text-foreground">
                  No items found{query.trim() ? ` for "${query.trim()}"` : ""}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">Try different keywords or remove a filter.</p>
              </div>
            ) : (
              <>
                <div className="md:hidden" style={{ columns: "2", columnGap: "8px" }}>
                  {items.map((item) => (
                    <div key={item.id} style={{ breakInside: "avoid", marginBottom: "8px" }}>
                      <ItemCard item={item} />
                    </div>
                  ))}
                </div>
                <div className="hidden md:block" style={{ columns: "4", columnGap: "12px" }}>
                  {items.map((item) => (
                    <div key={item.id} style={{ breakInside: "avoid", marginBottom: "12px" }}>
                      <ItemCard item={item} />
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
