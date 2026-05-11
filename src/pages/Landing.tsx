import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";

const ITEM_1_IMG = "https://kkyapornrqdhksrmcaij.supabase.co/storage/v1/object/public/items/6183ffc5-150f-44c6-9823-3af7402a2497/1778019188081-s19-25043707-lizard-25898-christopheresber-0330_2000x.jpg";
const ITEM_2_IMG = "https://kkyapornrqdhksrmcaij.supabase.co/storage/v1/object/public/items/6183ffc5-150f-44c6-9823-3af7402a2497/1777968895818-img_7416.jpg";

const HOW_STEPS = [
  { num: "01", title: "Browse nearby closets", desc: "Discover fashion from people in your neighbourhood. Filter by size, style, and price." },
  { num: "02", title: "Request & pay securely", desc: "Send a booking request. Payment is held safely until the item is returned." },
  { num: "03", title: "Wear it. Return it.", desc: "Arrange pickup or delivery with your lender. Return it after your event — done." },
];

const FOR_BUSINESS = [
  { icon: "", title: "List your inventory", desc: "Upload your pieces in minutes. No tech skills needed." },
  { icon: "", title: "Keep 90% of every rental", desc: "We take 10%. You keep the rest, paid directly to your bank." },
  { icon: "", title: "Payments held until return", desc: "Money is held securely until the item is confirmed back safe." },
  { icon: "", title: "Manage everything in-app", desc: "Approve bookings, message renters, track returns — all in one place." },
];

const TESTIMONIALS = [
  { name: "Camilla M.", handle: "@camilla", text: "I rented the most beautiful dress for my friend's wedding for $30. Fit perfectly. Will 100% use again.", avatar: "CM" },
  { name: "Theo S.", handle: "@theostrang", text: "Listed 8 pieces from my wardrobe and made $180 in my first month. So easy.", avatar: "TS" },
  { name: "Helena B.", handle: "@helenab", text: "As a boutique owner this is perfect — my inventory earns money between hire events.", avatar: "HB" },
];

