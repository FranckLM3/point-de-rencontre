import type { Critere, Ville } from '../types'
import { haversineKm } from './geo'

export interface VilleClassee {
  ville: Ville
  parAmi: number[]
  total: number
  moyenne: number
  pire: number
}

/** Vol d'oiseau : calcul exact au centre de chaque ville. */
export function classerVilles(
  villes: Ville[],
  amis: { lat: number; lon: number }[],
  critere: Critere,
  max: number | null,
  limite: number,
): VilleClassee[] {
  if (amis.length === 0) return []
  return villes
    .map((ville) => {
      const parAmi = amis.map((a) => haversineKm(a.lat, a.lon, ville.lat, ville.lon))
      const total = parAmi.reduce((s, d) => s + d, 0)
      return { ville, parAmi, total, moyenne: total / parAmi.length, pire: Math.max(...parAmi) }
    })
    .filter((c) => max === null || c[critere] <= max)
    .sort((x, y) => x[critere] - y[critere] || x.moyenne - y.moyenne)
    .slice(0, limite)
}
