import { categories } from "@/data/mockData";

interface CategoryFilterProps {
  selected: string;
  onSelect: (cat: string) => void;
  categories?: string[];
}

const CategoryFilter = ({ selected, onSelect, categories: categoryOptions }: CategoryFilterProps) => {
  const options = categoryOptions && categoryOptions.length > 0 ? categoryOptions : categories;

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 px-5 scrollbar-none">
      {options.map((cat) => (
        <button
          key={cat}
          onClick={() => onSelect(cat)}
          className={`flex-shrink-0 px-4 py-1.5 rounded-full text-[13px] font-medium transition-all duration-300 ${
            selected === cat
              ? "bg-foreground text-background shadow-soft"
              : "bg-card text-muted-foreground border border-border/60 hover:border-foreground/20 hover:text-foreground"
          }`}
        >
          {cat}
        </button>
      ))}
    </div>
  );
};

export default CategoryFilter;
