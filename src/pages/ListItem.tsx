import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ChevronDown, Wrench } from "lucide-react";
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
  updatedAt: number;
};

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
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [stripeConnected, setStripeConnected] = useState(false);
  const [isFirstListing, setIsFirstListing] = useState(false);

  const [serverItemLoaded, setServerItemLoaded] = useState(false);
  const [lastDraftSavedAt, setLastDraftSavedAt] = useState<number | null>(null);
  const [hasDraft, setHasDraft] = useState(false);
  const [generatingListing, setGeneratingListing] = useState(false);
  const [lastGeneratedAt, setLastGeneratedAt] = useState<number | null>(null);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);

  const [runningDiagnostics, setRunningDiagnostics] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [diagnostics, setDiagnostics] = useState<Array<{ label: string; ok: boolean; detail: string }>>([]);

  const previewObjectUrlRef = useRef<string | null>(null);

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

  useEffect(() => {
    const loadUser = async () => {
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
    };

    loadUser();
  }, [isEditing]);

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
        setImageUrl(data.image_url || "");
      }

      setServerItemLoaded(true);
    };

    fetchItem();
  }, [id, isEditing]);

  useEffect(() => {
    if (!draftKey || !serverItemLoaded) return;

    const raw = localStorage.getItem(draftKey);
    if (!raw) {
      setHasDraft(false);
      return;
    }

    try {
      const draft = JSON.parse(raw) as DraftPayload;
      setHasDraft(true);
      const draftAgeHours = Math.round((Date.now() - (draft.updatedAt || 0)) / (1000 * 60 * 60));

      const shouldRestore = window.confirm(
        `You have an unsaved draft${draftAgeHours >= 1 ? ` from about ${draftAgeHours}h ago` : ""}. Restore it?`,
      );

      if (shouldRestore) {
        setTitle(draft.title || "");
        setBrand(draft.brand || "");
        setArea(draft.area || "");
        setCategory(draft.category || CATEGORY_OPTIONS[0]);
        setCondition(draft.condition || CONDITION_OPTIONS[0]);
        setDescription(draft.description || "");
        setPricePerDay(draft.pricePerDay || "");
        setStandardShippingPrice(draft.standardShippingPrice || "");
        setExpressShippingPrice(draft.expressShippingPrice || "");
        setAllowsPickup(draft.allowsPickup !== false);
        setAllowsDropoff(draft.allowsDropoff !== false);
        if (draft.imageUrl) setImageUrl(draft.imageUrl);
        toast({ title: "Draft restored" });
      }
    } catch {
      localStorage.removeItem(draftKey);
      setHasDraft(false);
    }
  }, [draftKey, serverItemLoaded]);

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
        imageUrl: isPersistableItemImageUrl(imageUrl) ? imageUrl : "",
        updatedAt: Date.now(),
      };

      localStorage.setItem(draftKey, JSON.stringify(draft));
      setHasDraft(true);
      setLastDraftSavedAt(draft.updatedAt);
    }, 650);

    return () => window.clearTimeout(timeout);
  }, [title, brand, area, category, condition, description, pricePerDay, standardShippingPrice, expressShippingPrice, allowsPickup, allowsDropoff, imageUrl, draftKey, serverItemLoaded]);

  useEffect(() => {
    return () => {
      if (previewObjectUrlRef.current) {
        URL.revokeObjectURL(previewObjectUrlRef.current);
      }
    };
  }, []);

  const clearDraft = () => {
    if (!draftKey) return;
    localStorage.removeItem(draftKey);
    setHasDraft(false);
    setLastDraftSavedAt(null);
    toast({ title: "Draft cleared" });
  };

  async function handleImageSelect(file: File) {
    const valid = validateImageFile(file);
    if (!valid.ok) {
      toast({ title: "Image not accepted", description: valid.reason, variant: "destructive" });
      return;
    }

    try {
      const prepared = await prepareImageForUpload(file);
      setImageFile(prepared.file);

      if (previewObjectUrlRef.current) {
        URL.revokeObjectURL(previewObjectUrlRef.current);
      }

      const previewUrl = URL.createObjectURL(prepared.file);
      previewObjectUrlRef.current = previewUrl;
      setImageUrl(previewUrl);
      setGeneratingListing(true);

      if (prepared.compressed) {
        toast({
          title: "Image optimized",
          description: `${formatBytes(prepared.originalSize)} -> ${formatBytes(prepared.finalSize)}`,
        });
      } else {
        toast({ title: "Image selected", description: `${formatBytes(prepared.finalSize)}` });
      }

      const generated = await generateListingFromImage(previewUrl, brand);
      setTitle((current) => (current.trim() ? current : generated.title));
      setDescription((current) => (current.trim() ? current : generated.description));
      setLastGeneratedAt(Date.now());
      toast({
        title: "Suggested listing ready",
        description: "Title and description were auto-filled from the image. Review before publishing.",
      });
    } catch (error: any) {
      toast({ title: "Image processing failed", description: error?.message || "Try another photo.", variant: "destructive" });
    } finally {
      setGeneratingListing(false);
    }
  }

  async function handleGenerateSuggestions() {
    if (!imageUrl) {
      toast({
        title: "Add an image first",
        description: "Upload a listing photo before generating suggestions.",
        variant: "destructive",
      });
      return;
    }

    try {
      setGeneratingListing(true);
      const generated = await generateListingFromImage(imageUrl, brand);
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

  async function runDiagnostics() {
    if (!isEditing || !id || !currentUser) return;

    setRunningDiagnostics(true);
    const checks: Array<{ label: string; ok: boolean; detail: string }> = [];

    const { data: userData } = await supabase.auth.getUser();
    checks.push({
      label: "Authenticated session",
      ok: Boolean(userData?.user?.id),
      detail: userData?.user?.id ? "Session found" : "No active session",
    });

    const { data: row, error: rowError } = await supabase.from("items").select("*").eq("id", id).maybeSingle();
    checks.push({
      label: "Can read listing row",
      ok: !rowError && Boolean(row),
      detail: rowError?.message || (row ? "Listing row loaded" : "Listing row not visible"),
    });

    const ownerId = row?.owner_id || row?.user_id;
    checks.push({
      label: "Ownership matches editor",
      ok: Boolean(ownerId && ownerId === currentUser.id),
      detail: ownerId ? (ownerId === currentUser.id ? "Owner/user id matches" : "Logged-in user does not match row owner") : "owner_id/user_id not present",
    });

    const { error: storageReadError } = await supabase.storage.from("items").list("", { limit: 1 });
    checks.push({
      label: "Storage bucket access",
      ok: !storageReadError,
      detail: storageReadError?.message || "Can list bucket",
    });

    let updateNoopOk = false;
    let updateDetail = "";

    if (row) {
      const updatePayload = {
        title: row.title,
      };

      const attempts = [
        { filter: "id_only" },
        { filter: "id_user" },
        { filter: "id_owner" },
      ] as const;

      for (const attempt of attempts) {
        let query = supabase.from("items").update(updatePayload).eq("id", id);
        if (attempt.filter === "id_user") query = query.eq("user_id", currentUser.id);
        if (attempt.filter === "id_owner") query = query.eq("owner_id", currentUser.id);

        const result = await query.select("id");

        if (result.error) {
          updateDetail = result.error.message;
          if (isMissingColumnError(result.error)) {
            continue;
          }
          continue;
        }

        if ((result.data || []).length > 0) {
          updateNoopOk = true;
          updateDetail = `No-op update works with ${attempt.filter}`;
          break;
        }

        updateDetail = `No rows returned for ${attempt.filter}`;
      }
    } else {
      updateDetail = "Skipped because listing row is not readable";
    }

    checks.push({
      label: "Can update listing row",
      ok: updateNoopOk,
      detail: updateDetail,
    });

    setDiagnostics(checks);
    setRunningDiagnostics(false);
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
      const hasPersistableImageUrl = isPersistableItemImageUrl(imageUrl);

      if (
        (!imageFile && !hasPersistableImageUrl) ||
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

      if (!imageFile && !hasPersistableImageUrl) {
        toast({
          title: "Image required",
          description: "Please reselect the item photo before saving.",
          variant: "destructive",
        });
        return;
      }

      let finalImageUrl = imageUrl;

      if (imageFile) {
        const filePath = buildStorageFilePath(user.id, imageFile);

        const { error: uploadError } = await withTimeout(
          supabase.storage.from("items").upload(filePath, imageFile, {
            upsert: false,
            cacheControl: "3600",
          }),
          15000,
          "Image upload",
        );

        if (uploadError) {
          console.error(uploadError);
          toast({ title: "Image upload failed", description: uploadError.message, variant: "destructive" });
          return;
        }

        const { data } = supabase.storage.from("items").getPublicUrl(filePath);
        finalImageUrl = data.publicUrl;
      }

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
                detail: { id, image_url: finalImageUrl, bust },
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
            title: "Connect payouts first",
            description: "Before your first listing goes live, connect Stripe so Snatch'n can pay you out safely.",
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
      setLoading(false);
    }
  };

  const imageSrc = imageFile
    ? imageUrl
    : getItemImageUrl(imageUrl, id, undefined);

  const validation: ValidationState = useMemo(() => {
    const parsedPricePerDay = Number(pricePerDay);
    const parsedStandardShippingPrice = Number(standardShippingPrice);
    const parsedExpressShippingPrice = Number(expressShippingPrice);
    const hasPersistableImageUrl = isPersistableItemImageUrl(imageUrl);

    return {
      image: Boolean(imageFile || hasPersistableImageUrl),
      title: Boolean(title.trim()),
      area: Boolean(area.trim()),
      category: Boolean(category.trim()),
      condition: Boolean(condition.trim()),
      description: Boolean(description.trim()),
      price: Number.isFinite(parsedPricePerDay) && parsedPricePerDay > 0,
      standardShipping: Number.isFinite(parsedStandardShippingPrice) && parsedStandardShippingPrice >= 0,
      expressShipping: Number.isFinite(parsedExpressShippingPrice) && parsedExpressShippingPrice >= 0,
    };
  }, [area, category, condition, description, expressShippingPrice, imageFile, imageUrl, pricePerDay, standardShippingPrice, title]);

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
                imageUrl,
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

        {imageUrl && <img src={imageSrc} alt="Preview" className="w-full max-w-xs rounded-xl" />}

        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          onChange={(e) => {
            if (e.target.files && e.target.files[0]) {
              handleImageSelect(e.target.files[0]);
            }
          }}
        />
        <p className="text-[11px] text-muted-foreground">JPG, PNG, WEBP, HEIC. We optimize large images automatically.</p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleGenerateSuggestions}
            disabled={!imageUrl || generatingListing}
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

      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="w-full h-12 bg-primary text-white rounded-xl font-semibold disabled:opacity-50 active:scale-[0.99] transition-all"
      >
        {generatingListing ? "Generating..." : loading ? "Saving..." : isEditing ? "Update Item" : "List Item"}
      </button>
      {!loading && !generatingListing && !canSubmit && (
        <p className="text-xs text-muted-foreground text-center">
          Fill all required fields to continue.
        </p>
      )}

      {isEditing && isOwnerAdmin && (
        <section className="rounded-2xl border border-border/60 bg-card/80 p-4">
          <button
            type="button"
            onClick={() => setShowDiagnostics((prev) => !prev)}
            className="w-full flex items-center justify-between"
          >
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
              <Wrench size={14} /> Admin diagnostics
            </span>
            <ChevronDown size={16} className={`transition-transform ${showDiagnostics ? "rotate-180" : ""}`} />
          </button>

          {showDiagnostics && (
            <div className="mt-3 space-y-3">
              <p className="text-xs text-muted-foreground">
                Runs safe checks for auth, RLS row updates, and storage access.
              </p>
              <button
                type="button"
                onClick={runDiagnostics}
                disabled={runningDiagnostics}
                className="h-9 px-3 rounded-lg border border-border text-xs font-semibold hover:bg-muted/50 disabled:opacity-60"
              >
                {runningDiagnostics ? "Running checks..." : "Run checks"}
              </button>

              {diagnostics.length > 0 && (
                <div className="space-y-2">
                  {diagnostics.map((check) => (
                    <div
                      key={check.label}
                      className={`rounded-xl border px-3 py-2 ${check.ok ? "border-emerald-300/70 bg-emerald-50/50" : "border-rose-300/70 bg-rose-50/50"}`}
                    >
                      <p className="text-xs font-semibold text-foreground">{check.label}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{check.detail}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
};

export default ListItem;
