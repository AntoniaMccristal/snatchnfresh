import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Loader2, Plus, X } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { toast } from "@/hooks/use-toast";
import {
  buildStorageFilePath,
  getItemImageUrl,
  isPersistableItemImageUrl,
  prepareImageForUpload,
  validateImageFile,
} from "@/lib/images";
import { generateListingFromImage } from "@/lib/aiListing";
import StripeConnectBanner from "@/components/StripeConnectBanner";

const CATEGORY_OPTIONS = ["Dresses", "Tops", "Bottoms", "Outerwear", "Accessories", "Shoes", "Bags"];
const CONDITION_OPTIONS = ["Brand new", "Like new", "Used- excellent", "Used- good", "Used - fair"];
const IS_STRIPE_TEST_MODE = String(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || "").startsWith("pk_test_");

type DraftPayload = {
  title: string;
  brand: string;
  area: string;
  category: string;
  condition: string;
  description: string;
  pricePerDay: string;
  standardShippingPrice: string;
  expressShippingPrice: string;
  allowsPickup: boolean;
  allowsDropoff: boolean;
  imageUrl: string;
  imageUrls: string[];
  blockedDates: BlockedDateRange[];
  updatedAt: number;
};

type BlockedDateRange = {
  start: string;
  end: string;
};

type ListingImage = {
  id: string;
  file: File | null;
  previewUrl: string;
  persistedUrl: string;
  uploading: boolean;
};

function createImageId(name = "photo") {
  return `${Date.now()}-${name}-${Math.random().toString(36).slice(2, 8)}`;
}

type ValidationState = {
  image: boolean;
  title: boolean;
  area: boolean;
  category: boolean;
  condition: boolean;
  description: boolean;
  price: boolean;
  standardShipping: boolean;
  expressShipping: boolean;
};

class ListItemErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: "" };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error: String(error?.message || error || "Unknown error") };
  }

  componentDidCatch(error: any) {
    console.error("ListItem render failed", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="app-shell p-6 space-y-4">
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-bold text-red-900">Listing form could not be displayed</p>
            <p className="text-xs text-red-700 mt-1">{this.state.error}</p>
          </div>
          <button
            type="button"
            onClick={() => window.history.back()}
            className="h-10 px-4 rounded-xl border border-border text-sm"
          >
            Go back
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

function getMissingColumnFromError(error: any): string | null {
  const message = String(error?.message || "");
  const schemaCacheMatch = message.match(/find the ['"]([a-zA-Z0-9_]+)['"] column/i);
  if (schemaCacheMatch?.[1]) return schemaCacheMatch[1];

  const quotedColumnMatch = message.match(/column ['"]([a-zA-Z0-9_]+)['"]/i);
  if (quotedColumnMatch?.[1]) return quotedColumnMatch[1];

  const directMatch = message.match(/column\s+([a-zA-Z0-9_]+)\s+/i);
  if (directMatch?.[1]) return directMatch[1];

  return null;
}

function isMissingColumnError(error: any): boolean {
  if (!error) return false;
  const code = String(error.code || "");
  const message = String(error.message || "").toLowerCase();
  return (
    code === "42703" ||
    code === "PGRST204" ||
    message.includes("could not find") ||
    message.includes("schema cache") ||
    message.includes("column")
  );
}

function formatBytes(size: number) {
  if (size < 1024) return `${size}B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)}KB`;
  return `${(size / (1024 * 1024)).toFixed(1)}MB`;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error(`${label} timed out. Please try again.`)), ms);
    }),
  ]);
}

function normaliseBlockedDates(value: unknown): BlockedDateRange[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((range) => {
      if (!range || typeof range !== "object") return null;
      const start = String((range as any).start || "").slice(0, 10);
      const end = String((range as any).end || "").slice(0, 10);
      if (!start || !end) return null;
      return { start, end };
    })
    .filter(Boolean) as BlockedDateRange[];
}

async function updateItemWithFallback(
  id: string,
  currentUserId: string,
  payload: Record<string, any>,
) {
  const updateAttempts = [
    { filter: "id_owner" },
    { filter: "id_user" },
    { filter: "id_only" },
  ] as const;

  let lastError: any = null;

  for (const attempt of updateAttempts) {
    const attemptPayload = { ...payload };

    for (let i = 0; i < 20; i += 1) {
      let query = supabase.from("items").update(attemptPayload).eq("id", id);

      if (attempt.filter === "id_owner") query = query.eq("owner_id", currentUserId);
      if (attempt.filter === "id_user") query = query.eq("user_id", currentUserId);

      const result = await withTimeout(
        query.select("id").maybeSingle(),
        12000,
        "Listing update",
      );

      lastError = result.error;
      if (!lastError) {
        return { updated: true, payload: attemptPayload, error: null };
      }

      if (!isMissingColumnError(lastError)) break;

      const missingColumn = getMissingColumnFromError(lastError);
      if (!missingColumn || !(missingColumn in attemptPayload)) break;
      delete attemptPayload[missingColumn];
    }
  }

  return { updated: false, payload, error: lastError };
}

