import itemDress from "@/assets/item-dress-1.jpg";
import itemBlazer from "@/assets/item-blazer-1.jpg";
import itemJacket from "@/assets/item-jacket-1.jpg";
import itemBlouse from "@/assets/item-blouse-1.jpg";
import itemTrousers from "@/assets/item-trousers-1.jpg";
import itemWrapDress from "@/assets/item-wrapdress-1.jpg";
import itemCoat from "@/assets/item-coat-1.jpg";
import itemAccessories from "@/assets/item-accessories-1.jpg";

export interface Owner {
  id: string;
  name: string;
  avatar: string;
  rating: number;
  reviews: number;
  distance: string;
  verified: boolean;
  responseTime: string;
  successfulRentals: number;
}

export interface ClothingItem {
  id: string;
  title: string;
  brand: string;
  size: string;
  pricePerDay: number;
  pricePerWeek: number;
  image: string;
  condition: "Like New" | "Excellent" | "Good";
  category: string;
  collection?: string;
  owner: Owner;
  description: string;
  originalPrice: number;
  liked: boolean;
  distance: string;
  available: boolean;
}

export const owners: Owner[] = [
  {
    id: "1", name: "Maya Chen", avatar: "MC",
    rating: 4.9, reviews: 47, distance: "0.8 km", verified: true,
    responseTime: "< 1 hour", successfulRentals: 124,
  },
  {
    id: "2", name: "Priya Sharma", avatar: "PS",
    rating: 4.8, reviews: 32, distance: "1.2 km", verified: true,
    responseTime: "< 2 hours", successfulRentals: 89,
  },
  {
    id: "3", name: "Aisha Johnson", avatar: "AJ",
    rating: 5.0, reviews: 18, distance: "2.1 km", verified: true,
    responseTime: "< 30 min", successfulRentals: 56,
  },
  {
    id: "4", name: "Lena Kowalski", avatar: "LK",
    rating: 4.7, reviews: 63, distance: "0.5 km", verified: false,
    responseTime: "< 3 hours", successfulRentals: 201,
  },
];

export const items: ClothingItem[] = [
  {
    id: "1", title: "Terracotta Linen Midi Dress", brand: "Reformation",
    size: "M (US 8)", pricePerDay: 18, pricePerWeek: 85, image: itemDress,
    condition: "Like New", category: "Dresses", collection: "Date Night",
    owner: owners[0], description: "Gorgeous linen midi with a cinched waist. Perfect for summer evenings. Only worn twice — you can still smell the newness.",
    originalPrice: 248, liked: false, distance: "0.8 km", available: true,
  },
  {
    id: "2", title: "Sage Oversized Blazer", brand: "Arket",
    size: "S (US 4-6)", pricePerDay: 15, pricePerWeek: 70, image: itemBlazer,
    condition: "Excellent", category: "Outerwear", collection: "Work Wear",
    owner: owners[1], description: "The perfect throw-on-and-go blazer. Oversized but structured, pairs with everything from jeans to slip dresses.",
    originalPrice: 189, liked: true, distance: "1.2 km", available: true,
  },
  {
    id: "3", title: "Vintage Leather Jacket", brand: "AllSaints",
    size: "S (US 4)", pricePerDay: 25, pricePerWeek: 120, image: itemJacket,
    condition: "Good", category: "Outerwear", collection: "Statement Pieces",
    owner: owners[2], description: "A real showstopper. Buttery soft leather with perfectly worn-in patina. The kind of jacket that makes the outfit.",
    originalPrice: 420, liked: false, distance: "2.1 km", available: true,
  },
  {
    id: "4", title: "Cream Silk Blouse", brand: "Sézane",
    size: "M (US 8)", pricePerDay: 12, pricePerWeek: 55, image: itemBlouse,
    condition: "Like New", category: "Tops", collection: "Work Wear",
    owner: owners[0], description: "Effortlessly elegant. This silk blouse transitions seamlessly from the office to dinner. Dry cleaned after every rental.",
    originalPrice: 165, liked: false, distance: "0.8 km", available: true,
  },
  {
    id: "5", title: "Navy Tailored Trousers", brand: "COS",
    size: "L (US 10-12)", pricePerDay: 14, pricePerWeek: 65, image: itemTrousers,
    condition: "Excellent", category: "Bottoms", collection: "Work Wear",
    owner: owners[3], description: "Wide-leg trousers that mean business. High waisted with a beautiful drape. A wardrobe essential you can borrow whenever you need.",
    originalPrice: 135, liked: false, distance: "0.5 km", available: true,
  },
  {
    id: "6", title: "Burgundy Wrap Dress", brand: "& Other Stories",
    size: "S (US 4)", pricePerDay: 16, pricePerWeek: 75, image: itemWrapDress,
    condition: "Like New", category: "Dresses", collection: "Date Night",
    owner: owners[1], description: "Rich burgundy in the most flattering wrap silhouette. Perfect for dates, dinners, or when you want to feel put-together effortlessly.",
    originalPrice: 179, liked: true, distance: "1.2 km", available: true,
  },
  {
    id: "7", title: "Camel Wool Coat", brand: "Max Mara",
    size: "M (US 8)", pricePerDay: 35, pricePerWeek: 160, image: itemCoat,
    condition: "Excellent", category: "Outerwear", collection: "Statement Pieces",
    owner: owners[2], description: "The iconic camel coat. Investment-level quality you can try before you buy — or just borrow for the season.",
    originalPrice: 890, liked: false, distance: "2.1 km", available: true,
  },
  {
    id: "8", title: "Gold Earrings & Tan Crossbody Set", brand: "Madewell",
    size: "One Size", pricePerDay: 10, pricePerWeek: 45, image: itemAccessories,
    condition: "Like New", category: "Accessories", collection: "Weekend Casual",
    owner: owners[3], description: "Complete the look with this accessories bundle. Statement gold earrings pair perfectly with this cute tan crossbody.",
    originalPrice: 128, liked: false, distance: "0.5 km", available: true,
  },
];

export const collections = [
  { name: "Date Night", count: 24 },
  { name: "Work Wear", count: 38 },
  { name: "Weekend Casual", count: 52 },
  { name: "Statement Pieces", count: 16 },
  { name: "Party Ready", count: 21 },
];

export const categories = ["All", "Dresses", "Tops", "Bottoms", "Outerwear", "Accessories"];

export const sustainabilityStats = {
  itemsSaved: 1247,
  co2Saved: "3.2 tons",
  waterSaved: "890K liters",
  communityMembers: 2840,
};
