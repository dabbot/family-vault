import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * A "slot" is a family member or a shared folder (for example "Car Insurance").
 * Slots are rows in public.family_members, added by the admin on the Family page.
 * Every document, folder and insurance policy belongs to one slot.
 */
export type FamilySlot = string;
export type SlotKind = "person" | "shared";
export type Slot = { slot: FamilySlot; name: string; kind: SlotKind; email: string | null };

export const SLOTS_QUERY_KEY = ["family-slots"] as const;
const NO_SLOTS: Slot[] = [];

/** Lower-case, URL-safe id from a display name: "Car Insurance" -> "car-insurance". */
export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "member"
  );
}

export function slotHelpers(slots: Slot[]) {
  const byId = new Map(slots.map((s) => [s.slot, s]));
  return {
    slots,
    people: slots.filter((s) => s.kind === "person"),
    shared: slots.filter((s) => s.kind === "shared"),
    slotName: (slot: FamilySlot | null | undefined) => (slot ? (byId.get(slot)?.name ?? slot) : ""),
    slotKind: (slot: FamilySlot | null | undefined): SlotKind => (slot ? (byId.get(slot)?.kind ?? "person") : "person"),
    /** The signed-in person's own slot, or the first person when they are not listed. */
    slotForEmail: (email: string | null | undefined): FamilySlot | null => {
      const e = (email ?? "").toLowerCase();
      return slots.find((s) => s.email === e)?.slot ?? slots.find((s) => s.kind === "person")?.slot ?? slots[0]?.slot ?? null;
    },
  };
}

export type SlotHelpers = ReturnType<typeof slotHelpers>;

/** Loads the family's members and shared folders. */
export function useFamilySlots(): SlotHelpers & { isLoading: boolean } {
  const q = useQuery({
    queryKey: SLOTS_QUERY_KEY,
    queryFn: async (): Promise<Slot[]> => {
      const { data, error } = await supabase
        .from("family_members")
        .select("slug, name, kind, email, sort_order")
        .order("sort_order")
        .order("name");
      if (error) throw error;
      return (data ?? []).map((r) => ({
        slot: r.slug,
        name: r.name,
        kind: r.kind === "shared" ? "shared" : "person",
        email: r.email,
      }));
    },
    staleTime: 60_000,
  });
  // Memoised so the helper functions stay stable between renders (safe in effect deps).
  const helpers = useMemo(() => slotHelpers(q.data ?? NO_SLOTS), [q.data]);
  return useMemo(() => ({ ...helpers, isLoading: q.isLoading }), [helpers, q.isLoading]);
}

/** Which icon a shared folder gets, picked from its name. */
export function sharedIconKey(name: string): "car" | "life" | "health" | "home" | "folder" {
  const n = name.toLowerCase();
  if (/(car|vehicle|bike|motor)/.test(n)) return "car";
  if (/life/.test(n)) return "life";
  if (/(health|medical)/.test(n)) return "health";
  if (/(home|house|property)/.test(n)) return "home";
  return "folder";
}
