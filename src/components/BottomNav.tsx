import { Compass, Home, MessageCircle, PlusSquare, User } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { clearAppBadgeCount, setAppBadgeCount } from "@/lib/pushNotifications";

const navItems = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/discover", label: "Search", icon: Compass },
  { to: "/list", label: "List", icon: PlusSquare },
  { to: "/messages", label: "Inbox", icon: MessageCircle },
  { to: "/profile", label: "Profile", icon: User },
];

export default function BottomNav() {
  const location = useLocation();
  const [unreadCount, setUnreadCount] = useState(0);

  const hiddenOnPaths = ["/auth", "/booking", "/payment-success", "/onboarding"];
  const shouldHide = hiddenOnPaths.some((path) => location.pathname.startsWith(path));

  useEffect(() => {
    const fetchUnread = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setUnreadCount(0);
        void clearAppBadgeCount();
        return;
      }

      const { count } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("receiver_id", user.id)
        .is("read_at", null);

      const nextUnreadCount = count || 0;
      setUnreadCount(nextUnreadCount);
      void setAppBadgeCount(nextUnreadCount);
    };

    fetchUnread();
    const interval = setInterval(fetchUnread, 30000);
    return () => clearInterval(interval);
  }, []);

  if (shouldHide) {
    return null;
  }

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-[100] backdrop-blur h-16 px-2 pb-[max(0px,env(safe-area-inset-bottom))] flex items-center justify-around pointer-events-auto"
      style={{ background: "rgba(255,255,255,0.97)", borderTop: "1px solid rgba(0,0,0,0.06)" }}
    >
      {navItems.map((item) => {
        const Icon = item.icon;
        const isList = item.label === "List";

        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={() => window.scrollTo({ top: 0, left: 0, behavior: "auto" })}
            className={({ isActive }) =>
              `flex min-w-[64px] flex-col items-center justify-center px-2 py-1 text-sm transition-all ${
                isActive ? "text-foreground font-bold" : "text-muted-foreground"
              }`
            }
          >
            {({ isActive }) => (
              <>
                {isList ? (
                  <div className="-mt-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-foreground shadow-lg">
                    <Icon size={20} className="text-background" />
                  </div>
                ) : (
                  item.label === "Inbox" ? (
                    <div className="relative">
                      <MessageCircle size={22} />
                      {unreadCount > 0 && (
                        <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold leading-4 text-center">
                          {unreadCount > 99 ? "99+" : unreadCount}
                        </span>
                      )}
                    </div>
                  ) : (
                    <Icon size={20} />
                  )
                )}
                <span className={`mt-1 text-[12px] ${isActive ? "font-bold" : "font-medium"}`}>{item.label}</span>
                {!isList && (
                  <span
                    className={`mt-1 h-[3px] w-[3px] rounded-full bg-foreground transition-opacity ${
                      isActive ? "opacity-100" : "opacity-0"
                    }`}
                  />
                )}
              </>
            )}
          </NavLink>
        );
      })}
    </nav>
  );
}
