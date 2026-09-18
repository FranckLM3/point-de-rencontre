/**
 * Rendu des zones : chaque tranche garde sa propre couleur (calcul/zones.ts, COULEURS_TRANCHES),
 * peinte de la plus large à la plus étroite ; la plus étroite recouvre donc les autres en son
 * centre, si bien que chaque anneau affiché montre exactement la couleur de sa propre tranche.
 * La légende utilise les mêmes constantes : un carré de légende correspond pixel pour pixel à ce
 * qui est peint sur la carte.
 */
export const OPACITE_ZONE = 0.62
/** Contour fin à chaque frontière de tranche (D3) : lisible même quand deux verts sont proches. */
export const COULEUR_CONTOUR_ZONE = '#0b5d2a'
export const OPACITE_CONTOUR_ZONE = 0.35
export const EPAISSEUR_CONTOUR_ZONE = 1
