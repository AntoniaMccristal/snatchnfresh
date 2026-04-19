import { collections } from "@/data/mockData";

interface CollectionScrollProps {
  onSelect?: (collection: string) => void;
  selected?: string;
}

const CollectionScroll = ({ onSelect, selected }: CollectionScrollProps) => {
  return (
    <div className="flex gap-2.5 overflow-x-auto pb-1 px-5 scrollbar-none">
      {collections.map((col) => (
        <button
          key={col.name}
          onClick={() => onSelect?.(col.name)}
          className={`flex-shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-2xl border transition-all duration-300 text-[13px] font-medium shadow-soft ${
            selected === col.name
              ? "bg-primary-gradient text-primary-foreground border-transparent shadow-glow"
              : "bg-card text-foreground border-border/60 hover:border-primary/30 hover:shadow-card"
          }`}
        >
          <span>{col.name}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
            selected === col.name
              ? "bg-primary-foreground/20 text-primary-foreground"
              : "bg-muted text-muted-foreground"
          }`}>{col.count}</span>
        </button>
      ))}
    </div>
  );
};

export default CollectionScroll;
