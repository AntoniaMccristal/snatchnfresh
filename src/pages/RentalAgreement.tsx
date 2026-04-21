const RentalAgreement = () => {
  const lastUpdated = "20 April 2026";

  return (
    <div className="app-shell bg-warm-gradient pb-24 page-transition">
      <div className="max-w-2xl mx-auto px-5 pt-8 pb-16">
        <h1 className="text-2xl font-display font-bold text-foreground mb-1">Rental Agreement</h1>
        <p className="text-xs text-muted-foreground mb-2">Last updated: {lastUpdated}</p>
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 mb-8">
          <p className="text-xs text-foreground leading-relaxed">
            This Rental Agreement ("Agreement") is entered into between the Lender and the Renter at the time a booking is confirmed and payment is completed on the Snatch'n platform. By completing a booking, both parties agree to the terms of this Agreement. Snatch'n (operated by Antonia McCristal) facilitates the transaction but is not a party to this Agreement.
          </p>
        </div>

        <div className="space-y-8 text-sm text-foreground leading-relaxed">

          <section>
            <h2 className="text-base font-semibold mb-3">1. The Rental</h2>
            <p>The Lender agrees to rent the item(s) described in the listing ("Item") to the Renter for the rental period confirmed at the time of booking ("Rental Period"), in exchange for the rental fee paid at checkout.</p>
            <p className="mt-3">The Rental Period begins on the agreed pickup date and ends on the agreed return date, as specified in the booking confirmation.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-3">2. Item Condition</h2>
            <p>The Lender warrants that:</p>
            <ul className="list-disc pl-5 mt-3 space-y-2">
              <li>The Item is accurately described in the listing, including photos, condition, brand, and size.</li>
              <li>The Item is clean, laundered, and in the condition described at the time of handover.</li>
              <li>The Item is free from significant defects not disclosed in the listing.</li>
              <li>The Lender owns the Item and has the right to rent it.</li>
            </ul>
            <p className="mt-3">At the time of handover, both parties should inspect the Item and agree on its condition. Any pre-existing damage should be documented via the in-app messaging system before the Rental Period begins.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-3">3. Renter's Obligations</h2>
            <p>The Renter agrees to:</p>
            <ul className="list-disc pl-5 mt-3 space-y-2">
              <li>Treat the Item with reasonable care throughout the Rental Period.</li>
              <li>Not wear the Item in a manner inconsistent with its intended purpose.</li>
              <li>Not alter, modify, or repair the Item without the Lender's written consent.</li>
              <li>Not sublet, loan, or transfer the Item to any third party.</li>
              <li>Return the Item on or before the agreed return date, in the same condition it was received (allowing for normal wear and tear).</li>
              <li>Contact the Lender immediately via in-app chat if the Item is damaged, lost, or stolen during the Rental Period.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-3">4. Return of the Item</h2>
            <p>The Item must be returned to the Lender by the end of the Rental Period. Late returns are subject to the following:</p>
            <ul className="list-disc pl-5 mt-3 space-y-2">
              <li>The Renter must notify the Lender as soon as possible if they anticipate a late return.</li>
              <li>The Lender and Renter may agree to extend the Rental Period at the Lender's daily rate, payable outside the platform or via a new booking.</li>
              <li>If the Item is not returned within 7 days of the agreed return date without explanation, the Lender may report the matter to Snatch'n and, if necessary, to the relevant authorities.</li>
            </ul>
            <p className="mt-3">The Lender is responsible for marking the Item as returned in the Snatch'n app promptly upon receipt. Failure to do so may delay payout release.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-3">5. Damage, Loss & Theft</h2>
            <p>The Renter is financially responsible for any damage to the Item beyond normal wear and tear, and for loss or theft of the Item during the Rental Period.</p>
            <p className="mt-3"><strong>Normal wear and tear</strong> includes minor creasing, light scuffs, or temporary marks that can be removed by dry cleaning or laundering.</p>
            <p className="mt-3"><strong>Damage beyond normal wear and tear</strong> includes but is not limited to: tears, stains that cannot be removed, broken zippers or buttons, structural damage, burns, or alterations.</p>
            <p className="mt-3">In the event of damage:</p>
            <ul className="list-disc pl-5 mt-3 space-y-2">
              <li>The Renter and Lender should first attempt to agree on reasonable compensation via in-app messaging.</li>
              <li>If the Renter purchased the optional damage protection add-on ($5), they may be eligible for coverage up to $500 — contact hello@snatchn.com.au to lodge a claim within 48 hours of the return date.</li>
              <li>If the parties cannot agree, Snatch'n may be contacted to assist with mediation, though Snatch'n is under no obligation to provide this service.</li>
              <li>For items valued above $500, the Lender may pursue civil remedies through the NSW Civil and Administrative Tribunal (NCAT) or equivalent.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-3">6. Cancellation</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li><strong>Renter cancellation more than 48 hours before pickup:</strong> Full refund.</li>
              <li><strong>Renter cancellation within 48 hours of pickup:</strong> No refund. The Lender retains 90% of the rental fee and Snatch'n retains the platform fee.</li>
              <li><strong>Lender cancellation:</strong> Full refund to the Renter. The Lender's account may be flagged for repeated cancellations.</li>
              <li><strong>Item not as described:</strong> If reported within 24 hours of pickup, Snatch'n may issue a full or partial refund at our discretion.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-3">7. Dispute Resolution</h2>
            <p>In the event of a dispute between a Lender and Renter, the parties agree to:</p>
            <ul className="list-disc pl-5 mt-3 space-y-2">
              <li>First attempt to resolve the matter directly via in-app messaging in good faith.</li>
              <li>If unresolved within 7 days, contact Snatch'n at hello@snatchn.com.au to request mediation assistance.</li>
              <li>If still unresolved, either party may pursue resolution through NSW Fair Trading or NCAT.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-3">8. Governing Law</h2>
            <p>This Agreement is governed by the laws of New South Wales, Australia. Both parties submit to the non-exclusive jurisdiction of the courts of New South Wales.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-3">9. Entire Agreement</h2>
            <p>This Agreement, together with Snatch'n's Terms & Conditions and Privacy Policy, constitutes the entire agreement between the Lender and Renter in relation to each rental transaction. It supersedes all prior discussions, representations, and agreements.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-3">10. Contact</h2>
            <p>For questions about this Agreement, contact Snatch'n at hello@snatchn.com.au.</p>
          </section>

        </div>
      </div>
    </div>
  );
};

export default RentalAgreement;
