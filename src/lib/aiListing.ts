type GeneratedListing = {
  title: string;
  description: string;
};

function titleCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export async function generateListingFromImage(imageUrl: string, brand?: string): Promise<GeneratedListing> {
  await new Promise((resolve) => window.setTimeout(resolve, 900));

  const cleanBrand = titleCase(String(brand || "").trim());
  const imageHint = imageUrl.toLowerCase();

  let garmentHint = "statement piece";
  if (imageHint.includes("dress")) garmentHint = "dress";
  else if (imageHint.includes("top")) garmentHint = "top";
  else if (imageHint.includes("pant") || imageHint.includes("trouser")) garmentHint = "pants";
  else if (imageHint.includes("bag")) garmentHint = "bag";
  else if (imageHint.includes("shoe")) garmentHint = "shoes";
  else if (imageHint.includes("coat") || imageHint.includes("jacket")) garmentHint = "outerwear piece";

  const title = cleanBrand ? `${cleanBrand} ${garmentHint}` : `Curated ${garmentHint}`;
  const description = cleanBrand
    ? `A ${garmentHint} from ${cleanBrand}, ready to rent for events, weekends, or elevated everyday styling. Review the condition, fit, and pickup or shipping options before publishing.`
    : `A curated ${garmentHint} ready to rent for events, weekends, or elevated everyday styling. Review the condition, fit, and pickup or shipping options before publishing.`;

  return { title, description };
}
