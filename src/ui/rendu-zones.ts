/**
 * Rendu des zones : une seule teinte, très transparente, répétée à chaque tranche.
 * Les tranches sont empilées de la plus large à la plus étroite, donc les opacités
 * se cumulent vers le centre : le dégradé naît de la superposition et le fond de
 * carte reste lisible partout.
 */
export const TEINTE_ZONES = '#1a7f3c'
export const OPACITE_TRANCHE = 0.09

/**
 * Opacité visible sur la carte pour la tranche de rang `rang` (0 = la plus étroite),
 * quand `total` tranches sont empilées : 1 - (1 - a) ^ (total - rang).
 */
export function opaciteCumulee(rang: number, total: number): number {
  const couches = Math.max(0, total - rang)
  return 1 - (1 - OPACITE_TRANCHE) ** couches
}
