import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, MessageCircle, Star } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { getItemImageUrl } from "@/lib/images";

export default function ClosetProfile() {
  const { userId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<any[]>([]);
  const [displayName, setDisplayName] = useState<string>("");
  const [username, setUsername] = useState<string>("");
  const [avatarUrl, setAvatarUrl] = useState<string>("");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [followsEnabled, setFollowsEnabled] = useState(true);
  const [averageRating, setAverageRating] = useState(0);
  const [reviewCount, setReviewCount] = useState(0);

  useEffect(() => {
    const load = async () => {
      if (!userId) return;

      setLoading(true);

      try {
        const { data: authData } = await supabase.auth.getUser();
        const me = authData?.user?.id || null;
        setCurrentUserId(me);

        const { data: byOwner, error: ownerErr } = await supabase
          .from("items")
          .select("*")
          .eq("owner_id", userId)
          .order("created_at", { ascending: false });

        const { data: byUser, error: userErr } = await supabase
          .from("items")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false });

        const ownerColumnMissing =
          ownerErr?.code === "42703" ||
          ownerErr?.message?.toLowerCase().includes("owner_id");
        const userColumnMissing =
          userErr?.code === "42703" ||
          userErr?.message?.toLowerCase().includes("user_id");

        if (ownerErr && !ownerColumnMissing) throw ownerErr;
        if (userErr && !userColumnMissing) throw userErr;

        const combined = [...(byOwner || []), ...(byUser || [])];
        const deduped = Array.from(
          new Map(combined.map((item) => [item.id, item])).values(),
        ).sort((a, b) => {
          const aTime = new Date(a.created_at || 0).getTime();
          const bTime = new Date(b.created_at || 0).getTime();
          return bTime - aTime;
        });

        setItems(deduped);

        const { data: profile, error } = await supabase
          .from("profiles")
          .select("username,full_name,avatar_url")
          .eq("id", userId)
          .maybeSingle();

        if (!error && profile) {
          setDisplayName(profile.full_name || profile.username || "");
          setUsername(profile.username || "");
          setAvatarUrl(profile.avatar_url || "");
        }

        const { data: ratingsRows, error: ratingsError } = await supabase
          .from("ratings")
          .select("rating")
          .eq("rated_user_id", userId);

        const ratingsMissing =
          ratingsError?.code === "42P01" ||
          String(ratingsError?.message || "").toLowerCase().includes("relation");

        if (!ratingsError && ratingsRows && ratingsRows.length > 0) {
          const total = ratingsRows.reduce((sum: number, row: any) => sum + Number(row.rating || 0), 0);
          setAverageRating(Number((total / ratingsRows.length).toFixed(1)));
          setReviewCount(ratingsRows.length);
        } else if (ratingsMissing || !ratingsRows?.length) {
          setAverageRating(0);
          setReviewCount(0);
        }

        const followersResult = await supabase
          .from("follows")
          .select("id", { count: "exact", head: true })
          .eq("following_id", userId);
        const followingResultForTarget = await supabase
          .from("follows")
          .select("id", { count: "exact", head: true })
          .eq("follower_id", userId);

        const followsMissing =
          followersResult.error?.code === "42P01" ||
          followingResultForTarget.error?.code === "42P01" ||
          String(followersResult.error?.message || "").toLowerCase().includes("relation") ||
          String(followingResultForTarget.error?.message || "").toLowerCase().includes("relation");

        if (followsMissing) {
          setFollowsEnabled(false);
          setFollowersCount(0);
          setFollowingCount(0);
          setIsFollowing(false);
        } else {
          setFollowsEnabled(true);
          setFollowersCount(Number(followersResult.count || 0));
          setFollowingCount(Number(followingResultForTarget.count || 0));

          if (me && me !== userId) {
            const followingResult = await supabase
              .from("follows")
              .select("id")
              .eq("follower_id", me)
              .eq("following_id", userId)
              .maybeSingle();

            setIsFollowing(Boolean(followingResult.data && !followingResult.error));
          } else {
            setIsFollowing(false);
          }
        }
      } catch (error) {
        console.error("Closet profile load error", error);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [userId]);

  const title = useMemo(() => {
    if (displayName) return `${displayName}'s Closet`;
    if (!userId) return "Closet";
    return `Closet ${userId.slice(0, 8)}`;
  }, [displayName, userId]);

  const initials = useMemo(() => {
    const source = displayName || username || "S";
    return source
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "S";
  }, [displayName, username]);

  if (loading) {
    return <div className="app-shell p-6">Loading closet...</div>;
  }

  async function toggleFollow() {
    if (!userId) return;
    if (!currentUserId) {
      navigate("/auth");
      return;
    }
    if (currentUserId === userId) return;

    setFollowBusy(true);
    try {
      if (isFollowing) {
        const { error } = await supabase
          .from("follows")
          .delete()
          .eq("follower_id", currentUserId)
          .eq("following_id", userId);
        if (error) throw error;
        setIsFollowing(false);
        setFollowersCount((prev) => Math.max(0, prev - 1));
      } else {
        const { error } = await supabase.from("follows").insert({
          follower_id: currentUserId,
          following_id: userId,
        });
        if (error) throw error;
        setIsFollowing(true);
        setFollowersCount((prev) => prev + 1);
      }
    } catch (error: any) {
      alert(error?.message || "Could not update follow status.");
    } finally {
      setFollowBusy(false);
    }
  }

  return (
    <div className="app-shell bg-white pb-24 page-transition">
      <header className="md:sticky md:top-0 md:z-20 bg-white/95 md:backdrop-blur">
        <div className="mx-auto max-w-4xl px-4 pt-8 pb-4 relative">
          <button
            onClick={() => navigate(-1)}
            className="absolute left-4 top-8 w-9 h-9 rounded-full bg-white border border-border/60 flex items-center justify-center shadow-soft"
          >
            <ArrowLeft size={18} className="text-foreground" />
          </button>

          <div className="flex flex-col items-center text-center">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={displayName || username || "Profile"}
                className="h-20 w-20 rounded-full object-cover"
              />
            ) : (
              <div className="h-20 w-20 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-2xl font-bold">
                {initials}
              </div>
            )}

            <h1 className="mt-3 text-2xl font-bold text-foreground">{displayName || title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              @{username || (userId ? userId.slice(0, 8) : "closet")}
            </p>

            <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-sm text-muted-foreground">
              <span>{items.length} listings</span>
              {followsEnabled && (
                <>
                  <span>·</span>
                  <button
                    type="button"
                    onClick={() => navigate(`/connections/${userId}?tab=followers`)}
                    className="hover:text-foreground"
                  >
                    {followersCount} Followers
                  </button>
                  <span>·</span>
                  <button
                    type="button"
                    onClick={() => navigate(`/connections/${userId}?tab=following`)}
                    className="hover:text-foreground"
                  >
                    {followingCount} Following
                  </button>
                </>
              )}
            </div>

            {reviewCount > 0 && (
              <button
                type="button"
                onClick={() => navigate(`/reviews/${userId}`)}
                className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-foreground"
              >
                <Star size={15} className="fill-amber-500 text-amber-500" />
                {averageRating} ({reviewCount} review{reviewCount === 1 ? "" : "s"})
              </button>
            )}

            {userId && currentUserId !== userId && (
              <div className="mt-4 grid grid-cols-2 gap-2 w-full max-w-xs">
                <button
                  type="button"
                  onClick={() => navigate(`/messages?user=${userId}`)}
                  className="h-10 rounded-full border border-border bg-white text-sm font-semibold inline-flex items-center justify-center gap-1.5"
                >
                  <MessageCircle size={15} />
                  Message
                </button>
                {followsEnabled && currentUserId ? (
                  <button
                    type="button"
                    onClick={toggleFollow}
                    disabled={followBusy}
                    className={`h-10 rounded-full text-sm font-semibold disabled:opacity-60 ${
                      isFollowing
                        ? "border border-border bg-white text-foreground"
                        : "bg-primary text-primary-foreground"
                    }`}
                  >
                    {followBusy ? "..." : isFollowing ? "Unfollow" : "Follow"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => navigate("/auth")}
                    className="h-10 rounded-full bg-primary text-primary-foreground text-sm font-semibold"
                  >
                    Follow
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-4xl px-4">
        <div className="md:hidden" style={{ columns: "2", columnGap: "8px" }}>
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => navigate(`/item/${item.id}`)}
              className="w-full text-left bg-transparent"
              style={{ breakInside: "avoid", marginBottom: "8px" }}
            >
              <img
                src={getItemImageUrl(item.image_url, item.id, item.updated_at || item.created_at)}
                alt={item.title}
                style={{ width: "100%", height: "auto", display: "block", borderRadius: "12px" }}
              />
              <p className="mt-1.5 text-[13px] font-semibold text-foreground truncate">{item.title}</p>
              <p className="text-xs text-muted-foreground">${item.price_per_day}/day</p>
            </button>
          ))}
        </div>

        <div className="hidden md:block" style={{ columns: "4", columnGap: "12px" }}>
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => navigate(`/item/${item.id}`)}
              className="w-full text-left bg-transparent"
              style={{ breakInside: "avoid", marginBottom: "12px" }}
            >
              <img
                src={getItemImageUrl(item.image_url, item.id, item.updated_at || item.created_at)}
                alt={item.title}
                style={{ width: "100%", height: "auto", display: "block", borderRadius: "12px" }}
              />
              <p className="mt-1.5 text-[13px] font-semibold text-foreground truncate">{item.title}</p>
              <p className="text-xs text-muted-foreground">${item.price_per_day}/day</p>
            </button>
          ))}
        </div>
      </div>

      {items.length === 0 && (
        <div className="mx-auto max-w-4xl px-4">
          <div className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground bg-white">
            No listings found for this closet yet.
          </div>
        </div>
      )}
    </div>
  );
}
