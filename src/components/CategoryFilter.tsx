import { categories } from "@/data/mockData";

interface CategoryFilterProps {
  selected: string;
  onSelect: (cat: string) => void;
  categories?: string[];
}

const CategoryFilter = ({ selected, onSelect, categories: categoryOptions }: CategoryFilterProps) => {
  const options = categoryOptions && categoryOptions.length > 0 ? categoryOptions : categories;

  return (
    <div className="flex gap-1 overflow-x-auto px-0 scrollbar-none">
      {options.map((cat) => {
        const active = selected === cat;
        return (
          <button
            key={cat}
            onClick={() => onSelect(cat)}
            className={`flex-shrink-0 rounded-none px-3 py-2 text-[13px] transition-all duration-300 border-b-2 ${
              active
                ? "bg-transparent text-foreground border-foreground font-bold"
                : "bg-transparent text-muted-foreground border-transparent hover:text-foreground hover:border-foreground/30"
            }`}
          >
            {cat}
          </button>
        );
      })}
    </div>
  );
};

export default CategoryFilter;
