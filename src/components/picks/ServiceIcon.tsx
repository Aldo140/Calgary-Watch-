import {
  Blinds, Bug, Car, CarFront, Disc3, Droplets, Fence, Flame, Hammer, House, KeyRound, PawPrint, Scissors, Snowflake,
  Sparkles, Sprout, Truck, WashingMachine, Wrench, Zap, type LucideIcon,
} from 'lucide-react';

/** One icon per Local service (src/data/localServices.ts), shared by /local/services and the Pick desks. */
export const SERVICE_ICONS: Record<string, LucideIcon> = {
  plumbing: Droplets, electrical: Zap, heating: Flame, roofing: House, handyman: Hammer, cleaning: Sparkles, pest: Bug,
  appliances: WashingMachine, locksmith: KeyRound, windows: Blinds, junk: Truck, snow: Snowflake, yard: Sprout, fencing: Fence,
  mechanic: CarFront, tires: Disc3, glass: Car, tailoring: Scissors, repair: Wrench, pets: PawPrint,
};

export function ServiceIcon({ id, size = 20 }: { id: string; size?: number }) {
  const I = SERVICE_ICONS[id] ?? Wrench;
  return <I size={size} aria-hidden="true" />;
}
