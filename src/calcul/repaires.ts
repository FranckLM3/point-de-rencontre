import { haversineKm } from './geo'
import type { VilleClassee } from './villes'
import type { Critere } from '../types'

/** Deux repaires proposés sont distants d'au moins cela : sinon c'est la même sortie. */
const DISTANCE_MIN_KM = 50
const NB_REPAIRES = 3

export interface Repaire {
  classee: VilleClassee
  /** Vrai quand la ville vaut la meilleure à l'écart près (nos temps sont des estimations). */
  equivalente: boolean
}

/**
 * Les meilleurs lieux de retrouvailles : des villes réelles, prises dans l'ordre du classement,
 * écartées d'au moins 50 km pour ne pas proposer trois fois la même sortie. `ecart` (dans l'unité
 * affichée) marque celles qui valent la meilleure, le classement étant trop fin pour les départager.
 */
export function meilleuresVilles(classees: VilleClassee[], critere: Critere, ecart: number): Repaire[] {
  const retenues: VilleClassee[] = []
  for (const c of classees) {
    if (retenues.length >= NB_REPAIRES) break
    const trop = retenues.some((r) => haversineKm(r.ville.lat, r.ville.lon, c.ville.lat, c.ville.lon) < DISTANCE_MIN_KM)
    if (!trop) retenues.push(c)
  }
  const meilleure = retenues[0]?.[critere] ?? 0
  return retenues.map((classee) => ({ classee, equivalente: classee[critere] - meilleure <= ecart }))
}
