type ReturnStatus = "available" | "needs_cleaning" | "needs_repair";

type ReturnModalProps = {
  bookingId: string;
  onClose: () => void;
  onSubmit: (bookingId: string, itemStatus: ReturnStatus) => void;
};

export default function ReturnModal({ bookingId, onClose, onSubmit }: ReturnModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center">
      <div className="bg-card rounded-t-3xl p-6 w-full max-w-lg space-y-4">
        <h2 className="text-lg font-bold text-foreground">Item returned!</h2>
        <p className="text-sm text-muted-foreground">
          Is this item ready to be listed again straight away?
        </p>
        <div className="space-y-2">
          <button
            onClick={() => onSubmit(bookingId, "available")}
            className="w-full h-12 rounded-2xl bg-primary text-primary-foreground font-bold text-sm text-left px-4 flex items-center gap-3"
          >
            <span className="text-xl">OK</span>
            <div>
              <p className="font-bold">Ready to list again</p>
              <p className="text-xs opacity-75">Item is clean and in great condition</p>
            </div>
          </button>
          <button
            onClick={() => onSubmit(bookingId, "needs_cleaning")}
            className="w-full h-12 rounded-2xl border border-border text-foreground font-semibold text-sm text-left px-4 flex items-center gap-3"
          >
            <span className="text-xl">Wash</span>
            <div>
              <p className="font-bold">Needs a clean first</p>
              <p className="text-xs text-muted-foreground">Mark as unavailable until you relist it</p>
            </div>
          </button>
          <button
            onClick={() => onSubmit(bookingId, "needs_repair")}
            className="w-full h-12 rounded-2xl border border-border text-foreground font-semibold text-sm text-left px-4 flex items-center gap-3"
          >
            <span className="text-xl">Fix</span>
            <div>
              <p className="font-bold">Needs repairs</p>
              <p className="text-xs text-muted-foreground">Mark as unavailable until fixed</p>
            </div>
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
