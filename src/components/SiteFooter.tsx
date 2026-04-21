import { Link, useLocation } from "react-router-dom";

const hiddenPrefixes = ["/auth", "/booking", "/payment-success", "/onboarding", "/list", "/item"];

export default function SiteFooter() {
  const location = useLocation();
  const shouldHide = hiddenPrefixes.some((prefix) => location.pathname.startsWith(prefix));

  if (shouldHide) return null;

  return (
    <footer className="hidden md:block border-t border-border/50 bg-card/80 backdrop-blur">
      <div className="mx-auto w-full max-w-7xl px-6 py-10 grid grid-cols-1 lg:grid-cols-4 gap-8">
        <div>
          <h3 className="text-base font-semibold text-foreground mb-3">Snatch'n</h3>
          <p className="text-sm text-muted-foreground max-w-xs">
            Rent and lend fashion pieces locally with secure bookings and payments.
          </p>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-foreground mb-3">Company</h4>
          <div className="space-y-2 text-sm">
            <Link to="/about" className="block hover:underline">About Us</Link>
            <Link to="/contact" className="block hover:underline">Contact</Link>
          </div>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-foreground mb-3">Support</h4>
          <div className="space-y-2 text-sm">
            <Link to="/help" className="block hover:underline">Help Centre</Link>
            <Link to="/privacy" className="block hover:underline">Privacy Policy</Link>
            <Link to="/terms" className="block hover:underline">Terms & Conditions</Link>
            <Link to="/rental-agreement" className="block hover:underline">Rental Agreement</Link>
          </div>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-foreground mb-3">Location</h4>
          <p className="text-sm text-muted-foreground">Sydney, AU</p>
          <p className="text-xs text-muted-foreground mt-3">© {new Date().getFullYear()} Snatch'n</p>
        </div>
      </div>
    </footer>
  );
}
