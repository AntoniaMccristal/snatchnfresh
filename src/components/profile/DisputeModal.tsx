type DisputeModalProps = {
  bookingId: string;
  description: string;
  submitting: boolean;
  onDescriptionChange: (value: string) => void;
  onClose: () => void;
  onMessageRenter: () => void;
  onSubmit: (bookingId: string, description: string) => void;
};

export default function DisputeModal({
  bookingId,
  description,
  submitting,
  onDescriptionChange,
  onClose,
  onMessageRenter,
  onSubmit,
}: DisputeModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center">
      <div className="bg-card rounded-t-3xl p-6 w-full max-w-lg space-y-4">
        <h2 className="text-lg font-bold text-foreground">Raise a dispute</h2>
        <p className="text-sm text-muted-foreground">
          Describe the damage to the item. We will review your case and be in touch within 24 hours.
        </p>
        <textarea
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder="Describe what happened - e.g. stain on front, broken zip, torn hem..."
          className="w-full h-32 rounded-2xl border border-border p-3 text-sm bg-background resize-none"
        />
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs text-amber-800">
            Before raising a formal dispute, have you messaged the renter about the damage?
            We recommend attempting to resolve directly first.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onMessageRenter}
            className="flex-1 h-11 rounded-xl border border-border text-sm font-semibold"
          >
            Message renter first
          </button>
          <button
            onClick={() => onSubmit(bookingId, description)}
            disabled={submitting || description.trim().length < 10}
            className="flex-1 h-11 rounded-xl bg-red-600 text-white text-sm font-bold disabled:opacity-50"
          >
            {submitting ? "Submitting..." : "Raise dispute"}
          </button>
        </div>
        <button
          onClick={onClose}
          className="w-full text-xs text-muted-foreground py-2"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
