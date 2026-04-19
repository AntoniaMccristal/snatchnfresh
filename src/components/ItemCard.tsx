import { Heart, MapPin } from "lucide-react";
import { MouseEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { FALLBACK_ITEM_IMAGE, getItemImageUrl } from "@/lib/images";

interface ItemCardProps {
  item: any;
  variant?: "grid" | "featured";
}

const ItemCard = ({ item, variant = "grid" }: ItemCardProps) => {
  const navigate = useNavigate();
  const [liked, setLiked] = useState(false);
  const [likesEnabled, setLikesEnabled] = useState(true);
  const [loadingLikeState, setLoadingLikeState] = useState(true);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    const loadLikeState = async () => {
      if (!item?.id) return;

      setLoadingLikeState(true);

      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;

      if (!user) {
        setLiked(false);
        setLoadingLikeState(false);
        return;
      }

      const { data, error } = await supabase
        .from("likes")
        .select("id")
        .eq("user_id", user.id)
        .eq("item_id", item.id)
        .maybeSingle();

      if (error) {
        const message = String(error.message || "").toLowerCase();
        const missingLikesTable =
          error.code === "42P01" ||
          message.includes("relation") ||
          message.includes("could not find the table") ||
          message.includes("schema cache");

        if (missingLikesTable) {
          setLikesEnabled(false);
          setLiked(false);
        } else {
          console.error(error);
        }
      } else {
        setLikesEnabled(true);
        setLiked(Boolean(data?.id));
      }

      setLoadingLikeState(false);
    };

    loadLikeState();
  }, [item?.id]);

  useEffect(() => {
    setImageFailed(false);
  }, [item?.image_url, item?.updated_at, item?.created_at, item?.id]);

  async function toggleLike(e: MouseEvent<HTMLButtonElement>) {
    e.stopPropagation();

    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;

    if (!user) {
      navigate("/auth");
      return;
    }

    if (!likesEnabled) {
      alert("Likes are not configured yet in the database.");
      return;
    }

    if (liked) {
      const { error } = await supabase
        .from("likes")
        .delete()
        .eq("user_id", user.id)
        .eq("item_id", item.id);

      if (error) {
        alert(error.message);
        return;
      }

      setLiked(false);
      return;
    }

    const { error } = await supabase.from("likes").insert({
      user_id: user.id,
      item_id: item.id,
    });

    if (error) {
      if (error.code === "23505") {
        setLiked(true);
        return;
      }

      const missingLikesTable =
        error.code === "42P01" ||
        String(error.message || "").toLowerCase().includes("relation") ||
        String(error.message || "").toLowerCase().includes("could not find the table") ||
        String(error.message || "").toLowerCase().includes("schema cache");

      if (missingLikesTable) {
        setLikesEnabled(false);
        alert("Likes are not configured yet in the database.");
        return;
      }

      alert(error.message);
      return;
    }

    setLiked(true);
  }

  if (!item) return null;
  const ownerId = item.owner_id || item.user_id;
  const itemArea = item.location || item.suburb || item.area || "";

  const imageSrc = imageFailed
    ? FALLBACK_ITEM_IMAGE
    : getItemImageUrl(item.image_url, item.id, item.updated_at || item.created_at);

  return (
    <div
      className={`group cursor-pointer card-lift ${
        variant === "featured" ? "w-[220px] flex-shrink-0" : ""
      }`}
      onClick={() => navigate(`/item/${item.id}`)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          navigate(`/item/${item.id}`);
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`Open listing for ${item.title || "item"}`}
    >
      <div className="relative overflow-hidden rounded-2xl bg-muted aspect-[3/4] shadow-soft">
        <img
          src={imageSrc}
          alt={item.title || "Item"}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          onError={() => setImageFailed(true)}
        />

        <button
          onClick={toggleLike}
          disabled={loadingLikeState}
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/80 flex items-center justify-center shadow-soft disabled:opacity-50"
        >
          <Heart
            size={16}
            className={liked ? "fill-primary text-primary" : "text-foreground"}
          />
        </button>

        {item.condition && (
          <div className="absolute top-3 left-3 px-2 py-1 text-[10px] font-semibold bg-white/80 rounded-full shadow-soft">
            {item.condition}
          </div>
        )}

        {item.distance && (
          <div className="absolute bottom-3 left-3 flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/80 text-[10px] font-medium shadow-soft">
            <MapPin size={9} />
            {item.distance}
          </div>
        )}
      </div>

      <div className="mt-3 space-y-1 px-1">
        <p className="text-[13px] font-semibold text-foreground truncate">{item.title}</p>

        {item.brand && <p className="text-[11px] text-muted-foreground">{item.brand}</p>}
        {itemArea && (
          <p className="text-[11px] text-muted-foreground truncate">{itemArea}</p>
        )}

        <div className="flex items-center justify-between pt-1">
          <p className="text-[14px] font-bold text-primary">
            ${item.price_per_day}
            <span className="text-[11px] font-normal text-muted-foreground">/day</span>
          </p>
          {ownerId && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/closet/${ownerId}`);
              }}
              className="text-[11px] font-semibold text-primary hover:underline"
            >
              Closet
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ItemCard;
