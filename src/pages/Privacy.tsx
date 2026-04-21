const Privacy = () => {
  const lastUpdated = "20 April 2026";

  return (
    <div className="app-shell bg-warm-gradient pb-24 page-transition">
      <div className="max-w-2xl mx-auto px-5 pt-8 pb-16">
        <h1 className="text-2xl font-display font-bold text-foreground mb-1">Privacy Policy</h1>
        <p className="text-xs text-muted-foreground mb-8">Last updated: {lastUpdated}</p>

        <div className="space-y-8 text-sm text-foreground leading-relaxed">

          <section>
            <h2 className="text-base font-semibold mb-3">1. Introduction</h2>
            <p>Snatch'n is operated by Antonia McCristal ("we", "us", "our"). We are committed to protecting your personal information in accordance with the Australian Privacy Act 1988 (Cth) and the Australian Privacy Principles (APPs).</p>
            <p className="mt-3">This Privacy Policy explains what personal information we collect, why we collect it, how we use it, and your rights in relation to it. By using snatchn.com.au, you consent to the practices described in this Policy.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-3">2. What Information We Collect</h2>
            <p><strong>Information you provide directly:</strong></p>
            <ul className="list-disc pl-5 mt-2 space-y-2">
              <li>Name and email address (when you sign up)</li>
              <li>Profile photo and username</li>
              <li>Location or suburb (for distance-based matching)</li>
              <li>Bank account details (collected and stored by Stripe — we never see these)</li>
              <li>Item listings including photos, descriptions, and pricing</li>
              <li>Messages sent through our in-app messaging system</li>
              <li>Reviews and ratings you submit</li>
            </ul>
            <p className="mt-4"><strong>Information collected automatically:</strong></p>
            <ul className="list-disc pl-5 mt-2 space-y-2">
              <li>IP address and device information</li>
              <li>Browser type and operating system</li>
              <li>Pages visited and time spent on the Platform</li>
              <li>Booking history and transaction records</li>
            </ul>
            <p className="mt-4"><strong>Information from third parties:</strong></p>
            <ul className="list-disc pl-5 mt-2 space-y-2">
              <li>If you sign in with Google, we receive your name and email address from Google</li>
              <li>Payment and identity verification data from Stripe</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-3">3. How We Use Your Information</h2>
            <p>We use your personal information to:</p>
            <ul className="list-disc pl-5 mt-3 space-y-2">
              <li>Create and manage your account</li>
              <li>Facilitate bookings and payments between Lenders and Renters</li>
              <li>Send transactional emails (booking confirmations, payment receipts, payout notifications)</li>
              <li>Display your listings and profile to other users</li>
              <li>Calculate distances between users for location-based features</li>
              <li>Resolve disputes and investigate complaints</li>
              <li>Improve our Platform and user experience</li>
              <li>Comply with legal obligations</li>
            </ul>
            <p className="mt-3">We will not use your information for purposes other than those listed above without your consent.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-3">4. Who We Share Your Information With</h2>
            <p>We share your information only where necessary to operate the Platform:</p>
            <ul className="list-disc pl-5 mt-3 space-y-2">
              <li><strong>Stripe</strong> — payment processing and identity verification for lender payouts. Stripe's privacy policy applies to data they collect: stripe.com/privacy</li>
              <li><strong>Supabase</strong> — our database and authentication provider. Your data is stored on Supabase's servers: supabase.com/privacy</li>
              <li><strong>Resend</strong> — our transactional email provider, used to send booking and payment notifications: resend.com/privacy</li>
              <li><strong>Google</strong> — if you use Google sign-in: policies.google.com/privacy</li>
              <li><strong>Vercel</strong> — our hosting provider: vercel.com/legal/privacy-policy</li>
              <li><strong>Other users</strong> — your public profile (name, avatar, listings, ratings) is visible to other Snatch'n users. Your contact details are never shared directly.</li>
              <li><strong>Law enforcement</strong> — where required by Australian law or a valid court order</li>
            </ul>
            <p className="mt-3">We do not sell your personal information to third parties. We do not share your data with advertisers.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-3">5. Data Storage & Security</h2>
            <p>Your data is stored on Supabase servers. Supabase uses industry-standard encryption (AES-256) for data at rest and TLS for data in transit. Payment information is handled entirely by Stripe and is never stored on our servers.</p>
            <p className="mt-3">While we take reasonable steps to protect your information, no method of transmission over the internet is 100% secure. We encourage you to use a strong password and keep your login credentials private.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-3">6. Data Retention</h2>
            <p>We retain your personal information for as long as your account is active or as needed to provide our services. If you delete your account, we will delete or anonymise your personal data within 30 days, except where we are required to retain it for legal or regulatory purposes (such as financial records, which we retain for 7 years as required by Australian tax law).</p>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-3">7. Your Rights</h2>
            <p>Under the Australian Privacy Act, you have the right to:</p>
            <ul className="list-disc pl-5 mt-3 space-y-2">
              <li><strong>Access</strong> the personal information we hold about you</li>
              <li><strong>Correct</strong> inaccurate or outdated information</li>
              <li><strong>Request deletion</strong> of your personal data (subject to legal retention requirements)</li>
              <li><strong>Complain</strong> about how we handle your personal information</li>
            </ul>
            <p className="mt-3">To exercise any of these rights, email us at hello@snatchn.com.au. We will respond within 30 days.</p>
            <p className="mt-3">If you are unsatisfied with our response, you may lodge a complaint with the Office of the Australian Information Commissioner (OAIC) at oaic.gov.au.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-3">8. Cookies</h2>
            <p>Snatch'n uses session cookies and local storage to keep you logged in and remember your preferences. We do not use advertising or tracking cookies. You can disable cookies in your browser settings, but this may affect the functionality of the Platform.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-3">9. Children's Privacy</h2>
            <p>Snatch'n is not intended for use by anyone under 18 years of age. We do not knowingly collect personal information from minors. If we become aware that a minor has created an account, we will promptly delete their data.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-3">10. Changes to This Policy</h2>
            <p>We may update this Privacy Policy from time to time. We will notify you of significant changes via email or an in-app notice. The "Last updated" date at the top of this page will always reflect the most recent version.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-3">11. Contact Us</h2>
            <p>For privacy-related questions or requests:</p>
            <p className="mt-2"><strong>Antonia McCristal</strong><br />Email: hello@snatchn.com.au<br />Website: snatchn.com.au</p>
          </section>

        </div>
      </div>
    </div>
  );
};

export default Privacy;
