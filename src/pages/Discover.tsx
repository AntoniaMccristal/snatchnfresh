import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { Pencil, Search, UserRound } from "lucide-react";
import { getItemImageUrl } from "@/lib/images";
import { usePageRefresh } from "@/hooks/usePageRefresh";

const PAGE_SIZE = 24;

function getDistanceKm(item: any) {
  if (typeof item?.distance_km === "number" && Number.isFinite(item.distance_km)) {
    return item.distance_km;
  }

  if (typeof item?.distance === "string") {
    const parsed = Number.parseFloat(item.distance);
    if (Number.isFinite(parsed)) return parsed;
  }

  const seed = String(item?.id || "0")
    .split("")
    .reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return (seed % 18) + 1;
}

function matchesDistanceRange(distanceKm: number, range: string) {
  if (range === "all") return true;
  if (range === "0-3") return distanceKm <= 3;
  if (range === "3-5") return distanceKm > 3 && distanceKm <= 5;
  if (range === "5-10") return distanceKm > 5 && distanceKm <= 10;
  if (range === "10+") return distanceKm > 10;
  return true;
}

export default function Discover() {
  const [items, setItems] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [distanceRange, setDistanceRange] = useState("all");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [showAvailableOnly, setShowAvailableOnly] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMoreItems, setHasMoreItems] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const navigate = useNavigate();

  const loadCurrentUser = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    setCurrentUserId(data?.user?.id ?? null);
  }, []);

  const fetchItemsPage = useCallback(async (from: number, to: number) => {
    const { data, error } = await supabase
      .from("items")
      .select("*")
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) throw error;

    return data ?? [];
  }, []);

  const fetchProfiles = useCallback(async (seedItems: any[]) => {
    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("id,username,full_name,avatar_url")
      .limit(200);

    if (!profileError && profileData) {
      setProfiles(profileData);
      return;
    }

    const owners = new Map<string, any>();
    seedItems.forEach((item) => {
      const ownerId = item.owner_id || item.user_id;
      if (!ownerId || owners.has(ownerId)) return;

      owners.set(ownerId, {
        id: ownerId,
        full_name: item.owner_name || null,
        username: null,
        avatar_url: null,
      });
    });

    setProfiles(Array.from(owners.values()));
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);

    try {
      const itemData = await fetchItemsPage(0, PAGE_SIZE - 1);
      setItems(itemData);
      setVisibleCount(PAGE_SIZE);
      setHasMoreItems(itemData.length === PAGE_SIZE);
      await fetchProfiles(itemData);
    } finally {
      setLoading(false);
    }
  }, [fetchItemsPage, fetchProfiles]);

  const loadMoreItems = useCallback(async () => {
    if (loading || loadingMore || !hasMoreItems) return;

    setLoadingMore(true);

    try {
      const nextFrom = items.length;
      const nextTo = nextFrom + PAGE_SIZE - 1;
      const nextItems = await fetchItemsPage(nextFrom, nextTo);

      setItems((prev) => {
        const seen = new Set(prev.map((item) => item.id));
        const uniqueNext = nextItems.filter((item) => !seen.has(item.id));
        return [...prev, ...uniqueNext];
      });
      setVisibleCount((prev) => prev + PAGE_SIZE);
      setHasMoreItems(nextItems.length === PAGE_SIZE);
    } finally {
      setLoadingMore(false);
    }
  }, [fetchItemsPage, hasMoreItems, items.length, loading, loadingMore]);

  const refreshDiscover = useCallback(async () => {
    await Promise.all([loadCurrentUser(), fetchData()]);
  }, [fetchData, loadCurrentUser]);

  useEffect(() => {
    void refreshDiscover();
  }, [refreshDiscover]);

  usePageRefresh(refreshDiscover, [refreshDiscover]);

  const categories = useMemo(() => {
    const values = new Set<string>();
    items.forEach((item) => {
      if (item.category) values.add(item.category);
    });

    return ["All", ...Array.from(values)];
  }, [items]);

  const trendingSearches = useMemo(() => {
    const defaults = [
      "Cocktail dresses",
      "Weekend outfits",
      "Designer bags",
      "Wedding guest",
      "Bec + Bridge",
      "Venroy",
    ];

    const dynamic = items
      .flatMap((item) => [item?.title, item?.brand, item?.category])
      .filter(Boolean)
      .map((value) => String(value).trim())
      .filter((value) => value.length >= 3);

    return Array.from(new Set([...dynamic, ...defaults])).slice(0, 14);
  }, [items]);

  const suggestedSearches = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return trendingSearches.slice(0, 8);
    return trendingSearches
      .filter((term) => term.toLowerCase().includes(query))
      .slice(0, 8);
  }, [searchQuery, trendingSearches]);

  const filteredItems = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    const min = priceMin ? Number(priceMin) : null;
    const max = priceMax ? Number(priceMax) : null;

    return items.filter((item) => {
      if (showAvailableOnly && item.is_available === false) return false;
      if (selectedCategory !== "All" && item.category !== selectedCategory) return false;
      if (!matchesDistanceRange(getDistanceKm(item), distanceRange)) return false;

      const price = Number(item.price_per_day || 0);
      if (min !== null && Number.isFinite(min) && price < min) return false;
      if (max !== null && Number.isFinite(max) && price > max) return false;

      if (!query) return true;
      return [item.title, item.brand, item.description, item.category]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [items, searchQuery, selectedCategory, distanceRange, priceMin, priceMax, showAvailableOnly]);

  const visibleItems = useMemo(
    () => filteredItems.slice(0, visibleCount),
    [filteredItems, visibleCount],
  );

  const filteredProfiles = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return [];

    return profiles
      .filter((profile) =>
        [profile.username, profile.full_name]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query)),
      )
      .slice(0, 8);
  }, [profiles, searchQuery]);

  const hasActiveFilters =
    selectedCategory !== "All" ||
    distanceRange !== "all" ||
    priceMin !== "" ||
    priceMax !== "" ||
    !showAvailableOnly ||
    searchQuery.trim() !== "";

  return (
    <div className="pb-24 px-4 pt-6 max-w-7xl mx-auto">
      <h1 className="text-3xl font-semibold mb-4">Discover</h1>

      <div className="relative mb-4">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search listings and people"
          className="w-full h-11 rounded-xl border border-gray-300 pl-10 pr-3 text-sm"
        />
      </div>

      {suggestedSearches.length > 0 && (
        <div className="mb-4">
          <p className="text-xs text-muted-foreground mb-2">
            {searchQuery.trim() ? "Suggested searches" : "Trending searches"}
          </p>
          <div className="flex flex-wrap gap-2">
            {suggestedSearches.map((term) => (
              <button
                key={term}
                type="button"
                onClick={() => {
                  setSearchQuery(term);
                  setVisibleCount(PAGE_SIZE);
                }}
                className="h-8 px-3 rounded-full border border-gray-300 bg-white text-xs"
              >
                {term}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mb-4 grid grid-cols-1 sm:grid-cols-5 gap-2">
        <select
          value={distanceRange}
          onChange={(e) => setDistanceRange(e.target.value)}
          className="h-10 rounded-xl border border-gray-300 px-3 text-sm bg-white"
        >
          <option value="all">Any distance</option>
          <option value="0-3">0-3 km</option>
          <option value="3-5">3-5 km</option>
          <option value="5-10">5-10 km</option>
          <option value="10+">10+ km</option>
        </select>
        <input
          type="number"
          value={priceMin}
          onChange={(e) => setPriceMin(e.target.value)}
          placeholder="Min price"
          className="h-10 rounded-xl border border-gray-300 px-3 text-sm"
        />
        <input
          type="number"
          value={priceMax}
          onChange={(e) => setPriceMax(e.target.value)}
          placeholder="Max price"
          className="h-10 rounded-xl border border-gray-300 px-3 text-sm"
        />
        <label className="h-10 rounded-xl border border-gray-300 px-3 text-sm flex items-center gap-2 bg-white">
          <input
            type="checkbox"
            checked={showAvailableOnly}
            onChange={(e) => setShowAvailableOnly(e.target.checked)}
          />
          Available only
        </label>
        <button
          type="button"
          onClick={() => {
            setPriceMin("");
            setPriceMax("");
            setSelectedCategory("All");
            setDistanceRange("all");
            setShowAvailableOnly(true);
            setVisibleCount(PAGE_SIZE);
          }}
          className="h-10 rounded-xl border border-gray-300 px-3 text-sm bg-white"
        >
          Reset filters
        </button>
      </div>

      {filteredProfiles.length > 0 && (
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-2">People</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {filteredProfiles.map((profile) => (
              <button
                key={profile.id}
                onClick={() => navigate(`/closet/${profile.id}`)}
                className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 bg-white text-left"
              >
                {profile.avatar_url ? (
                  <img src={profile.avatar_url} alt={profile.full_name || profile.username || "Profile"} className="w-9 h-9 rounded-full object-cover" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center">
                    <UserRound size={15} className="text-gray-500" />
                  </div>
                )}
                <div>
                  <p className="text-sm font-semibold text-foreground">{profile.full_name || "Wardrobe Owner"}</p>
                  <p className="text-xs text-muted-foreground">{profile.username ? `@${profile.username}` : "View profile"}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto pb-4">
        {categories.map((category) => (
          <button
            key={category}
            onClick={() => setSelectedCategory(category)}
            className={`px-3 py-1.5 rounded-full border text-sm whitespace-nowrap ${
              selectedCategory === category
                ? "bg-black text-white border-black"
                : "bg-white text-gray-600 border-gray-300"
            }`}
          >
            {category}
          </button>
        ))}
      </div>

      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-5">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="animate-pulse">
              <div className="w-full h-72 lg:h-64 2xl:h-56 rounded-2xl bg-muted" />
              <div className="mt-3 space-y-2">
                <div className="h-5 w-2/3 rounded bg-muted" />
                <div className="h-4 w-1/3 rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && filteredItems.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-center">
          <p className="text-base font-semibold text-foreground">No results found</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Try another search, widen your distance, or reset filters.
          </p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setPriceMin("");
                setPriceMax("");
                setSelectedCategory("All");
                setDistanceRange("all");
                setShowAvailableOnly(true);
                setVisibleCount(PAGE_SIZE);
              }}
              className="mt-4 h-10 px-4 rounded-xl border border-border/60 bg-background text-sm font-semibold"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {!loading && filteredItems.length > 0 && (
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {filteredItems.length} listing{filteredItems.length === 1 ? "" : "s"} found
          </p>
          {hasActiveFilters && (
            <p className="text-xs text-muted-foreground">Filters applied</p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-5">
        {visibleItems.map((item) => (
          <div
            key={item.id}
            onClick={() => navigate(`/item/${item.id}`)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                navigate(`/item/${item.id}`);
              }
            }}
            role="button"
            tabIndex={0}
            aria-label={`Open listing for ${item.title}`}
            className="cursor-pointer group rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            <div className="relative overflow-hidden rounded-2xl">
              <img
                src={getItemImageUrl(item.image_url, item.id, item.updated_at || item.created_at)}
                alt={item.title}
                className="w-full h-72 lg:h-64 2xl:h-56 object-cover group-hover:scale-105 transition duration-300"
              />

              {(item.owner_id || item.user_id) === currentUserId && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/list/${item.id}`);
                  }}
                  className="absolute top-3 right-3 bg-white/90 p-2 rounded-full shadow"
                  aria-label="Edit listing"
                  title="Edit listing"
                >
                  <Pencil size={14} />
                </button>
              )}

              <div className="absolute bottom-3 left-3 bg-white px-3 py-1 rounded-full text-sm font-semibold shadow">
                ${item.price_per_day} / day
              </div>
            </div>

            <div className="mt-3 space-y-1">
              <h2 className="font-semibold text-lg truncate">{item.title}</h2>
              {item.brand && <p className="text-xs text-muted-foreground truncate">{item.brand}</p>}
              <div className="flex items-center justify-between">
                <p className="text-gray-500 text-sm">{Math.round(getDistanceKm(item))} km away</p>
                {(item.owner_id || item.user_id) && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/closet/${item.owner_id || item.user_id}`);
                    }}
                    className="text-xs font-semibold text-primary hover:underline"
                  >
                    View closet
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {hasMoreItems && (
        <div className="mt-6 flex justify-center">
          <button
            type="button"
            onClick={() => {
              void loadMoreItems();
            }}
            disabled={loadingMore}
            className="h-10 px-4 rounded-xl border border-border/60 bg-card text-sm font-semibold hover:bg-muted/40 active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loadingMore ? "Loading more..." : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}
