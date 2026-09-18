import type { Ami, Critere, Ville } from '../types'
import { haversineKm } from './geo'

export interface Detail {
  valeur: number
  /** Texte court sous le nom, par exemple « Marseille Saint-Charles → Paris Gare de Lyon ». */
  precision?: string
}

/** Trajet d'une personne vers un point, null si elle ne peut pas l'atteindre. */
export type Mesure = (ami: Ami, lat: number, lon: number) => Detail | null

export const mesureOiseau: Mesure = (a, lat, lon) => ({ valeur: haversineKm(a.lat, a.lon, lat, lon) })

export interface VilleClassee {
  ville: Ville
  parAmi: Detail[]
  total: number
  moyenne: number
  pire: number
}

export function evaluer(ville: Ville, amis: Ami[], mesure: Mesure): VilleClassee | null {
  const parAmi: Detail[] = []
  for (const a of amis) {
    const d = mesure(a, ville.lat, ville.lon)
    if (d === null) return null
    parAmi.push(d)
  }
  const valeurs = parAmi.map((d) => d.valeur)
  const total = valeurs.reduce((s, v) => s + v, 0)
  return { ville, parAmi, total, moyenne: total / valeurs.length, pire: Math.max(...valeurs) }
}

/** La ville la plus proche du point (à vol d'oiseau), pour nommer le repaire. */
export function villeLaPlusProche(villes: Ville[], lat: number, lon: number): Ville | null {
  let proche: Ville | null = null
  let min = Number.POSITIVE_INFINITY
  for (const v of villes) {
    const d = haversineKm(lat, lon, v.lat, v.lon)
    if (d < min) {
      min = d
      proche = v
    }
  }
  return proche
}

/** Calcul exact au centre de chaque ville ; une ville injoignable pour une personne est écartée. */
export function classerVilles(
  villes: Ville[],
  amis: Ami[],
  mesure: Mesure,
  critere: Critere,
  max: number | null,
  limite: number,
): VilleClassee[] {
  if (amis.length === 0) return []
  // Le maximum s'applique toujours au pire trajet (personne ne le dépasse), quel que soit le
  // critère choisi ; le critère ne sert qu'à classer les villes qui passent ce filtre.
  return villes
    .map((ville) => evaluer(ville, amis, mesure))
    .filter((c): c is VilleClassee => c !== null && (max === null || c.pire <= max))
    .sort((x, y) => x[critere] - y[critere] || x.moyenne - y.moyenne)
    .slice(0, limite)
}
