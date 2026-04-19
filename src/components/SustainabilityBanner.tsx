import { Leaf, Droplets, Wind, ArrowRight } from "lucide-react";
import { sustainabilityStats } from "@/data/mockData";

const SustainabilityBanner = () => {
  return (
    <div className="mx-5 rounded-3xl bg-gradient-to-br from-sage-light via-sage-light to-blush p-5 border border-sage/20 shadow-soft relative overflow-hidden">
      {/* Decorative circle */}
      <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-sage/10" />
      <div className="absolute -bottom-4 -left-4 w-20 h-20 rounded-full bg-sage/5" />
      
      <div className="relative">
        <p className="text-sm font-semibold text-secondary-foreground mb-1 font-display">
          Our community impact
        </p>
        <p className="text-[11px] text-muted-foreground mb-4">
          Together we're building a more sustainable future
        </p>
        <div className="grid grid-cols-3 gap-3">
          {[
            { icon: Leaf, value: sustainabilityStats.itemsSaved.toLocaleString(), label: "items saved" },
            { icon: Wind, value: sustainabilityStats.co2Saved, label: "CO₂ saved" },
            { icon: Droplets, value: sustainabilityStats.waterSaved, label: "water saved" },
          ].map(({ icon: Icon, value, label }) => (
            <div key={label} className="text-center bg-card/60 rounded-2xl p-3 backdrop-blur-sm">
              <Icon size={18} className="mx-auto mb-1.5 text-success" />
              <p className="text-[15px] font-bold text-foreground">{value}</p>
              <p className="text-[10px] text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SustainabilityBanner;