async function insertItemWithFallback(
  payloads: Array<Record<string, any>>,
) {
  let lastError: any = null;
  let createdId: string | null = null;

  for (const basePayload of payloads) {
    const payload = { ...basePayload };

    for (let i = 0; i < 20; i += 1) {
      const result = await withTimeout(
        supabase.from("items").insert([payload]).select("id").maybeSingle(),
        12000,
        "Listing create",
      );

      lastError = result.error;
      if (!lastError) {
        createdId = result.data?.id || null;
        return { createdId, error: null };
      }

      if (!isMissingColumnError(lastError)) break;

      const missingColumn = getMissingColumnFromError(lastError);
      if (!missingColumn || !(missingColumn in payload)) break;
      delete payload[missingColumn];
    }
  }

  return { createdId, error: lastError };
}

const ListItem = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditing = !!id;

  const [title, setTitle] = useState("");
  const [brand, setBrand] = useState("");
  const [area, setArea] = useState("");
  const [category, setCategory] = useState(CATEGORY_OPTIONS[0]);
  const [condition, setCondition] = useState(CONDITION_OPTIONS[0]);
  const [description, setDescription] = useState("");
  const [pricePerDay, setPricePerDay] = useState("");
  const [standardShippingPrice, setStandardShippingPrice] = useState("");
  const [expressShippingPrice, setExpressShippingPrice] = useState("");
  const [allowsPickup, setAllowsPickup] = useState(true);
  const [allowsDropoff, setAllowsDropoff] = useState(true);
  const [images, setImages] = useState<ListingImage[]>([]);
  const [blockedDates, setBlockedDates] = useState<BlockedDateRange[]>([]);
  const [blockedStart, setBlockedStart] = useState("");
  const [blockedEnd, setBlockedEnd] = useState("");
  const [loading, setLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [stripeConnected, setStripeConnected] = useState(false);
  const [refreshingStripeStatus, setRefreshingStripeStatus] = useState(false);
  const [isFirstListing, setIsFirstListing] = useState(false);

  const [serverItemLoaded, setServerItemLoaded] = useState(false);
  const [lastDraftSavedAt, setLastDraftSavedAt] = useState<number | null>(null);
  const [hasDraft, setHasDraft] = useState(false);
  const [generatingListing, setGeneratingListing] = useState(false);
  const [lastGeneratedAt, setLastGeneratedAt] = useState<number | null>(null);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);

  const previewObjectUrlsRef = useRef<string[]>([]);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const maxImages = 6;

  const removeImage = (imageId: string) => {
    setImages((current) => {
      const image = current.find((entry) => entry.id === imageId);
      if (image?.previewUrl) {
        URL.revokeObjectURL(image.previewUrl);
        previewObjectUrlsRef.current = previewObjectUrlsRef.current.filter((url) => url !== image.previewUrl);
      }
      return current.filter((entry) => entry.id !== imageId);
    });
  };

  const isOwnerAdmin = useMemo(() => {
    if (!currentUser) return false;
    const email = String(currentUser.email || "").toLowerCase();
    const ownerEmail = String(import.meta.env.VITE_OWNER_EMAIL || "").toLowerCase();
    const ownerUserId = String(import.meta.env.VITE_OWNER_USER_ID || "");
    const localOwnerId = localStorage.getItem("snatchn-owner-id") || "";
    const localDebug = localStorage.getItem("snatchn-admin-mode") === "true";

    return Boolean(
      localDebug ||
      (ownerEmail && email === ownerEmail) ||
      (ownerUserId && currentUser.id === ownerUserId) ||
      (localOwnerId && currentUser.id === localOwnerId) ||
      email.includes("antonia"),
    );
  }, [currentUser]);

  const draftKey = useMemo(() => {
    if (!currentUser?.id) return null;
    return `snatchn:list-draft:${currentUser.id}:${id || "new"}`;
  }, [currentUser?.id, id]);

  const loadProfile = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    const user = data?.user ?? null;
    setCurrentUser(user);

    if (!user || isEditing) return;

    const [{ data: profileRow }, ownerCountResult, userCountResult] = await Promise.all([
      supabase
        .from("profiles")
        .select("stripe_account_id,stripe_connect_account_id")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("items")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", user.id),
      supabase
        .from("items")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id),
    ]);

    setStripeConnected(Boolean(profileRow?.stripe_account_id || profileRow?.stripe_connect_account_id));

    const ownerCountMissing =
      ownerCountResult.error?.code === "42703" ||
      String(ownerCountResult.error?.message || "").toLowerCase().includes("owner_id");
    const userCountMissing =
      userCountResult.error?.code === "42703" ||
      String(userCountResult.error?.message || "").toLowerCase().includes("user_id");

    const ownerCount =
      ownerCountResult.error && !ownerCountMissing ? 0 : Number(ownerCountResult.count || 0);
    const userCount =
      userCountResult.error && !userCountMissing ? 0 : Number(userCountResult.count || 0);

    setIsFirstListing(ownerCount + userCount === 0);
  }, [isEditing]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("stripe") !== "connected") return;

    const timeout = window.setTimeout(() => {
      void loadProfile();
    }, 2000);

    return () => window.clearTimeout(timeout);
  }, [loadProfile]);

  useEffect(() => {
    if (!isEditing) {
      setServerItemLoaded(true);
      return;
    }

    const fetchItem = async () => {
      const { data, error } = await supabase.from("items").select("*").eq("id", id).single();

      if (!error && data) {
        setTitle(data.title || "");
        setBrand(data.brand || "");
        setArea(data.location || data.suburb || data.area || "");
        setCategory(data.category || CATEGORY_OPTIONS[0]);
        setCondition(data.condition || CONDITION_OPTIONS[0]);
        setDescription(data.description || "");
        setPricePerDay(String(data.price_per_day || ""));
        setStandardShippingPrice(String(data.standard_shipping_price ?? ""));
        setExpressShippingPrice(String(data.express_shipping_price ?? ""));
        setAllowsPickup(data.allows_pickup !== false);
        setAllowsDropoff(data.allows_dropoff !== false);
        setBlockedDates(normaliseBlockedDates(data.blocked_dates));
        const existingImageUrls = Array.isArray(data.image_urls)
          ? data.image_urls.filter((value: unknown) => typeof value === "string" && value)
          : [];
        const fallbackImageUrls = existingImageUrls.length > 0
          ? existingImageUrls
          : data.image_url
            ? [data.image_url]
            : [];
        setImages(
          fallbackImageUrls.slice(0, maxImages).map((url: string, index: number) => ({
            id: `existing-${index}-${url}`,
            file: null,
            previewUrl: "",
            persistedUrl: url,
            uploading: false,
          })),
        );
      }

      setServerItemLoaded(true);
    };

    fetchItem();
  }, [id, isEditing]);

  useEffect(() => {
    if (!draftKey || !serverItemLoaded) return;

    const timeout = window.setTimeout(() => {
      const draft: DraftPayload = {
        title,
        brand,
        area,
        category,
        condition,
        description,
        pricePerDay,
        standardShippingPrice,
        expressShippingPrice,
        allowsPickup,
        allowsDropoff,
        imageUrl: images[0]?.persistedUrl || "",
        imageUrls: images.map((image) => image.persistedUrl).filter(Boolean),
        blockedDates,
        updatedAt: Date.now(),
      };

      localStorage.setItem(draftKey, JSON.stringify(draft));
      setHasDraft(true);
      setLastDraftSavedAt(draft.updatedAt);
    }, 650);

    return () => window.clearTimeout(timeout);
  }, [title, brand, area, category, condition, description, pricePerDay, standardShippingPrice, expressShippingPrice, allowsPickup, allowsDropoff, images, blockedDates, draftKey, serverItemLoaded]);

  useEffect(() => {
    return () => {
      previewObjectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const clearDraft = () => {
    if (!draftKey) return;
    localStorage.removeItem(draftKey);
    setHasDraft(false);
    setLastDraftSavedAt(null);
    toast({ title: "Draft cleared" });
  };

  const addBlockedDateRange = () => {
    if (!blockedStart || !blockedEnd) {
      toast({ title: "Choose dates", description: "Select a start and end date to block.", variant: "destructive" });
      return;
    }

    if (blockedEnd < blockedStart) {
      toast({ title: "Check date range", description: "End date must be after the start date.", variant: "destructive" });
      return;
    }

    setBlockedDates((current) => [...current, { start: blockedStart, end: blockedEnd }].sort((a, b) => a.start.localeCompare(b.start)));
    setBlockedStart("");
    setBlockedEnd("");
  };

  const removeBlockedDateRange = (index: number) => {
    setBlockedDates((current) => current.filter((_, currentIndex) => currentIndex !== index));
  };

  async function handleImageSelect(fileList: FileList | null) {
    const currentImages = images;
    const files = Array.from(fileList || []);
    const remaining = Math.max(0, maxImages - currentImages.length);
    const filesToAdd = files.slice(0, remaining);
    if (filesToAdd.length === 0) return;

    const optimizationMessages: string[] = [];
    try {
      for (const file of filesToAdd) {
        const valid = validateImageFile(file);
        if (!valid.ok) {
          toast({ title: "Image not accepted", description: valid.reason, variant: "destructive" });
          continue;
        }

        const prepared = await prepareImageForUpload(file);
        const previewUrl = URL.createObjectURL(prepared.file);
        previewObjectUrlsRef.current.push(previewUrl);
        const imageId = createImageId(prepared.file.name);
        setImages((current) => [
          ...current,
          {
            id: imageId,
            file: null,
            previewUrl,
            persistedUrl: "",
            uploading: true,
          },
        ].slice(0, maxImages));

        const userId = currentUser?.id;
        if (!userId) {
          throw new Error("Please log in before uploading photos.");
        }

        const filePath = buildStorageFilePath(userId, prepared.file);
        const { error: uploadError } = await withTimeout(
          supabase.storage.from("items").upload(filePath, prepared.file, {
            upsert: false,
            cacheControl: "3600",
          }),
          15000,
          "Image upload",
        );

        if (uploadError) {
          removeImage(imageId);
          throw uploadError;
        }

        const { data } = supabase.storage.from("items").getPublicUrl(filePath);
        setImages((current) => current.map((image) => (
          image.id === imageId
            ? { ...image, persistedUrl: data.publicUrl, uploading: false }
            : image
        )));

        optimizationMessages.push(
          prepared.compressed
            ? `${formatBytes(prepared.originalSize)} -> ${formatBytes(prepared.finalSize)}`
            : `${formatBytes(prepared.finalSize)}`,
        );
      }

      toast({
        title: filesToAdd.length > 1 ? `${filesToAdd.length} photos selected` : "Photo selected",
        description: optimizationMessages.join(" • "),
      });
    } catch (error: any) {
      toast({ title: "Image processing failed", description: error?.message || "Try another photo.", variant: "destructive" });
    } finally {
      setGeneratingListing(false);
    }
  }

  async function handleGenerateSuggestions() {
    const coverImage = images[0];
    const coverImageSrc = coverImage?.previewUrl || coverImage?.persistedUrl || "";
    if (!coverImageSrc) {
      toast({
        title: "Add an image first",
        description: "Upload a cover photo before generating suggestions.",
        variant: "destructive",
      });
      return;
    }

    try {
      setGeneratingListing(true);
      const generated = await generateListingFromImage(coverImageSrc, brand);
      setTitle(generated.title);
      setDescription(generated.description);
      setLastGeneratedAt(Date.now());
      toast({
        title: "Suggestions refreshed",
        description: "Review the generated title and description before publishing.",
      });
    } catch (error: any) {
      toast({
        title: "Generation failed",
        description: error?.message || "Could not generate listing suggestions.",
        variant: "destructive",
      });
    } finally {
      setGeneratingListing(false);
    }
  }

  const handleSubmit = async () => {
    setAttemptedSubmit(true);
    setLoading(true);
    try {
      const { data: sessionData } = await withTimeout(
        supabase.auth.getSession(),
        8000,
        "Session check",
      );
      const user = sessionData.session?.user;

      if (!user) {
        toast({ title: "Login required", description: "You must be logged in.", variant: "destructive" });
        return;
      }

      const parsedPricePerDay = Number(pricePerDay);
      const parsedStandardShippingPrice = Number(standardShippingPrice);
      const parsedExpressShippingPrice = Number(expressShippingPrice);
      const hasPersistableImageUrl = images.some((image) => isPersistableItemImageUrl(image.persistedUrl));

      if (
        (images.length === 0 && !hasPersistableImageUrl) ||
        !title.trim() ||
        !area.trim() ||
        !category.trim() ||
        !condition.trim() ||
        !description.trim() ||
        pricePerDay.trim() === "" ||
        standardShippingPrice.trim() === "" ||
        expressShippingPrice.trim() === "" ||
        !Number.isFinite(parsedPricePerDay) ||
        parsedPricePerDay <= 0 ||
        !Number.isFinite(parsedStandardShippingPrice) ||
        parsedStandardShippingPrice < 0 ||
        !Number.isFinite(parsedExpressShippingPrice) ||
        parsedExpressShippingPrice < 0
      ) {
        toast({
          title: "Missing details",
          description: "Complete every field before submitting, including image, area, condition, description, price, and shipping fees.",
          variant: "destructive",
        });
        return;
      }

      if (generatingListing) {
        toast({
          title: "Generation still running",
          description: "Wait for listing suggestions to finish before submitting.",
          variant: "destructive",
        });
        return;
      }

      if (images.length === 0 && !hasPersistableImageUrl) {
        toast({
          title: "Image required",
          description: "Please add at least one photo before saving.",
          variant: "destructive",
        });
        return;
      }

      const uploadedImages = await Promise.all(images.map(async (image) => {
        if (!image.file) {
          return image.persistedUrl;
        }

        setImages((current) => current.map((entry) => (
          entry.id === image.id ? { ...entry, uploading: true } : entry
        )));

        const filePath = buildStorageFilePath(user.id, image.file);
        const { error: uploadError } = await withTimeout(
          supabase.storage.from("items").upload(filePath, image.file, {
            upsert: false,
            cacheControl: "3600",
          }),
          15000,
          "Image upload",
        );

        if (uploadError) {
          throw uploadError;
        }

        const { data } = supabase.storage.from("items").getPublicUrl(filePath);
        return data.publicUrl;
      }));

      setImages((current) => current.map((image, index) => ({
        ...image,
        file: null,
        persistedUrl: uploadedImages[index] || image.persistedUrl,
        uploading: false,
      })));

      const finalImageUrls = uploadedImages.filter(Boolean);
      const finalImageUrl = finalImageUrls[0] || null;

      const basePayload = {
        title: title.trim(),
        brand: brand.trim(),
        location: area.trim(),
        suburb: area.trim(),
        category,
        condition,
        description: description.trim(),
        price_per_day: parsedPricePerDay,
        standard_shipping_price: parsedStandardShippingPrice,
        express_shipping_price: parsedExpressShippingPrice,
        allows_pickup: allowsPickup,
        allows_dropoff: allowsDropoff,
        image_urls: finalImageUrls,
        blocked_dates: blockedDates,
      };

      if (isEditing) {
        let payload: any = {
          ...basePayload,
          image_url: finalImageUrl || null,
        };

        const { updated, error, payload: finalPayload } = await updateItemWithFallback(id!, user.id, payload);
        payload = finalPayload;

        if (!updated && error) {
          console.error(error);
          const message = String(error.message || "");
          if (message.toLowerCase().includes("row-level security") || message.toLowerCase().includes("permission denied")) {
            toast({
              title: "Two-step verification required",
              description: "Please verify your account again before editing listings.",
              variant: "destructive",
            });
            navigate("/auth/mfa");
            return;
          }
          toast({ title: "Update failed", description: error.message || "Error updating item.", variant: "destructive" });
        } else if (updated) {
          if (id) {
            const bust = String(Date.now());
            sessionStorage.setItem(`snatchn-item-bust-${id}`, bust);
            window.dispatchEvent(
              new CustomEvent("snatchn:item-updated", {
                detail: { id, image_url: finalImageUrl, image_urls: finalImageUrls, bust },
              }),
            );
          }

          if (draftKey) {
            localStorage.removeItem(draftKey);
            setHasDraft(false);
          }

          toast({ title: "Item updated", description: "Your listing changes are now live." });
          navigate("/profile", { replace: true });
        } else {
          toast({
            title: "Update failed",
            description: "The listing could not be updated. Run Diagnostics below if this persists.",
            variant: "destructive",
          });
        }
      } else {
        if (isFirstListing && !stripeConnected && !IS_STRIPE_TEST_MODE) {
          toast({
            title: "Your bank account is connecting",
            description: "Your bank account is connecting — please wait a moment and try again.",
            variant: "destructive",
          });
          setLoading(false);
          return;
        }

        const insertPayload: any = {
          ...basePayload,
          image_url: finalImageUrl || null,
        };
        let createdId: string | null = null;
        let error: any = null;

        const insertAttempts = [
          { payload: { ...insertPayload, owner_id: user.id, user_id: user.id } },
          { payload: { ...insertPayload, user_id: user.id } },
          { payload: { ...insertPayload, owner_id: user.id } },
          { payload: { ...insertPayload } },
        ];

        const createResult = await insertItemWithFallback(insertAttempts.map((attempt) => attempt.payload));
        createdId = createResult.createdId;
        error = createResult.error;

        if (createdId) {
          sessionStorage.setItem(`snatchn-item-bust-${createdId}`, String(Date.now()));
        }

        if (!createdId && error) {
          console.error(error);
          toast({ title: "Create failed", description: error.message || "Error creating item.", variant: "destructive" });
        } else if (createdId) {
          if (draftKey) {
            localStorage.removeItem(draftKey);
            setHasDraft(false);
          }
          toast({ title: "Item listed", description: "Your listing is now live." });
          navigate("/profile", { replace: true });
        } else {
          toast({
            title: "Create failed",
            description: "The listing could not be created with the current database schema.",
            variant: "destructive",
          });
        }
      }
    } catch (error: any) {
      console.error("Listing submit failed", error);
      toast({
        title: "Save failed",
        description: error?.message || "Something went wrong while saving the listing.",
        variant: "destructive",
      });
    } finally {
      setImages((current) => current.map((image) => ({ ...image, uploading: false })));
      setLoading(false);
    }
  };

  const coverImage = images[0];
  const coverImageSrc = coverImage
    ? coverImage.previewUrl || getItemImageUrl(coverImage.persistedUrl, id, undefined)
    : "";

  const validation: ValidationState = useMemo(() => {
    const parsedPricePerDay = Number(pricePerDay);
    const parsedStandardShippingPrice = Number(standardShippingPrice);
    const parsedExpressShippingPrice = Number(expressShippingPrice);
    const hasPersistableImageUrl = images.some((image) => isPersistableItemImageUrl(image.persistedUrl));

    return {
      image: Boolean(images.length > 0 || hasPersistableImageUrl),
      title: Boolean(title.trim()),
      area: Boolean(area.trim()),
      category: Boolean(category.trim()),
      condition: Boolean(condition.trim()),
      description: Boolean(description.trim()),
      price: Number.isFinite(parsedPricePerDay) && parsedPricePerDay > 0,
      standardShipping: Number.isFinite(parsedStandardShippingPrice) && parsedStandardShippingPrice >= 0,
      expressShipping: Number.isFinite(parsedExpressShippingPrice) && parsedExpressShippingPrice >= 0,
    };
  }, [area, category, condition, description, expressShippingPrice, images, pricePerDay, standardShippingPrice, title]);

  const missingFieldMessages = useMemo(() => {
    const messages: string[] = [];
    if (!validation.image) messages.push("Add an image");
    if (!validation.title) messages.push("Add a title");
    if (!validation.area) messages.push("Add an area");
    if (!validation.description) messages.push("Add a description");
    if (!validation.price) messages.push("Add a valid daily price");
    if (!validation.standardShipping) messages.push("Add a valid standard shipping fee");
    if (!validation.expressShipping) messages.push("Add a valid express shipping fee");
    return messages;
  }, [validation]);

  const canSubmit = Object.values(validation).every(Boolean) && !loading && !generatingListing;

  return (
    <div className="app-shell p-6 space-y-6 pb-32">
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-xl font-bold">{isEditing ? "Edit Item" : "List an Item"}</h1>
        <div className="text-right">
          <button
            type="button"
            onClick={() => {
              if (!draftKey) return;
              const draft: DraftPayload = {
                title,
                brand,
                area,
                category,
                condition,
                description,
                pricePerDay,
                standardShippingPrice,
                expressShippingPrice,
                allowsPickup,
                allowsDropoff,
                imageUrl: images[0]?.persistedUrl || "",
                imageUrls: images.map((image) => image.persistedUrl).filter(Boolean),
                blockedDates,
                updatedAt: Date.now(),
              };
              localStorage.setItem(draftKey, JSON.stringify(draft));
              setHasDraft(true);
              setLastDraftSavedAt(draft.updatedAt);
              toast({ title: "Draft saved" });
            }}
            className="text-xs font-semibold text-primary hover:underline"
          >
            Save draft
          </button>
          <p className="text-[11px] text-muted-foreground mt-1">
            {lastDraftSavedAt ? `Saved ${new Date(lastDraftSavedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Autosaves while you type"}
          </p>
          {hasDraft && (
            <button
              type="button"
              onClick={clearDraft}
              className="text-[11px] text-muted-foreground hover:text-foreground mt-1"
            >
              Discard draft
            </button>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {!isEditing && isFirstListing && (
          <div className="space-y-3">
            {!IS_STRIPE_TEST_MODE && (
              <div className="flex items-center justify-between rounded-2xl border border-border/50 bg-card px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className={`inline-block h-2.5 w-2.5 rounded-full ${stripeConnected ? "bg-emerald-500" : "bg-amber-500"}`} />
                  <span className="text-sm font-medium text-foreground">
                    {stripeConnected ? "Payouts connected" : "Not connected"}
                  </span>
                </div>
                {!stripeConnected && (
                  <button
                    type="button"
                    onClick={async () => {
                      setRefreshingStripeStatus(true);
                      try {
                        await loadProfile();
                      } finally {
                        setRefreshingStripeStatus(false);
                      }
                    }}
                    className="text-xs font-semibold text-primary disabled:opacity-60"
                    disabled={refreshingStripeStatus}
                  >
                    {refreshingStripeStatus ? "Refreshing..." : "Tap to refresh"}
                  </button>
                )}
              </div>
            )}
            <StripeConnectBanner
              returnPath="/list"
              variant="inline"
              heading="Add your bank to get paid"
              compactDescription={
                IS_STRIPE_TEST_MODE
                  ? "In Stripe test mode this step is optional, but you can connect a test payout account now to verify the full lender flow."
                  : "Before your first listing goes live, add your bank through Stripe so Snatch'n can split rental payments and pay you out safely."
              }
              onConnected={() => setStripeConnected(true)}
              onStatusChange={(nextStatus) => setStripeConnected(nextStatus.connected)}
            />
            {IS_STRIPE_TEST_MODE && !stripeConnected && (
              <p className="text-xs text-muted-foreground px-1">
                Test mode is active. You can still publish without completing bank setup, then come back later to test lender onboarding.
              </p>
            )}
          </div>
        )}

        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            void handleImageSelect(e.target.files);
            e.target.value = "";
          }}
        />
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <h2 className="text-sm font-semibold text-foreground">Add photos</h2>
            <span className="text-sm text-muted-foreground">(Up to 6)</span>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {Array.from({ length: images.length >= maxImages ? maxImages : images.length + 1 }).map((_, index) => {
              const image = images[index];
              const imageSrc = image
                ? image.previewUrl || getItemImageUrl(image.persistedUrl, id, undefined)
                : "";

              if (image) {
                return (
                  <div
                    key={image.id}
                    className="relative h-40 w-[120px] shrink-0 overflow-hidden rounded-2xl border border-border bg-card"
                  >
                    <img src={imageSrc} alt={`Listing photo ${index + 1}`} className="h-full w-full object-cover" />
                    {index === 0 && (
                      <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-semibold text-white">
                        Cover
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => removeImage(image.id)}
                      className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white"
                    >
                      <X size={12} />
                    </button>
                    {image.uploading && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                        <Loader2 size={18} className="animate-spin text-white" />
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <button
                  key={`empty-${index}`}
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
                  className="relative flex h-40 w-[120px] shrink-0 items-center justify-center rounded-2xl border-2 border-dashed border-border bg-card text-muted-foreground"
                >
                  {index === 0 && (
                    <span className="absolute left-2 top-2 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-foreground">
                      Cover
                    </span>
                  )}
                  <Plus size={24} />
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground">Add up to 6 photos. JPG, PNG, WEBP, HEIC. We optimize large images automatically.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleGenerateSuggestions}
            disabled={!coverImageSrc || generatingListing}
            className="h-10 px-4 rounded-xl border border-border/60 bg-card text-sm font-semibold disabled:opacity-50"
          >
            {generatingListing ? "Generating..." : "Generate listing details"}
          </button>
          {lastGeneratedAt && (
            <p className="text-[11px] text-muted-foreground">
              Suggested copy updated {new Date(lastGeneratedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </p>
          )}
        </div>
        {attemptedSubmit && !validation.image && (
          <p className="text-xs text-destructive">Add an image before publishing.</p>
        )}
      </div>

      <input
        placeholder="Title"
        className={`w-full border p-3 rounded-xl ${attemptedSubmit && !validation.title ? "border-destructive" : ""}`}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />

      <input
        placeholder="Brand (optional, e.g. Bec + Bridge)"
        className="w-full border p-3 rounded-xl"
        value={brand}
        onChange={(e) => setBrand(e.target.value)}
      />

      <input
        placeholder="Area (e.g. Bondi, Inner West, Surry Hills)"
        className={`w-full border p-3 rounded-xl ${attemptedSubmit && !validation.area ? "border-destructive" : ""}`}
        value={area}
        onChange={(e) => setArea(e.target.value)}
      />

      <div className="grid grid-cols-2 gap-3">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full border p-3 rounded-xl bg-white"
        >
          {CATEGORY_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>

        <select
          value={condition}
          onChange={(e) => setCondition(e.target.value)}
          className="w-full border p-3 rounded-xl bg-white"
        >
          {CONDITION_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      <textarea
        placeholder="Description"
        className={`w-full border p-3 rounded-xl ${attemptedSubmit && !validation.description ? "border-destructive" : ""}`}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />

      <input
        type="number"
        placeholder="Price per day"
        className={`w-full border p-3 rounded-xl ${attemptedSubmit && !validation.price ? "border-destructive" : ""}`}
        value={pricePerDay}
        onChange={(e) => setPricePerDay(e.target.value)}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <input
          type="number"
          min="0"
          step="1"
          placeholder="Standard shipping flat fee"
          className={`w-full border p-3 rounded-xl ${attemptedSubmit && !validation.standardShipping ? "border-destructive" : ""}`}
          value={standardShippingPrice}
          onChange={(e) => setStandardShippingPrice(e.target.value)}
        />

        <input
          type="number"
          min="0"
          step="1"
          placeholder="Express shipping flat fee"
          className={`w-full border p-3 rounded-xl ${attemptedSubmit && !validation.expressShipping ? "border-destructive" : ""}`}
          value={expressShippingPrice}
          onChange={(e) => setExpressShippingPrice(e.target.value)}
        />
      </div>

      {attemptedSubmit && missingFieldMessages.length > 0 && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-3">
          <p className="text-sm font-semibold text-foreground">Complete these fields first</p>
          <ul className="mt-1 text-xs text-muted-foreground space-y-1">
            {missingFieldMessages.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-2">
        <p className="text-sm font-semibold text-foreground">Pickup & drop-off preferences</p>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={allowsPickup}
            onChange={(e) => setAllowsPickup(e.target.checked)}
          />
          I am happy for renter pickup
        </label>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={allowsDropoff}
            onChange={(e) => setAllowsDropoff(e.target.checked)}
          />
          I can drop off to the renter
        </label>
        <p className="text-xs text-muted-foreground">
          Renter and seller confirm exact handoff time via in-app messages during booking.
        </p>
      </div>

      <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-3">
        <div>
          <p className="text-sm font-semibold text-foreground">Block dates</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Mark periods when this item is unavailable, like holidays or personal use.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2">
          <input
            type="date"
            value={blockedStart}
            onChange={(e) => {
              setBlockedStart(e.target.value);
              if (!blockedEnd || blockedEnd < e.target.value) setBlockedEnd(e.target.value);
            }}
            className="h-11 rounded-xl border border-border bg-background px-3 text-sm"
            aria-label="Blocked start date"
          />
          <input
            type="date"
            value={blockedEnd}
            min={blockedStart || undefined}
            onChange={(e) => setBlockedEnd(e.target.value)}
            className="h-11 rounded-xl border border-border bg-background px-3 text-sm"
            aria-label="Blocked end date"
          />
          <button
            type="button"
            onClick={addBlockedDateRange}
            className="h-11 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground"
          >
            Add
          </button>
        </div>
        {blockedDates.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {blockedDates.map((range, index) => (
              <span
                key={`${range.start}-${range.end}-${index}`}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground"
              >
                {range.start} to {range.end}
                <button
                  type="button"
                  onClick={() => removeBlockedDateRange(index)}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label={`Remove blocked range ${range.start} to ${range.end}`}
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No blocked dates added.</p>
        )}
      </div>

      <button
        onClick={handleSubmit}
        disabled={isEditing ? loading : !canSubmit}
        className="w-full h-12 bg-primary text-white rounded-xl font-semibold disabled:opacity-50 active:scale-[0.99] transition-all"
      >
        {generatingListing ? "Generating..." : loading ? "Saving..." : isEditing ? "Update Item" : "List Item"}
      </button>
      {!loading && !generatingListing && !canSubmit && (
        <p className="text-xs text-muted-foreground text-center">
          Fill all required fields to continue.
        </p>
      )}

    </div>
  );
};

export default function ListItemWithBoundary() {
  return (
    <ListItemErrorBoundary>
      <ListItem />
    </ListItemErrorBoundary>
  );
}
