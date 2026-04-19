export default function Contact() {
  return (
    <div className="app-shell bg-warm-gradient pb-24 px-5 pt-8">
      <div className="mx-auto max-w-4xl rounded-2xl border border-border/50 bg-card/90 p-6 md:p-8">
        <h1 className="text-2xl font-bold mb-4">Contact</h1>
        <p className="text-sm md:text-base text-muted-foreground leading-7">
          Email: support@snatchn.com
          <br />
          Location: Sydney, AU
          <br />
          For booking or payment support, include your booking ID and account email.
        </p>
      </div>
    </div>
  );
}
