import { useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";

type Tab = "followers" | "following";

function getDisplayName(profile: any, fallbackId = "") {
  return profile?.full_name || profile?.username || (fallbackId ? `User ${fallbackId.slice(0, 6)}` : "User");
}

export default function Connections() {
  const navigate = useNavigate();
  const { userId } = useParams();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [targetUserId, setTargetUserId] = useState("");
  const [targetName, setTargetName] = useState("Connections");
  const [tab, setTab] = useState<Tab>(searchParams.get("tab") === "following" ? "following" : "followers");
  const [profilesById, setProfilesById] = useState<Record<string, any>>({});
  const [followers, setFollowers] = useState<string[]>([]);
  const [following, setFollowing] = useState<string[]>([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        let target = userId || "";
        if (!target) {
          const { data } = await supabase.auth.getUser();
          const me = data?.user?.id || "";
          if (!me) {
            navigate("/auth");
            return;
          }
          target = me;
        }
        setTargetUserId(target);

        const { data: meProfile } = await supabase
          .from("profiles")
          .select("full_name,username")
          .eq("id", target)
          .maybeSingle();
        setTargetName(getDisplayName(meProfile, target));

        const [{ data: followerRows }, { data: followingRows }] = await Promise.all([
          supabase.from("follows").select("follower_id").eq("following_id", target),
          supabase.from("follows").select("following_id").eq("follower_id", target),
        ]);

        const followerIds = (followerRows || []).map((row: any) => row.follower_id).filter(Boolean);
        const followingIds = (followingRows || []).map((row: any) => row.following_id).filter(Boolean);
        setFollowers(followerIds);
        setFollowing(followingIds);

        const ids = Array.from(new Set([...followerIds, ...followingIds, target]));
        if (ids.length > 0) {
          const { data: profiles } = await supabase
            .from("profiles")
            .select("id,full_name,username,avatar_url")
            .in("id", ids);
          const map: Record<string, any> = {};
          (profiles || []).forEach((profile: any) => {
            map[profile.id] = profile;
          });
          setProfilesById(map);
        } else {
          setProfilesById({});
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [navigate, userId]);

  const rows = useMemo(() => (tab === "followers" ? followers : following), [followers, following, tab]);

  if (loading) return <div className="app-shell p-6">Loading connections...</div>;

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
          <h1 className="text-base font-display font-semibold text-foreground">{targetName}</h1>
          <p className="text-xs text-muted-foreground">Followers and following</p>
        </div>
      </header>

      <div className="px-5">
        <div className="grid grid-cols-2 gap-2 mb-4">
          <button
            type="button"
            onClick={() => setTab("followers")}
            className={`h-9 rounded-xl border text-xs font-semibold ${
              tab === "followers"
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card border-border text-foreground"
            }`}
          >
            Followers ({followers.length})
          </button>
          <button
            type="button"
            onClick={() => setTab("following")}
            className={`h-9 rounded-xl border text-xs font-semibold ${
              tab === "following"
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card border-border text-foreground"
            }`}
          >
            Following ({following.length})
          </button>
        </div>

        {rows.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground bg-card">
            No users in this section yet.
          </div>
        )}

        <div className="space-y-2">
          {rows.map((id) => {
            const profile = profilesById[id];
            return (
              <button
                key={id}
                onClick={() => navigate(`/closet/${id}`)}
                className="w-full rounded-2xl border border-border/60 bg-card p-3 flex items-center gap-3 text-left"
              >
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt={getDisplayName(profile, id)} className="w-10 h-10 rounded-full object-cover" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-sm font-semibold">
                    {getDisplayName(profile, id).charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{getDisplayName(profile, id)}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {profile?.username ? `@${profile.username}` : id}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
