import { contours } from 'd3-contour'
import type { Grille } from './grille'

/** Du plus proche (vert profond) au plus loin (presque transparent). */
export const COULEURS_TRANCHES = ['#0b5d2a', '#1a7f3c', '#2f9e52', '#55b86f', '#86cf95', '#b5e2bd', '#d6efd9', '#ecf8ee'] as const

const HORS_ZONE = 1e9

export interface Tranche {
  seuil: number
  couleur: string
  /** MultiPolygon GeoJSON en [lon, lat]. */
  coordonnees: number[][][][]
}

/** pas, 2 pas, ... jusqu'au plafond (max, sinon la plus grande valeur), plafond inclus. */
export function seuils(pas: number, max: number | null, plusGrande = 0): number[] {
  const grande = Number.isFinite(plusGrande) ? plusGrande : 0
  const plafond = max ?? Math.min(grande, pas * COULEURS_TRANCHES.length)
  const liste: number[] = []
  for (let s = pas; s < plafond && liste.length < COULEURS_TRANCHES.length - 1; s += pas) liste.push(s)
  liste.push(plafond)
  return liste
}

export function zones(g: Grille, valeurs: Float32Array, listeSeuils: number[]): Tranche[] {
  const opposees = Array.from(valeurs, (v, i) => (g.dedans[i] === 1 && Number.isFinite(v) ? -v : -HORS_ZONE))
  const generateur = contours().size([g.nx, g.ny]).thresholds(listeSeuils.map((s) => -s))
  const versLonLat = ([x, y]: number[]): number[] => [g.lon0 + (x! - 0.5) * g.pasLon, g.lat0 + (y! - 0.5) * g.pasLat]
  // d3-contour trie toujours ses seuils par ordre croissant avant de générer les contours
  // (contours.js:44), quel que soit l'ordre passé à .thresholds() : on ne peut donc pas
  // déduire le seuil d'origine du rang de sortie. On relit le seuil directement sur chaque
  // contour rendu (`-c.value`), et la couleur vient de son rang dans une copie croissante de
  // `listeSeuils` (le plus petit seuil = le plus proche = vert profond, COULEURS_TRANCHES[0]).
  const listeAscendante = [...listeSeuils].sort((a, b) => a - b)
  return generateur(opposees)
    .map((c) => {
      const seuil = -c.value
      const position = listeAscendante.indexOf(seuil)
      return {
        seuil,
        couleur: COULEURS_TRANCHES[Math.min(position, COULEURS_TRANCHES.length - 1)]!,
        coordonnees: c.coordinates.map((poly) => poly.map((anneau) => anneau.map(versLonLat))),
      }
    })
    .sort((a, b) => b.seuil - a.seuil)
}
