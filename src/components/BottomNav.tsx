import { Compass, Home, MessageCircle, PlusSquare, User } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";

const navItems = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/discover", label: "Search", icon: Compass },
  { to: "/list", label: "List", icon: PlusSquare },
  { to: "/messages", label: "Inbox", icon: MessageCircle },
  { to: "/profile", label: "Profile", icon: User },
];

export default function BottomNav() {
  const location = useLocation();

  const hiddenOnPaths = ["/auth", "/booking", "/payment-success", "/onboarding"];
  const shouldHide = hiddenOnPaths.some((path) => location.pathname.startsWith(path));

  if (shouldHide) {
    return null;
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-[100] bg-white/98 backdrop-blur border-t border-border h-16 px-2 pb-[max(0px,env(safe-area-inset-bottom))] flex items-center justify-around pointer-events-auto">
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
                  <Icon size={20} />
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
