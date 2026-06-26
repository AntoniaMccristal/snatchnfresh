import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, PenSquare, Send, X } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { getItemImageUrl } from "@/lib/images";
import { usePageRefresh } from "@/hooks/usePageRefresh";
import { clearAppBadgeCount } from "@/lib/pushNotifications";

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

type InboxFilter = "all" | "buying" | "selling";

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
  const [activeFilter, setActiveFilter] = useState<InboxFilter>("all");
  const [showCompose, setShowCompose] = useState(false);
  const [composeQuery, setComposeQuery] = useState("");
  const [composeResults, setComposeResults] = useState<any[]>([]);
  const [composeLoading, setComposeLoading] = useState(false);
  const [mobileView, setMobileView] = useState<"list" | "chat">("list");
  const [conversationBlocked, setConversationBlocked] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const targetUserId = params.get("user") || "";
  const targetItemId = params.get("item") || null;

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    void clearAppBadgeCount();
  }, []);

  useEffect(() => {
    if (targetUserId) setMobileView("chat");
  }, [targetUserId]);

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
          .select("id,title,image_url,updated_at,created_at,owner_id,user_id")
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

  const filteredConversations = useMemo(() => {
    if (activeFilter === "all" || !currentUserId) return conversations;

    return conversations.filter((conversation) => {
      const linkedItem = conversation.itemId ? itemsById[conversation.itemId] : null;
      const ownerId = linkedItem?.owner_id || linkedItem?.user_id;
      if (!ownerId) return false;

      if (activeFilter === "selling") return ownerId === currentUserId;
      return ownerId !== currentUserId;
    });
  }, [activeFilter, conversations, currentUserId, itemsById]);

  const selectedPeerId = targetUserId || conversations[0]?.peerId || "";
  const activeItemId = targetItemId || conversations.find((c) => c.peerId === selectedPeerId)?.itemId || null;
  const selectedProfile = profiles[selectedPeerId];
  const activeItem = activeItemId ? itemsById[activeItemId] : null;

  const checkBlocked = useCallback(async (otherUserId: string, userId: string) => {
    const { data, error } = await supabase
      .from("blocks")
      .select("id")
      .or(`and(blocker_id.eq.${userId},blocked_id.eq.${otherUserId}),and(blocker_id.eq.${otherUserId},blocked_id.eq.${userId})`)
      .limit(1);

    const blocksMissing =
      error?.code === "42P01" ||
      String(error?.message || "").toLowerCase().includes("relation");

    if (error && !blocksMissing) {
      console.error("Block check failed", error);
      return false;
    }

    return (data || []).length > 0;
  }, []);

  useEffect(() => {
    if (!selectedPeerId || !currentUserId) {
      setConversationBlocked(false);
      return;
    }

    let cancelled = false;
    const runCheck = async () => {
      const blocked = await checkBlocked(selectedPeerId, currentUserId);
      if (!cancelled) setConversationBlocked(blocked);
    };

    void runCheck();
    return () => {
      cancelled = true;
    };
  }, [checkBlocked, currentUserId, selectedPeerId]);

  const markMessagesAsRead = useCallback(async (peerId: string, userId: string) => {
    const readAt = new Date().toISOString();

    const { error } = await supabase
      .from("messages")
      .update({ read_at: readAt })
      .eq("receiver_id", userId)
      .eq("sender_id", peerId)
      .is("read_at", null);

    if (error) {
      console.error("Failed to mark messages as read", error);
      return;
    }

    setMessages((prev) =>
      prev.map((message) =>
        message.receiver_id === userId && message.sender_id === peerId && !message.read_at
          ? { ...message, read_at: readAt }
          : message,
      ),
    );
  }, []);

  useEffect(() => {
    if (!selectedPeerId || !currentUserId || !messagesEnabled) return;
    void markMessagesAsRead(selectedPeerId, currentUserId);
  }, [currentUserId, markMessagesAsRead, messagesEnabled, selectedPeerId]);

  useEffect(() => {
    const searchProfiles = async () => {
      const query = composeQuery.trim();
      if (!showCompose || query.length < 2) {
        setComposeResults([]);
        setComposeLoading(false);
        return;
      }

      setComposeLoading(true);
      const { data, error } = await supabase
        .from("profiles")
        .select("id,username,full_name,avatar_url")
        .ilike("username", `%${query}%`)
        .limit(10);

      if (error) {
        console.error("Profile search failed", error);
        setComposeResults([]);
      } else {
        setComposeResults((data || []).filter((profile: any) => profile.id !== currentUserId));
      }
      setComposeLoading(false);
    };

    const timeout = window.setTimeout(() => {
      void searchProfiles();
    }, 200);

    return () => window.clearTimeout(timeout);
  }, [composeQuery, currentUserId, showCompose]);

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
          .select("id,title,image_url,updated_at,created_at,owner_id,user_id")
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

  useEffect(() => {
    scrollToBottom();
  }, [threadMessages]);

  async function sendMessage() {
    if (!messagesEnabled || !currentUserId || !selectedPeerId) return;
    if (!draft.trim()) return;

    const blocked = conversationBlocked || await checkBlocked(selectedPeerId, currentUserId);
    if (blocked) {
      setConversationBlocked(true);
      alert("You cannot message this user.");
      return;
    }

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
        const messageText = String(payload.body || "");
        setDraft("");
        const receiverId = selectedPeerId;

        try {
          const { data: sessionData } = await supabase.auth.getSession();
          const token = sessionData.session?.access_token;
          const senderName =
            String(
              sessionData.session?.user?.user_metadata?.full_name ||
              sessionData.session?.user?.user_metadata?.first_name ||
              profiles[currentUserId]?.full_name ||
              profiles[currentUserId]?.username ||
              sessionData.session?.user?.email?.split("@")[0] ||
              "Someone",
            ).trim() || "Someone";

          if (token && receiverId) {
            await fetch("/api/send-push-notification", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                user_id: receiverId,
                title: `${senderName || "New message"} on Snatch'n`,
                body: messageText.length > 100 ? messageText.slice(0, 97) + "..." : messageText,
                url: `/messages?user=${receiverId}`,
              }),
            });
          }
        } catch (err) {
          console.error("Push notification failed:", err);
        }
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
      <header className={`px-5 pt-[max(0.75rem,env(safe-area-inset-top))] pb-4 items-center gap-3 ${mobileView === "chat" ? "hidden md:flex" : "flex"}`}>
        <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full bg-card border border-border/60 flex items-center justify-center shadow-soft">
          <ArrowLeft size={18} className="text-foreground" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold text-foreground">Inbox</h1>
          <p className="text-sm text-muted-foreground">Messages</p>
        </div>
        <button
          onClick={() => setShowCompose(true)}
          className="w-9 h-9 rounded-full bg-foreground text-background flex items-center justify-center"
          aria-label="Compose new message"
        >
          <PenSquare size={16} />
        </button>
      </header>

      <div className={`px-5 pb-3 gap-2 ${mobileView === "chat" ? "hidden md:flex" : "flex"}`}>
        {[
          { id: "all", label: "All" },
          { id: "buying", label: "Buying" },
          { id: "selling", label: "Selling" },
        ].map((tab) => {
          const active = activeFilter === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveFilter(tab.id as InboxFilter)}
              className={`rounded-full px-4 py-1.5 text-sm ${
                active
                  ? "bg-foreground text-background font-semibold"
                  : "border border-border text-foreground"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="px-0 md:px-5 md:grid md:grid-cols-[320px_1fr] md:gap-3">
        <div className={`${mobileView === "chat" ? "hidden md:flex" : "flex"} w-full h-[calc(100vh-9rem)] md:h-auto md:max-h-[60vh] md:w-80 flex-col overflow-hidden overflow-y-auto rounded-none border-y border-gray-100 bg-card md:rounded-2xl md:border md:border-border/60`}>
          {filteredConversations.length === 0 && (
            <p className="text-sm text-muted-foreground p-4">No conversations yet.</p>
          )}
          {filteredConversations.map((conv) => {
            const profile = profiles[conv.peerId];
            const linkedItem = conv.itemId ? itemsById[conv.itemId] : null;
            const active = conv.peerId === selectedPeerId;
            const itemImage = linkedItem?.image_url
              ? getItemImageUrl(linkedItem.image_url, linkedItem.id, linkedItem.updated_at || linkedItem.created_at)
              : "";
            return (
              <button
                key={conv.peerId}
                onClick={() => {
                  setMobileView("chat");
                  navigate(`/messages?user=${conv.peerId}${conv.itemId ? `&item=${conv.itemId}` : ""}`);
                }}
                className={`w-full text-left flex items-center gap-3 p-4 border-b border-gray-100 transition-colors ${
                  active ? "bg-gray-50" : "bg-white hover:bg-gray-50"
                }`}
              >
                {itemImage ? (
                  <img src={itemImage} alt={linkedItem?.title || "Listing"} className="w-14 h-14 rounded-xl object-cover flex-shrink-0" />
                ) : profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt={getDisplayName(profile)} className="w-14 h-14 rounded-xl object-cover flex-shrink-0" />
                ) : (
                  <div className="w-14 h-14 rounded-xl bg-muted flex items-center justify-center text-base font-bold flex-shrink-0">
                    {getInitial(profile)}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-base text-foreground truncate">{getDisplayName(profile)}</p>
                  <p className="text-sm text-muted-foreground truncate">{conv.last.body}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{formatTime(conv.last.created_at)}</p>
                </div>
                {conv.unread > 0 && (
                  <span className="inline-flex min-w-6 h-6 px-1.5 rounded-full bg-primary text-primary-foreground text-xs font-bold items-center justify-center flex-shrink-0">
                    {conv.unread}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className={`${mobileView === "list" ? "hidden md:flex" : "flex"} w-full h-[calc(100vh-4rem)] md:h-auto md:max-h-[60vh] flex-1 flex-col overflow-hidden rounded-none bg-card md:rounded-2xl md:border md:border-border/60`}>
          <button
            onClick={() => setMobileView("list")}
            className="md:hidden flex items-center gap-2 p-4 border-b border-gray-100 text-sm font-semibold"
          >
            <ArrowLeft size={18} /> Back
          </button>
          {selectedPeerId && (
            <div className="sticky top-0 z-10 border-b border-gray-100 bg-white p-3">
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
            </div>
          )}
          {activeItem && (
            <button
              type="button"
              onClick={() => navigate(`/item/${activeItem.id}`)}
              className="flex items-center gap-3 border-b border-gray-100 bg-gray-50 p-3 text-left cursor-pointer"
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
          <div className="flex-1 overflow-y-auto space-y-3 px-3 py-3">
            {threadMessages.length === 0 && (
              <p className="text-xs text-muted-foreground">Start the conversation.</p>
            )}
            {threadMessages.map((message) => {
              const mine = message.sender_id === currentUserId;
              const senderProfile = profiles[message.sender_id];
              return (
                <div key={message.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
                    {!mine && (
                      <p className="mb-1 text-[11px] font-semibold text-foreground">
                        {getDisplayName(senderProfile)}
                      </p>
                    )}
                    <div className={`max-w-[75%] w-fit rounded-2xl px-4 py-2.5 text-sm ${mine ? "ml-auto bg-foreground text-background rounded-br-sm" : "bg-gray-100 text-foreground rounded-bl-sm"}`}>
                      <p>{message.body}</p>
                    </div>
                    <p className={`text-xs text-muted-foreground mt-1 ${mine ? "text-right" : "text-left"}`}>
                      {formatTime(message.created_at)}
                    </p>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {selectedPeerId && conversationBlocked && (
            <div className="border-t border-gray-100 p-4 text-center text-sm text-muted-foreground">
              You cannot message this user.
            </div>
          )}

          {selectedPeerId && !conversationBlocked && (
            <div className="border-t border-gray-100 p-3 flex gap-2">
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

      {showCompose && (
        <div className="fixed inset-0 z-[120] flex items-end bg-black/30">
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            onClick={() => setShowCompose(false)}
            aria-label="Close new message"
          />
          <section className="relative w-full rounded-t-3xl bg-white p-5 shadow-[0_-18px_50px_rgba(0,0,0,0.18)] animate-in slide-in-from-bottom duration-200">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-foreground">New message</h2>
              <button
                type="button"
                onClick={() => setShowCompose(false)}
                className="w-9 h-9 rounded-full border border-border flex items-center justify-center"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            <input
              value={composeQuery}
              onChange={(event) => setComposeQuery(event.target.value)}
              placeholder="Search by username..."
              className="h-12 w-full rounded-2xl border border-border bg-background px-4 text-sm outline-none focus:ring-2 focus:ring-foreground/10"
              autoFocus
            />

            <div className="mt-4 max-h-[42vh] overflow-y-auto">
              {composeQuery.trim().length > 0 && composeQuery.trim().length < 2 && (
                <p className="px-1 py-3 text-sm text-muted-foreground">Type at least 2 characters.</p>
              )}
              {composeLoading && (
                <p className="px-1 py-3 text-sm text-muted-foreground">Searching...</p>
              )}
              {!composeLoading && composeQuery.trim().length >= 2 && composeResults.length === 0 && (
                <p className="px-1 py-3 text-sm text-muted-foreground">No users found.</p>
              )}
              {composeResults.map((profile) => (
                <button
                  key={profile.id}
                  type="button"
                  onClick={() => {
                    setShowCompose(false);
                    setComposeQuery("");
                    setComposeResults([]);
                    navigate(`/messages?user=${profile.id}`);
                  }}
                  className="flex w-full items-center gap-3 rounded-2xl p-3 text-left hover:bg-gray-50"
                >
                  {profile.avatar_url ? (
                    <img
                      src={profile.avatar_url}
                      alt={getDisplayName(profile)}
                      className="h-11 w-11 rounded-full object-cover"
                    />
                  ) : (
                    <div className="h-11 w-11 rounded-full bg-muted flex items-center justify-center text-sm font-bold">
                      {getInitial(profile)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-foreground truncate">{profile.username || getDisplayName(profile)}</p>
                    <p className="text-xs text-muted-foreground truncate">{profile.full_name || "Snatch'n member"}</p>
                  </div>
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
