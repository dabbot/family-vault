import { Car, Folder, HeartPulse, Home, ShieldCheck, User } from "lucide-react";
import { sharedIconKey, type Slot } from "@/lib/family-slots";

const SHARED_ICONS = { car: Car, life: ShieldCheck, health: HeartPulse, home: Home, folder: Folder } as const;

/** A person gets a person icon; a shared folder gets an icon picked from its name. */
export function SlotIcon({ slot, className }: { slot: Pick<Slot, "kind" | "name"> | undefined; className?: string }) {
  if (!slot || slot.kind === "person") return <User className={className} />;
  const Icon = SHARED_ICONS[sharedIconKey(slot.name)];
  return <Icon className={className} />;
}
