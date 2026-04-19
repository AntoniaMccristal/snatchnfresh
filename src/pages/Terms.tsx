export default function Terms() {
  return (
    <div className="app-shell bg-warm-gradient pb-24 px-5 pt-8">
      <div className="mx-auto max-w-4xl rounded-2xl border border-border/50 bg-card/90 p-6 md:p-8">
        <h1 className="text-2xl font-bold mb-4">Terms & Conditions</h1>
        <p className="text-sm md:text-base text-muted-foreground leading-7">
          By using Snatch'n, users agree to provide accurate listing details, honor booking dates,
          and follow platform policies for cancellations, returns, and disputes. Payments are handled
          securely via Stripe. Misuse, fraud, or policy breaches may lead to account suspension.
        </p>
      </div>
    </div>
  );
}
