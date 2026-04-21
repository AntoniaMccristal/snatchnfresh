import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Send } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { getItemImageUrl } from "@/lib/images";
import { usePageRefresh } from "@/hooks/usePageRefresh";

function formatTime(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

type MessageRow = {
  id: string;
  sender_id: string;
  receiver_id: string;
  body: string;
  created_at: string;
  item_id?: string | null;
  read_at?: string | null;
};

function getDisplayName(profile: any) {
  return (
    profile?.username ||
    profile?.full_name ||
    profile?.first_name ||
    (profile?.id ? `Member ${String(profile.id).slice(0, 4)}` : "User")
  );
}

function getUsernameTag(profile: any) {
  if (profile?.username) return `@${profile.username}`;
  if (profile?.full_name || profile?.first_name) return "";
  return profile?.id ? `#${String(profile.id).slice(0, 6)}` : "@user";
}

function getInitial(profile: any) {
  const source = profile?.username || profile?.full_name || "U";
  return String(source).charAt(0).toUpperCase();
}

export default function Messages() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [messagesEnabled, setMessagesEnabled] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, any>>({});
  const [itemsById, setItemsById] = useState<Record<string, any>>({});
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const targetUserId = params.get("user") || "";
  const targetItemId = params.get("item") || null;

  const loadMessages = useCallback(async () => {
    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id || null;
    setCurrentUserId(userId);

    if (!userId) {
      navigate("/auth", { replace: true });
      return;
    }

    const { data, error } = await supabase
      .from("messages")
      .select("id,sender_id,receiver_id,body,created_at,item_id,read_at")
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      const missing =
        error.code === "42P01" ||
        error.code === "42703" ||
        String(error.message || "").toLowerCase().includes("relation");

      if (missing) {
        setMessagesEnabled(false);
        setMessages([]);
        setLoading(false);
        return;
      }

      console.error("Messages load error", error);
    } else {
      setMessages((data || []) as MessageRow[]);

      const userIds = Array.from(new Set((data || []).flatMap((m: any) => [m.sender_id, m.receiver_id]).filter(Boolean)));

      if (userIds.length > 0) {
        const { data: profileRows } = await supabase
          .from("profiles")
          .select("id,full_name,username,avatar_url")
          .in("id", userIds);

        const byId: Record<string, any> = {};
        (profileRows || []).forEach((p: any) => {
          byId[p.id] = p;
        });
        setProfiles(byId);
      }

      const itemIds = Array.from(new Set((data || []).map((m: any) => m.item_id).filter(Boolean)));
      if (itemIds.length > 0) {
        const { data: itemRows } = await supabase
          .from("items")
          .select("id,title,image_url,updated_at,created_at")
          .in("id", itemIds);
        const byItemId: Record<string, any> = {};
        (itemRows || []).forEach((item: any) => {
          byItemId[item.id] = item;
        });
        setItemsById(byItemId);
      }
    }

    setLoading(false);
  }, [navigate]);

  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

  usePageRefresh(loadMessages, [loadMessages]);

  const conversations = useMemo(() => {
    if (!currentUserId) return [];

    const byPeer = new Map<string, { peerId: string; last: MessageRow; unread: number; itemId?: string | null }>();

    messages.forEach((m) => {
      const peerId = m.sender_id === currentUserId ? m.receiver_id : m.sender_id;
      if (!peerId) return;

      const existing = byPeer.get(peerId);
      const unreadIncrement = m.receiver_id === currentUserId && !m.read_at ? 1 : 0;

      if (!existing) {
        byPeer.set(peerId, {
          peerId,
          last: m,
          unread: unreadIncrement,
          itemId: m.item_id || null,
        });
        return;
      }

      if (new Date(m.created_at).getTime() > new Date(existing.last.created_at).getTime()) {
        existing.last = m;
        existing.itemId = m.item_id || existing.itemId;
      }
      if (!existing.itemId && m.item_id) {
        existing.itemId = m.item_id;
      }
      existing.unread += unreadIncrement;
      byPeer.set(peerId, existing);
    });

    return Array.from(byPeer.values()).sort(
      (a, b) => new Date(b.last.created_at).getTime() - new Date(a.last.created_at).getTime(),
    );
  }, [messages, currentUserId]);

  const selectedPeerId = targetUserId || conversations[0]?.peerId || "";
  const activeItemId = targetItemId || conversations.find((c) => c.peerId === selectedPeerId)?.itemId || null;
  const selectedProfile = profiles[selectedPeerId];
  const activeItem = activeItemId ? itemsById[activeItemId] : null;

  useEffect(() => {
    const loadExplicitContext = async () => {
      if (selectedPeerId && !profiles[selectedPeerId]) {
        const { data: directProfile } = await supabase
          .from("profiles")
          .select("id,full_name,username,avatar_url,first_name,last_name")
          .eq("id", selectedPeerId)
          .maybeSingle();

        if (directProfile) {
          setProfiles((prev) => ({
            ...prev,
            [selectedPeerId]: directProfile,
          }));
        } else {
          setProfiles((prev) => ({
            ...prev,
            [selectedPeerId]: { id: selectedPeerId },
          }));
        }
      }

      if (activeItemId && !itemsById[activeItemId]) {
        const { data: directItem } = await supabase
          .from("items")
          .select("id,title,image_url,updated_at,created_at")
          .eq("id", activeItemId)
          .maybeSingle();

        if (directItem) {
          setItemsById((prev) => ({
            ...prev,
            [activeItemId]: directItem,
          }));
        }
      }
    };

    loadExplicitContext();
  }, [selectedPeerId, activeItemId, profiles, itemsById]);

  const threadMessages = useMemo(() => {
    if (!selectedPeerId || !currentUserId) return [];
    return messages
      .filter(
        (m) =>
          (m.sender_id === currentUserId && m.receiver_id === selectedPeerId) ||
          (m.sender_id === selectedPeerId && m.receiver_id === currentUserId),
      )
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }, [messages, currentUserId, selectedPeerId]);

  async function sendMessage() {
    if (!messagesEnabled || !currentUserId || !selectedPeerId) return;
    if (!draft.trim()) return;

    setSending(true);

    const payload: any = {
      sender_id: currentUserId,
      receiver_id: selectedPeerId,
      body: draft.trim(),
      item_id: activeItemId,
    };

    let error: any = null;
    for (let i = 0; i < 4; i += 1) {
      const result = await supabase.from("messages").insert(payload).select("*").maybeSingle();
      error = result.error;
      if (!error && result.data) {
        setMessages((prev) => [result.data as MessageRow, ...prev]);
        setDraft("");
        break;
      }

      const missingColumn =
        error?.code === "42703" ||
        error?.code === "PGRST204" ||
        String(error?.message || "").toLowerCase().includes("column");

      if (!missingColumn) break;
      const match = String(error?.message || "").match(/['"]([a-zA-Z0-9_]+)['"]/);
      const col = match?.[1];
      if (!col || !(col in payload)) break;
      delete payload[col];
    }

    if (error) {
      console.error("Send message failed", error);
      alert(error.message || "Could not send message.");
    }

    setSending(false);
  }

  if (loading) {
    return <div className="app-shell p-6">Loading inbox...</div>;
  }

  if (!messagesEnabled) {
    return (
      <div className="app-shell bg-warm-gradient p-6">
        <h1 className="text-lg font-semibold">Inbox</h1>
        <p className="text-sm text-muted-foreground mt-2">Messaging is not configured yet.</p>
      </div>
    );
  }

  return (
    <div className="app-shell bg-warm-gradient pb-24 page-transition">
      <header className="px-5 pt-[max(0.75rem,env(safe-area-inset-top))] pb-4 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full bg-card border border-border/60 flex items-center justify-center shadow-soft">
          <ArrowLeft size={18} className="text-foreground" />
        </button>
        <div>
          <h1 className="text-lg font-display font-semibold text-foreground">Inbox</h1>
          <p className="text-xs text-muted-foreground">Message lenders and renters</p>
        </div>
      </header>

      <div className="px-5 grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-3">
        <div className="rounded-2xl border border-border/60 bg-card p-2 space-y-1 max-h-[60vh] overflow-y-auto">
          {conversations.length === 0 && (
            <p className="text-xs text-muted-foreground p-2">No conversations yet.</p>
          )}
          {conversations.map((conv) => {
            const profile = profiles[conv.peerId];
            const linkedItem = conv.itemId ? itemsById[conv.itemId] : null;
            const active = conv.peerId === selectedPeerId;
            return (
              <button
                key={conv.peerId}
                onClick={() => navigate(`/messages?user=${conv.peerId}${conv.itemId ? `&item=${conv.itemId}` : ""}`)}
                className={`relative w-full text-left rounded-xl p-3.5 border transition-colors ${
                  active ? "border-primary/40 bg-primary/5 border-l-2 border-l-primary" : "border-border/40 hover:bg-muted/20"
                }`}
              >
                <div className="flex items-start gap-3">
                  {profile?.avatar_url ? (
                    <img src={profile.avatar_url} alt={getDisplayName(profile)} className="w-10 h-10 rounded-full object-cover" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-sm font-bold">
                      {getInitial(profile)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-foreground truncate">{getDisplayName(profile)}</p>
                    <p className="text-[11px] text-muted-foreground">{getUsernameTag(profile)}</p>
                    <p className="mt-1 text-xs text-muted-foreground truncate">{conv.last.body}</p>
                    {linkedItem && (
                      <div className="mt-1.5 inline-flex items-center gap-1 rounded-md border border-border/50 bg-background px-1.5 py-1 max-w-full">
                        <img
                          src={getItemImageUrl(linkedItem.image_url, linkedItem.id, linkedItem.updated_at || linkedItem.created_at)}
                          alt={linkedItem.title}
                          className="w-6 h-6 rounded object-cover"
                        />
                        <span className="text-[10px] text-foreground truncate">{linkedItem.title}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex min-h-full flex-col items-end justify-between gap-2">
                    {conv.unread > 0 && (
                      <span className="inline-flex min-w-5 h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold items-center justify-center">
                        {conv.unread}
                      </span>
                    )}
                    <p className="text-[10px] text-muted-foreground">{formatTime(conv.last.created_at)}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="rounded-2xl border border-border/60 bg-card p-3 flex flex-col max-h-[60vh]">
          {selectedPeerId && (
            <div className="mb-2 p-3 rounded-2xl border border-border/50 bg-background space-y-3">
              <div className="flex items-center gap-3">
                {selectedProfile?.avatar_url ? (
                  <img src={selectedProfile.avatar_url} alt={getDisplayName(selectedProfile)} className="w-11 h-11 rounded-full object-cover border border-border/40" />
                ) : (
                  <div className="w-11 h-11 rounded-full bg-muted flex items-center justify-center text-sm font-semibold border border-border/40">
                    {getInitial(selectedProfile)}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-foreground truncate">{getDisplayName(selectedProfile)}</p>
                  <p className="text-[11px] text-muted-foreground">{getUsernameTag(selectedProfile)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate(`/closet/${selectedPeerId}`)}
                  className="h-8 px-3 rounded-lg border border-border text-[11px] font-semibold hover:bg-muted/40 transition-colors"
                >
                  View profile
                </button>
              </div>
              {activeItem && (
                <button
                  type="button"
                  onClick={() => navigate(`/item/${activeItem.id}`)}
                  className="w-full text-left flex items-center gap-3 rounded-xl border border-border/50 bg-card p-2.5 hover:bg-muted/30 transition-colors"
                >
                  <img
                    src={getItemImageUrl(activeItem.image_url, activeItem.id, activeItem.updated_at || activeItem.created_at)}
                    alt={activeItem.title}
                    className="w-12 h-12 rounded-lg object-cover border border-border/40"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] text-muted-foreground">Enquiry about listing</p>
                    <p className="text-sm font-semibold text-foreground truncate">{activeItem.title}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Tap to open listing</p>
                  </div>
                </button>
              )}
            </div>
          )}
          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {threadMessages.length === 0 && (
              <p className="text-xs text-muted-foreground">Start the conversation.</p>
            )}
            {threadMessages.map((message) => {
              const mine = message.sender_id === currentUserId;
              const messageItem = message.item_id ? itemsById[message.item_id] : null;
              const senderProfile = profiles[message.sender_id];
              return (
                <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div className="max-w-[88%]">
                    {!mine && (
                      <p className="mb-1 text-[11px] font-semibold text-foreground">
                        {getDisplayName(senderProfile)}
                      </p>
                    )}
                    <div className={`rounded-2xl px-3 py-2 text-sm ${mine ? "bg-foreground text-background rounded-br-sm" : "bg-card border border-border/50 text-foreground rounded-bl-sm"}`}>
                    {messageItem && (
                      <div className={`mb-1.5 rounded-lg border ${mine ? "border-white/30 bg-white/10" : "border-border/40 bg-background/70"} p-1.5 flex items-center gap-1.5`}>
                        <img
                          src={getItemImageUrl(messageItem.image_url, messageItem.id, messageItem.updated_at || messageItem.created_at)}
                          alt={messageItem.title}
                          className="w-7 h-7 rounded object-cover"
                        />
                        <span className={`text-[11px] truncate ${mine ? "text-primary-foreground" : "text-foreground"}`}>
                          {messageItem.title}
                        </span>
                      </div>
                    )}
                    <p>{message.body}</p>
                    <p className={`text-[10px] mt-1 opacity-60 ${mine ? "text-background" : "text-muted-foreground"}`}>
                      {formatTime(message.created_at)}
                    </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {selectedPeerId && (
            <div className="mt-2 flex gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Write a message..."
                className="flex-1 h-12 rounded-2xl border border-border/60 bg-background px-4 text-sm"
              />
              <button
                type="button"
                onClick={sendMessage}
                disabled={sending || !draft.trim()}
                className="h-11 w-11 rounded-xl bg-foreground text-background flex items-center justify-center disabled:opacity-50"
              >
                <Send size={14} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
