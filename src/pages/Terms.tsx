const Terms = () => {
  const lastUpdated = "20 April 2026";

  return (
    <div className="app-shell bg-warm-gradient pb-24 page-transition">
      <div className="max-w-2xl mx-auto px-5 pt-8 pb-16">
        <h1 className="text-2xl font-display font-bold text-foreground mb-1">Terms & Conditions</h1>
        <p className="text-xs text-muted-foreground mb-8">Last updated: {lastUpdated}</p>

        <div className="space-y-8 text-sm text-foreground leading-relaxed">

          <section>
            <h2 className="text-base font-semibold mb-3">1. About Snatch'n</h2>
            <p>Snatch'n ("we", "us", "our") is a peer-to-peer fashion rental platform operated by Antonia McCristal, an individual based in Australia. Snatch'n connects people who want to lend clothing and accessories ("Lenders") with people who want to rent them ("Renters") through our website at snatchn.com.au ("Platform").</p>
            <p className="mt-3">By creating an account or using our Platform, you agree to these Terms & Conditions. If you do not agree, please do not use the Platform.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-3">2. Eligibility</h2>
            <p>You must be at least 18 years old to use Snatch'n. By using the Platform you confirm that you are 18 or older and that you have the legal capacity to enter into a binding agreement. We reserve the right to suspend or terminate accounts where we have reason to believe a user is under 18.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-3">3. How Snatch'n Works</h2>
            <p>Snatch'n is a marketplace — we facilitate transactions between Lenders and Renters but we are not a party to any rental agreement between them. When you list an item, request a booking, or make a payment, you are transacting directly with another user.</p>
            <ul className="list-disc pl-5 mt-3 space-y-2">
              <li>Lenders list items, set prices, and approve or decline booking requests.</li>
              <li>Renters browse listings, select dates, and submit booking requests.</li>
              <li>Once a Lender approves a request, the Renter completes payment via Stripe.</li>
              <li>Snatch'n collects a 10% platform fee from each transaction to cover operating costs.</li>
              <li>Lenders receive 90% of the rental fee, paid out to their connected bank account within 2–3 business days after the rental is completed and the item is returned.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-3">4. Lender Responsibilities</h2>
            <p>As a Lender you agree to:</p>
            <ul className="list-disc pl-5 mt-3 space-y-2">
              <li>Only list items you own and have the right to rent out.</li>
              <li>Accurately describe items including brand, size, condition, and any defects.</li>
              <li>Provide accurate and up-to-date photos of your items.</li>
              <li>Not list counterfeit, replica, or stolen goods.</li>
              <li>Make items available on the agreed dates and in the described condition.</li>
              <li>Clean and launder items before and after each rental.</li>
              <li>Respond to booking requests promptly.</li>
              <li>Connect a valid Australian bank account via Stripe to receive payouts.</li>
              <li>Mark items as returned promptly once received back from the Renter.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-3">5. Renter Responsibilities</h2>
            <p>As a Renter you agree to:</p>
            <ul className="list-disc pl-5 mt-3 space-y-2">
              <li>Treat rented items with care and return them in the same condition they were received.</li>
              <li>Return items on or before the agreed return date.</li>
              <li>Not alter, repair, dry clean, or wash items without the Lender's consent unless otherwise agreed.</li>
              <li>Not sublet or loan items to third parties.</li>
              <li>Report any damage immediately to the Lender via in-app chat.</li>
              <li>Pay for any damage beyond normal wear and tear.</li>
              <li>Coordinate pickup and return logistics with the Lender in good faith.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-3">6. Payments & Fees</h2>
            <p>All payments are processed by Stripe. By making a payment you agree to Stripe's terms of service. Snatch'n does not store your card details — these are held securely by Stripe.</p>
            <ul className="list-disc pl-5 mt-3 space-y-2">
              <li><strong>Platform fee:</strong> 10% of the rental subtotal, deducted from the Lender's payout.</li>
              <li><strong>Damage protection:</strong> An optional $5 add-on per booking that provides coverage for accidental damage up to $500.</li>
              <li><strong>Shipping:</strong> Where applicable, shipping costs are set by the Lender and paid by the Renter at checkout.</li>
              <li><strong>Currency:</strong> All prices are in Australian Dollars (AUD) unless otherwise stated.</li>
            </ul>
            <p className="mt-3">Payments are held by Snatch'n until the rental period ends and the item is marked as returned. Payouts are then released to the Lender's connected Stripe account.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-3">7. Cancellations & Refunds</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li><strong>Renter cancellations:</strong> If a Renter cancels more than 48 hours before the pickup date, they will receive a full refund. Cancellations within 48 hours of pickup are non-refundable.</li>
              <li><strong>Lender cancellations:</strong> If a Lender cancels a confirmed booking, the Renter will receive a full refund and the Lender's account may be flagged.</li>
              <li><strong>Item not as described:</strong> If an item is materially different from its listing, the Renter must notify Snatch'n within 24 hours of pickup. We will investigate and may issue a refund at our discretion.</li>
              <li><strong>Stripe fees:</strong> In certain refund scenarios, Stripe's processing fees (approximately 1.7% + 30¢) may not be recoverable and will be deducted from any refund.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-3">8. Damage & Insurance</h2>
            <p>Renters are responsible for any damage beyond normal wear and tear. If damage occurs:</p>
            <ul className="list-disc pl-5 mt-3 space-y-2">
              <li>The Renter and Lender should first attempt to resolve the matter through in-app messaging.</li>
              <li>If the Renter purchased damage protection ($5 add-on), claims up to $500 may be covered — contact us at hello@snatchn.com.au to lodge a claim.</li>
              <li>Snatch'n is not liable for damage to items and does not act as an insurer. The damage protection add-on is a facilitated service, not a formal insurance product.</li>
              <li>For unresolved disputes, Snatch'n may mediate at our discretion but is under no obligation to do so.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-3">9. Prohibited Items</h2>
            <p>You must not list or rent the following:</p>
            <ul className="list-disc pl-5 mt-3 space-y-2">
              <li>Counterfeit, replica, or knock-off goods</li>
              <li>Stolen items</li>
              <li>Items that infringe third-party intellectual property rights</li>
              <li>Hazardous or unsafe items</li>
              <li>Intimate apparel (underwear, swimwear) where hygiene cannot be guaranteed</li>
              <li>Any items prohibited under Australian law</li>
            </ul>
            <p className="mt-3">We reserve the right to remove any listing that violates these prohibitions without notice.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-3">10. Intellectual Property</h2>
            <p>All content on the Snatch'n Platform — including our logo, design, and code — is owned by Antonia McCristal and protected by Australian copyright law. You may not reproduce, distribute, or create derivative works without our written permission.</p>
            <p className="mt-3">By uploading photos or content to the Platform, you grant Snatch'n a non-exclusive, royalty-free licence to use that content for the purposes of operating and promoting the Platform.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-3">11. Limitation of Liability</h2>
            <p>To the maximum extent permitted by Australian law, Snatch'n is not liable for:</p>
            <ul className="list-disc pl-5 mt-3 space-y-2">
              <li>Any loss or damage to items during a rental</li>
              <li>Any disputes between Lenders and Renters</li>
              <li>Any indirect, incidental, or consequential loss</li>
              <li>Any loss arising from Platform downtime or technical issues</li>
            </ul>
            <p className="mt-3">Nothing in these Terms excludes or limits rights you may have under the Australian Consumer Law.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-3">12. Account Suspension & Termination</h2>
            <p>We reserve the right to suspend or permanently terminate any account that:</p>
            <ul className="list-disc pl-5 mt-3 space-y-2">
              <li>Violates these Terms & Conditions</li>
              <li>Engages in fraudulent activity</li>
              <li>Receives repeated complaints from other users</li>
              <li>Lists prohibited items</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-3">13. Governing Law</h2>
            <p>These Terms are governed by the laws of New South Wales, Australia. Any disputes will be subject to the exclusive jurisdiction of the courts of New South Wales.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-3">14. Changes to These Terms</h2>
            <p>We may update these Terms from time to time. We will notify you of significant changes via email or an in-app notice. Continued use of the Platform after changes are posted constitutes acceptance of the updated Terms.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-3">15. Contact Us</h2>
            <p>For any questions about these Terms, please contact us at:</p>
            <p className="mt-2"><strong>Antonia McCristal</strong><br />Email: hello@snatchn.com.au<br />Website: snatchn.com.au</p>
          </section>

        </div>
      </div>
    </div>
  );
};

export default Terms;
