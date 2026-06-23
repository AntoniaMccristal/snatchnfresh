import { categories } from "@/data/mockData";

interface CategoryFilterProps {
  selected: string;
  onSelect: (cat: string) => void;
  categories?: string[];
}

const CategoryFilter = ({ selected, onSelect, categories: categoryOptions }: CategoryFilterProps) => {
  const options = categoryOptions && categoryOptions.length > 0 ? categoryOptions : categories;

  return (
    <div className="flex gap-2 overflow-x-auto px-0 scrollbar-none">
      {options.map((cat) => {
        const active = selected === cat;
        return (
          <button
            key={cat}
            onClick={() => onSelect(cat)}
            className={`flex-shrink-0 rounded-full px-4 py-2 text-[13px] transition-all duration-300 ${
              active
                ? "font-bold"
                : "font-semibold"
            }`}
            style={{
              background: active ? "#1a0a2e" : "#f0ebff",
              color: active ? "#ffffff" : "#3d1f6e",
            }}
          >
            {cat}
          </button>
        );
      })}
    </div>
  );
};

export default CategoryFilter;
