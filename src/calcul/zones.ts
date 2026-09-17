import { contours } from 'd3-contour'
import type { Grille } from './grille'

/** Du plus proche (vert) au plus loin (rouge). */
export const COULEURS_TRANCHES = ['#1a9850', '#66bd63', '#a6d96a', '#d9ef8b', '#fee08b', '#fdae61', '#f46d43', '#d73027'] as const

const HORS_ZONE = 1e9

export interface Tranche {
  seuil: number
  couleur: string
  /** MultiPolygon GeoJSON en [lon, lat]. */
  coordonnees: number[][][][]
}

/** pas, 2 pas, ... jusqu'au plafond (max, sinon la plus grande valeur), plafond inclus. */
export function seuils(pas: number, max: number | null, plusGrande = 0): number[] {
  const plafond = max ?? Math.min(plusGrande, pas * COULEURS_TRANCHES.length)
  const liste: number[] = []
  for (let s = pas; s < plafond && liste.length < COULEURS_TRANCHES.length - 1; s += pas) liste.push(s)
  liste.push(plafond)
  return liste
}

export function zones(g: Grille, valeurs: Float32Array, listeSeuils: number[]): Tranche[] {
  const opposees = Array.from(valeurs, (v, i) => (g.dedans[i] === 1 && Number.isFinite(v) ? -v : -HORS_ZONE))
  const generateur = contours().size([g.nx, g.ny]).thresholds(listeSeuils.map((s) => -s))
  const versLonLat = ([x, y]: number[]): number[] => [g.lon0 + (x! - 0.5) * g.pasLon, g.lat0 + (y! - 0.5) * g.pasLat]
  // d3-contour trie toujours ses seuils par ordre croissant, quel que soit l'ordre passé à
  // .thresholds() : la sortie va donc du seuil opposé le plus négatif (= le plus grand seuil
  // d'origine, la tranche la plus large) au moins négatif (le plus petit seuil, la plus
  // étroite). `listeSeuils` est croissante (voir `seuils`), donc le rang de sortie `rang`
  // correspond à la position `listeSeuils.length - 1 - rang` dans `listeSeuils`.
  return generateur(opposees).map((c, rang) => {
    const position = listeSeuils.length - 1 - rang
    return {
      seuil: listeSeuils[position]!,
      couleur: COULEURS_TRANCHES[Math.min(position, COULEURS_TRANCHES.length - 1)]!,
      coordonnees: c.coordinates.map((poly) => poly.map((anneau) => anneau.map(versLonLat))),
    }
  })
}