export default function Landing() {
  const navigate = useNavigate();
  const [items, setItems] = useState<any[]>([]);
  const [user, setUser] = useState<any>(null);
  const heroRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data?.user));
    supabase.from("items").select("id,title,price_per_day,image_url").not("image_url", "is", null).order("created_at", { ascending: false }).limit(6)
      .then(({ data }) => setItems(data || []));
  }, []);

  // Parallax on hero
  useEffect(() => {
    const onScroll = () => {
      if (heroRef.current) {
        heroRef.current.style.transform = `translateY(${window.scrollY * 0.3}px)`;
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", background: "hsl(var(--background))", color: "#1a0a2e", overflowX: "hidden" }}>

      {/* ── Nav ── */}
      <nav style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, background: "hsl(var(--background) / 0.92)", backdropFilter: "blur(12px)", borderBottom: "0.5px solid rgba(26,10,46,0.08)", padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 60 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img src="/pwa-192x192.png" alt="Snatch'n" style={{ width: 32, height: 32, borderRadius: 10, objectFit: "cover" }} />
          <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.5px" }}>Snatch'n</span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <a href="#how" style={{ fontSize: 13, fontWeight: 500, color: "#6b5f7a", textDecoration: "none", padding: "6px 12px" }}>How it works</a>
          <a href="#business" style={{ fontSize: 13, fontWeight: 500, color: "#6b5f7a", textDecoration: "none", padding: "6px 12px" }}>For business</a>
          {user ? (
            <button onClick={() => navigate("/")} style={{ height: 36, padding: "0 18px", borderRadius: 99, background: "#1a0a2e", color: "#fff", border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              Open app
            </button>
          ) : (
            <button onClick={() => navigate("/auth")} style={{ height: 36, padding: "0 18px", borderRadius: 99, background: "#1a0a2e", color: "#fff", border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              Sign up free
            </button>
          )}
        </div>
      </nav>

      {/* ── Hero ── */}
      <section style={{ paddingTop: 120, paddingBottom: 80, textAlign: "center", position: "relative", overflow: "hidden" }}>
        {/* Background blobs */}
        <div style={{ position: "absolute", top: -60, right: -80, width: 400, height: 400, borderRadius: "50%", background: "rgba(244,197,208,0.35)", filter: "blur(80px)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: -40, left: -60, width: 300, height: 300, borderRadius: "50%", background: "rgba(180,200,150,0.3)", filter: "blur(60px)", pointerEvents: "none" }} />

        <div ref={heroRef} style={{ position: "relative", zIndex: 1 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#fff", border: "0.5px solid rgba(26,10,46,0.12)", borderRadius: 99, padding: "5px 14px", fontSize: 12, fontWeight: 600, color: "#6b5f7a", marginBottom: 24 }}>
            Sustainable fashion · Sydney, AU
          </div>

          <h1 style={{ fontSize: "clamp(40px,7vw,80px)", fontWeight: 800, letterSpacing: "-2px", lineHeight: 1.05, margin: "0 auto 20px", maxWidth: 800, padding: "0 24px" }}>
            Rent fashion from<br />
            <span style={{ color: "#9d6e8a", fontStyle: "italic" }}>your neighbours.</span>
          </h1>

          <p style={{ fontSize: "clamp(15px,2vw,18px)", color: "#6b5f7a", maxWidth: 480, margin: "0 auto 36px", lineHeight: 1.7, padding: "0 24px" }}>
            Borrow beautiful pieces from real wardrobes near you. List what you own and earn while it hangs in your closet.
          </p>

          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", padding: "0 24px", marginBottom: 60 }}>
            <button
              onClick={() => navigate(user ? "/" : "/auth")}
              style={{ height: 52, padding: "0 28px", borderRadius: 99, background: "#1a0a2e", color: "#fff", border: "none", fontSize: 15, fontWeight: 700, cursor: "pointer", letterSpacing: "-0.2px" }}
            >
              Start browsing →
            </button>
            <button
              onClick={() => navigate(user ? "/list" : "/auth")}
              style={{ height: 52, padding: "0 28px", borderRadius: 99, background: "transparent", color: "#1a0a2e", border: "1.5px solid #1a0a2e", fontSize: 15, fontWeight: 700, cursor: "pointer" }}
            >
              List an item
            </button>
          </div>

          {/* Floating item cards */}
          <div style={{ position: "relative", maxWidth: 800, margin: "0 auto", padding: "0 24px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16 }}>
              {(items.length > 0 ? items : [
                { id: "1", title: "Droplet Crochet Dress", price_per_day: 10, image_url: ITEM_1_IMG },
                { id: "2", title: "Guigamus Khaki Pants", price_per_day: 5, image_url: ITEM_2_IMG },
                { id: "3", title: "Linen Midi Dress", price_per_day: 18, image_url: null },
                { id: "4", title: "Oversized Blazer", price_per_day: 15, image_url: null },
              ]).slice(0, 4).map((item, i) => (
                <div
                  key={item.id}
                  onClick={() => navigate(user ? `/item/${item.id}` : "/auth")}
                  style={{
                    background: "#fff",
                    borderRadius: 20,
                    overflow: "hidden",
                    border: "0.5px solid rgba(26,10,46,0.08)",
                    cursor: "pointer",
                    transform: i % 2 === 0 ? "translateY(-8px)" : "translateY(8px)",
                    transition: "transform 0.2s",
                    boxShadow: "0 8px 32px rgba(26,10,46,0.08)",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.transform = i % 2 === 0 ? "translateY(-16px)" : "translateY(0px)")}
                  onMouseLeave={e => (e.currentTarget.style.transform = i % 2 === 0 ? "translateY(-8px)" : "translateY(8px)")}
                >
                  <div style={{ aspectRatio: "3/4", background: item.image_url ? "transparent" : `hsl(${i * 60 + 280}, 30%, 88%)`, overflow: "hidden" }}>
                    {item.image_url && <img src={item.image_url} alt={item.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                  </div>
                  <div style={{ padding: "10px 12px 12px" }}>
                    <p style={{ fontSize: 12, fontWeight: 600, margin: "0 0 2px", color: "#1a0a2e", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.title}</p>
                    <p style={{ fontSize: 13, fontWeight: 700, margin: 0, color: "#9d6e8a" }}>${item.price_per_day}/day</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats strip ── */}
      <section style={{ background: "#5c6b47", padding: "32px 24px", display: "flex", gap: 0, justifyContent: "center", flexWrap: "wrap" }}>
        {[
          { num: "90%", label: "goes to the lender" },
          { num: "$0", label: "to list an item" },
          { num: "100%", label: "secure payments" },
          { num: "", label: "sustainable fashion" },
        ].map((s, i) => (
          <div key={i} style={{ flex: "1 1 160px", textAlign: "center", padding: "12px 24px", borderRight: i < 3 ? "0.5px solid rgba(255,255,255,0.1)" : "none" }}>
            <p style={{ fontSize: 28, fontWeight: 800, color: "#f4c5d0", margin: "0 0 4px", letterSpacing: "-1px" }}>{s.num}</p>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", margin: 0, fontWeight: 500 }}>{s.label}</p>
          </div>
        ))}
      </section>

      {/* ── How it works ── */}
      <section id="how" style={{ padding: "80px 24px", maxWidth: 1000, margin: "0 auto" }}>
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#9d6e8a", marginBottom: 12 }}>How it works</p>
        <h2 style={{ fontSize: "clamp(28px,4vw,44px)", fontWeight: 800, letterSpacing: "-1.5px", margin: "0 0 56px", lineHeight: 1.1 }}>
          Simple as borrowing<br />from a friend.
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 24 }}>
          {HOW_STEPS.map((step, index) => (
            <div key={step.num} style={{ background: "#fff", borderRadius: 24, padding: "28px 24px", border: "0.5px solid rgba(26,10,46,0.08)" }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: index % 2 === 1 ? "#d4e0c4" : "#f4c5d0", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: "#1a0a2e" }}>{step.num}</span>
              </div>
              <p style={{ fontSize: 16, fontWeight: 700, margin: "0 0 8px", letterSpacing: "-0.3px" }}>{step.title}</p>
              <p style={{ fontSize: 14, color: "#6b5f7a", margin: 0, lineHeight: 1.6 }}>{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Featured listings ── */}
      {items.length > 0 && (
        <section style={{ padding: "0 24px 80px", maxWidth: 1000, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#9d6e8a", marginBottom: 8 }}>Live on Snatch'n</p>
              <h2 style={{ fontSize: "clamp(24px,3vw,36px)", fontWeight: 800, letterSpacing: "-1px", margin: 0 }}>Browse real wardrobes</h2>
            </div>
            <button onClick={() => navigate(user ? "/" : "/auth")} style={{ height: 40, padding: "0 20px", borderRadius: 99, border: "1.5px solid #1a0a2e", background: "transparent", fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
              See all →
            </button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 16 }}>
            {items.map((item) => (
              <div key={item.id} onClick={() => navigate(user ? `/item/${item.id}` : "/auth")} style={{ background: "#fff", borderRadius: 18, overflow: "hidden", cursor: "pointer", border: "0.5px solid rgba(26,10,46,0.07)", transition: "transform 0.2s" }}
                onMouseEnter={e => (e.currentTarget.style.transform = "translateY(-4px)")}
                onMouseLeave={e => (e.currentTarget.style.transform = "translateY(0)")}
              >
                <div style={{ aspectRatio: "3/4", background: "#f0ebf4", overflow: "hidden" }}>
                  {item.image_url && <img src={item.image_url} alt={item.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} loading="lazy" />}
                </div>
                <div style={{ padding: "10px 12px 14px" }}>
                  <p style={{ fontSize: 12, fontWeight: 600, margin: "0 0 3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</p>
                  <p style={{ fontSize: 14, fontWeight: 800, margin: 0, color: "#9d6e8a" }}>${item.price_per_day}<span style={{ fontSize: 11, fontWeight: 500, color: "#9b8ea8" }}>/day</span></p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Testimonials ── */}
      <section style={{ background: "hsl(var(--sage-light, 120 15% 90%))", padding: "80px 24px" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto" }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#9d6e8a", marginBottom: 12 }}>Early users</p>
          <h2 style={{ fontSize: "clamp(24px,3vw,36px)", fontWeight: 800, letterSpacing: "-1px", margin: "0 0 40px" }}>People love it</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
            {TESTIMONIALS.map((t) => (
              <div key={t.name} style={{ background: "#fff", borderRadius: 20, padding: "24px", border: "0.5px solid rgba(26,10,46,0.07)" }}>
                <p style={{ fontSize: 14, color: "#3d2c50", lineHeight: 1.7, margin: "0 0 20px", fontStyle: "italic" }}>"{t.text}"</p>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#1a0a2e", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#f4c5d0" }}>{t.avatar}</div>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 700, margin: 0 }}>{t.name}</p>
                    <p style={{ fontSize: 11, color: "#9b8ea8", margin: 0 }}>{t.handle}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── For business ── */}
      <section id="business" style={{ padding: "80px 24px", maxWidth: 1000, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 60, alignItems: "center" }}>
          <div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#d4e0c4", borderRadius: 99, padding: "4px 12px", fontSize: 11, fontWeight: 700, color: "#1a0a2e", marginBottom: 16 }}>
              For rental businesses
            </div>
            <h2 style={{ fontSize: "clamp(26px,3.5vw,40px)", fontWeight: 800, letterSpacing: "-1.5px", lineHeight: 1.1, margin: "0 0 16px" }}>
              Already renting?<br />
              <span style={{ color: "#9d6e8a" }}>List on Snatch'n.</span>
            </h2>
            <p style={{ fontSize: 15, color: "#6b5f7a", lineHeight: 1.7, margin: "0 0 28px" }}>
              Whether you run a boutique hire service, own a wardrobe of occasion wear, or manage a fashion archive — Snatch'n gets your inventory in front of thousands of people looking to rent locally.
            </p>
            <button
              onClick={() => navigate(user ? "/list" : "/auth")}
              style={{ height: 48, padding: "0 24px", borderRadius: 99, background: "#1a0a2e", color: "#fff", border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
            >
              List your inventory →
            </button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {FOR_BUSINESS.map((f) => (
              <div key={f.title} style={{ background: "#fff", borderRadius: 18, padding: "20px 18px", border: "0.5px solid rgba(26,10,46,0.08)" }}>
                <div style={{ fontSize: 24, marginBottom: 12 }}>{f.icon}</div>
                <p style={{ fontSize: 13, fontWeight: 700, margin: "0 0 6px" }}>{f.title}</p>
                <p style={{ fontSize: 12, color: "#6b5f7a", margin: 0, lineHeight: 1.6 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Sustainability ── */}
      <section style={{ background: "#5c6b47", padding: "72px 24px", textAlign: "center" }}>
        <div style={{ maxWidth: 600, margin: "0 auto" }}>
          <h2 style={{ fontSize: "clamp(26px,4vw,42px)", fontWeight: 800, color: "#fff", letterSpacing: "-1.5px", margin: "0 0 16px", lineHeight: 1.15 }}>
            Every rental keeps a garment out of landfill.
          </h2>
          <p style={{ fontSize: 15, color: "rgba(255,255,255,0.55)", margin: "0 0 36px", lineHeight: 1.7 }}>
            The fashion industry produces 92 million tonnes of waste a year. Snatch'n is our small part in changing that — one wardrobe at a time.
          </p>
          <button
            onClick={() => navigate(user ? "/" : "/auth")}
            style={{ height: 52, padding: "0 32px", borderRadius: 99, background: "#f4c5d0", color: "#1a0a2e", border: "none", fontSize: 15, fontWeight: 800, cursor: "pointer", letterSpacing: "-0.2px" }}
          >
            Join Snatch'n today
          </button>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={{ background: "hsl(var(--background))", borderTop: "0.5px solid rgba(26,10,46,0.08)", padding: "32px 24px" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <img src="/pwa-192x192.png" alt="Snatch'n" style={{ width: 28, height: 28, borderRadius: 8, objectFit: "cover" }} />
            <span style={{ fontSize: 14, fontWeight: 700 }}>Snatch'n</span>
            <span style={{ fontSize: 12, color: "#9b8ea8" }}>· Sydney, AU</span>
          </div>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            {[
              { label: "Terms", path: "/terms" },
              { label: "Privacy", path: "/privacy" },
              { label: "Rental Agreement", path: "/rental-agreement" },
            ].map((link) => (
              <a key={link.label} onClick={() => navigate(link.path)} style={{ fontSize: 12, color: "#9b8ea8", textDecoration: "none", cursor: "pointer", fontWeight: 500 }}>{link.label}</a>
            ))}
            <a href="mailto:hello@snatchn.com.au" style={{ fontSize: 12, color: "#9b8ea8", textDecoration: "none", fontWeight: 500 }}>hello@snatchn.com.au</a>
          </div>
        </div>
      </footer>

    </div>
  );
}
