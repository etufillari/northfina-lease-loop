/**
 * What a laptop repair costs us, in net euro cents including fitting, by the laptop's price class.
 * Demo figures set inside published ranges (Which? 2025 consumer survey, UK and German shop price
 * lists, excluding VAT); see RECOVERY.md. A real business would replace them with supplier prices.
 */
export type LaptopTier = 'budget' | 'mainstream' | 'premium';

export function laptopTier(originalPriceCents: number): LaptopTier {
  if (originalPriceCents < 80_000) return 'budget';
  return originalPriceCents < 200_000 ? 'mainstream' : 'premium';
}

export const laptopParts = {
  screen: { budget: 8_000, mainstream: 16_000, premium: 40_000 },
  key_repair: { budget: 3_000, mainstream: 4_000, premium: 6_000 },
  keyboard: { budget: 7_000, mainstream: 11_000, premium: 25_000 },
  port: { budget: 4_000, mainstream: 6_000, premium: 9_000 },
  charging_port: { budget: 6_000, mainstream: 9_000, premium: 12_000 },
  antenna: { budget: 2_000, mainstream: 2_000, premium: 2_000 },
  wifi_card: { budget: 3_000, mainstream: 3_500, premium: 4_000 },
  cooling_service: { budget: 4_500, mainstream: 4_500, premium: 5_000 },
  fan: { budget: 5_000, mainstream: 7_000, premium: 10_000 },
  storage: { budget: 6_000, mainstream: 8_000, premium: 12_000 },
  motherboard: { budget: 18_000, mainstream: 30_000, premium: 60_000 },
  camera_or_speaker: { budget: 3_000, mainstream: 4_000, premium: 6_000 },
  camera_and_speakers: { budget: 6_000, mainstream: 8_000, premium: 12_000 },
  hinge_repair: { budget: 5_000, mainstream: 7_000, premium: 11_000 },
  hinge_replacement: { budget: 9_000, mainstream: 13_000, premium: 25_000 },
  liquid_repair: { budget: 12_000, mainstream: 20_000, premium: 40_000 },
} as const satisfies Record<string, Record<LaptopTier, number>>;
export type LaptopPart = keyof typeof laptopParts;

export function laptopPartCost(part: LaptopPart, originalPriceCents: number): number {
  return laptopParts[part][laptopTier(originalPriceCents)];
}

/** Each customer answer names the job it leads to, so the cost is never a guess about the whole laptop. */
export const laptopAnswerParts: Record<string, { minor?: LaptopPart; fault: LaptopPart }> = {
  screen_damage: { minor: 'screen', fault: 'screen' },
  keyboard_fault: { minor: 'key_repair', fault: 'keyboard' },
  charging_fault: { minor: 'port', fault: 'charging_port' },
  network_fault: { minor: 'antenna', fault: 'wifi_card' },
  cooling_fault: { minor: 'cooling_service', fault: 'fan' },
  speed_fault: { minor: 'storage', fault: 'motherboard' },
  camera_audio_fault: { minor: 'camera_or_speaker', fault: 'camera_and_speakers' },
  hinge_fault: { minor: 'hinge_repair', fault: 'hinge_replacement' },
  liquid_fault: { fault: 'liquid_repair' },
};

/** The part an inspector's "needs repair" most likely means, used to suggest a cost they can change. */
const inspectionParts: Record<string, LaptopPart> = {
  display: 'screen',
  keyboard: 'keyboard',
  trackpad: 'keyboard',
  ports: 'port',
  charging: 'charging_port',
  wireless: 'wifi_card',
  camera_audio: 'camera_or_speaker',
  storage: 'storage',
  power_on: 'motherboard',
  chassis_hinges: 'hinge_replacement',
  cooling: 'fan',
};

export function inspectionPartCost(checkId: string, originalPriceCents: number): number | null {
  const part = inspectionParts[checkId];
  return part ? laptopPartCost(part, originalPriceCents) : null;
}

/**
 * Batteries wear with age, so the same reading can be normal or not: 70 % is fine after two years
 * and poor after two months. We replace below 80 %, but only charge when the battery is below what
 * its age explains. Normal: 95 % new, losing 1.25 points a month, never expected below 60 %.
 */
export function batteryAssessment(healthPercent: number, ageMonths: number) {
  const normalFloorPercent = Math.max(60, 95 - ageMonths * 1.25);
  const needsReplacement = healthPercent < 80;
  return {
    normalFloorPercent,
    needsReplacement,
    /** Replacing is the customer's cost only when age does not explain the wear. */
    customerPays: needsReplacement && healthPercent < normalFloorPercent,
  };
}
