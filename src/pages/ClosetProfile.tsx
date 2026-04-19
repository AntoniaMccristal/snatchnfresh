import { useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { getItemImageUrl } from "@/lib/images";

export default function ClosetProfile() {
  const { userId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<any[]>([]);
  const [displayName, setDisplayName] = useState<string>("");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [followsEnabled, setFollowsEnabled] = useState(true);

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
          .select("username,full_name")
          .eq("id", userId)
          .maybeSingle();

        if (!error && profile) {
          setDisplayName(profile.full_name || profile.username || "");
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
    <div className="app-shell bg-warm-gradient pb-24 page-transition">
      <header className="px-5 pt-[max(0.75rem,env(safe-area-inset-top))] pb-4 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-full bg-card border border-border/60 flex items-center justify-center shadow-soft"
        >
          <ArrowLeft size={18} className="text-foreground" />
        </button>
        <div>
          <h1 className="text-base font-display font-semibold text-foreground">{title}</h1>
          <div className="flex items-center gap-2 text-xs">
            <p className="text-muted-foreground">{items.length} listings</p>
            {followsEnabled && (
              <>
                <span className="text-muted-foreground">·</span>
                <button
                  type="button"
                  onClick={() => navigate(`/connections/${userId}?tab=followers`)}
                  className="text-foreground hover:underline"
                >
                  {followersCount} Followers
                </button>
                <span className="text-muted-foreground">·</span>
                <button
                  type="button"
                  onClick={() => navigate(`/connections/${userId}?tab=following`)}
                  className="text-foreground hover:underline"
                >
                  {followingCount} Following
                </button>
              </>
            )}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate(`/reviews/${userId}`)}
            className="h-8 px-2.5 rounded-lg border border-border text-xs font-semibold"
          >
            Reviews
          </button>
          {followsEnabled && currentUserId && currentUserId !== userId && (
            <button
              type="button"
              onClick={toggleFollow}
              disabled={followBusy}
              className={`h-8 px-3 rounded-lg text-xs font-semibold disabled:opacity-60 ${
                isFollowing
                  ? "border border-border bg-card text-foreground"
                  : "bg-primary text-primary-foreground"
              }`}
            >
              {followBusy ? "..." : isFollowing ? "Following" : "Follow"}
            </button>
          )}
        </div>
      </header>

      <div className="mx-auto w-full max-w-7xl px-5 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => navigate(`/item/${item.id}`)}
            className="text-left rounded-2xl border border-border/60 bg-card p-3 shadow-soft"
          >
            <img
              src={getItemImageUrl(item.image_url, item.id, item.updated_at || item.created_at)}
              alt={item.title}
              className="w-full h-36 md:h-40 xl:h-44 object-cover rounded-xl"
            />
            <p className="mt-2 text-sm font-semibold text-foreground truncate">{item.title}</p>
            <p className="text-xs text-muted-foreground">${item.price_per_day}/day</p>
          </button>
        ))}
      </div>

      {items.length === 0 && (
        <div className="px-5">
          <div className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground bg-card">
            No listings found for this closet yet.
          </div>
        </div>
      )}
    </div>
  );
}
