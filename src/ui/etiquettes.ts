import type { Unite } from '../calcul/unites'
import type { VilleClassee } from '../calcul/villes'
import type { Critere } from '../types'
import { valeur } from './format'

export interface EtiquetteVille {
  ville: VilleClassee
  /** Vrai pour la toute première ville classée : bordure d'accent sur l'étiquette. */
  meilleure: boolean
  /** Valeur du critère actif, déjà mise en forme (ex. « 2 h 19 ») ; remplie après la sélection. */
  valeurAffichee?: string
}

/** Valeur du critère actif, mise en forme pour une étiquette. */
export function valeurEtiquette(c: VilleClassee, critere: Critere, unite: Unite): string {
  return valeur(critere === 'pire' ? c.pire : c.moyenne, unite)
}

/**
 * Étiquettes affichées sur la carte : seulement les meilleures villes du groupe (2026-09-28 : trois
 * au plus, le reste encombrait le fond de carte), déjà triées, la meilleure en tête, sans doublon.
 */
export function selectionEtiquettes(classees: VilleClassee[], max: number): EtiquetteVille[] {
  const dejaVues = new Set<string>()
  const resultat: EtiquetteVille[] = []
  for (const c of classees) {
    if (resultat.length >= max) break
    if (dejaVues.has(c.ville.nom)) continue
    dejaVues.add(c.ville.nom)
    resultat.push({ ville: c, meilleure: c === classees[0] })
  }
  return resultat
}

export interface BoiteEtiquette {
  id: string
  x: number
  y: number
  largeur: number
  hauteur: number
}

const chevauchent = (a: BoiteEtiquette, b: BoiteEtiquette): boolean =>
  a.x < b.x + b.largeur && a.x + a.largeur > b.x && a.y < b.y + b.hauteur && a.y + a.hauteur > b.y

/**
 * Évitement glouton des collisions en espace écran : les boîtes sont prises dans l'ordre fourni
 * (les mieux classées d'abord), une boîte qui chevauche une boîte déjà retenue est écartée.
 */
export function eviterCollisions(boites: BoiteEtiquette[]): BoiteEtiquette[] {
  const retenues: BoiteEtiquette[] = []
  for (const b of boites) {
    if (!retenues.some((r) => chevauchent(r, b))) retenues.push(b)
  }
  return retenues
}

/** Un marqueur de personne ou une grappe, en espace écran : centre et rayon. */
export interface CercleEcran {
  x: number
  y: number
  rayon: number
}

const chevaucheCercle = (b: BoiteEtiquette, c: CercleEcran): boolean => {
  const dx = Math.max(b.x - c.x, 0, c.x - (b.x + b.largeur))
  const dy = Math.max(b.y - c.y, 0, c.y - (b.y + b.hauteur))
  return dx * dx + dy * dy < c.rayon * c.rayon
}

/** Espace réservé entre la pointe (le point visé) et le bas de la carte. */
const MARGE_POINTE_PX = 10
const DECALAGE_PAS_PX = 10
const DECALAGE_MAX_PX = 60

export interface PlacementEtiquette {
  /** Coordonnées écran de la pointe : le point visé, décalé vers le haut si nécessaire. */
  x: number
  y: number
  boite: BoiteEtiquette
}

/**
 * Place une étiquette au-dessus du point visé, pointe en bas et centrée (même convention que la
 * carte : l'appelant pose l'élément à `(x, y)` avec `transform: translate(-50%, -100%)`). Un
 * marqueur de personne ou une grappe sous la carte la fait décaler vers le haut par pas de 10 px,
 * jusqu'à 60 px ; toujours en collision à ce point, l'étiquette est omise (`null`) plutôt que
 * dessinée cachée derrière un marqueur.
 */
export function placerEtiquette(
  id: string,
  pointeX: number,
  pointeY: number,
  largeur: number,
  hauteur: number,
  marqueurs: CercleEcran[],
): PlacementEtiquette | null {
  for (let decalage = 0; decalage <= DECALAGE_MAX_PX; decalage += DECALAGE_PAS_PX) {
    const y = pointeY - decalage
    const boite: BoiteEtiquette = { id, x: pointeX - largeur / 2, y: y - hauteur - MARGE_POINTE_PX, largeur, hauteur }
    if (!marqueurs.some((m) => chevaucheCercle(boite, m))) return { x: pointeX, y, boite }
  }
  return null
}
