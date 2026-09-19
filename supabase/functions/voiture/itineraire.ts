// Partie pure de l'action `itineraire` de la fonction Edge `voiture` : construit le corps de la
// requête ORS Directions et analyse sa réponse GeoJSON. Testée à la fois par Vitest (Node) et,
// une fois exécutée, par la fonction Edge elle-même (Deno) : aucune dépendance ni à l'un ni à
// l'autre, comme encodage.ts.
import { arrondir5, type Point } from './encodage.ts'

/** `[lon, lat]` : décodé côté client (JSON), donc de forme non garantie. */
export function analyserCoordonnee(valeur: unknown): Point | null {
  if (!Array.isArray(valeur) || valeur.length !== 2) return null
  const [lon, lat] = valeur as unknown[]
  if (typeof lon !== 'number' || typeof lat !== 'number' || !Number.isFinite(lon) || !Number.isFinite(lat)) return null
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null
  return { lon, lat }
}

/** Corps de la requête ORS Directions (geojson) : un point de départ, un point d'arrivée. */
export function corpsItineraire(depart: Point, arrivee: Point): unknown {
  return {
    coordinates: [
      [depart.lon, depart.lat],
      [arrivee.lon, arrivee.lat],
    ],
    instructions: false,
    geometry_simplify: true,
  }
}

interface ReponseDirections {
  features?: {
    geometry?: { coordinates?: unknown }
    properties?: { summary?: { distance?: number; duration?: number } }
  }[]
}

export interface Itineraire {
  /** Coordonnées `[lon, lat]` du tracé, arrondies à 5 décimales (environ 1 m). */
  coordonnees: [number, number][]
  minutes: number
  km: number
}

/** `null` : réponse ORS sans tracé exploitable (forme inattendue). */
export function analyserReponseItineraire(json: ReponseDirections): Itineraire | null {
  const feature = json.features?.[0]
  const brutes = feature?.geometry?.coordinates
  const summary = feature?.properties?.summary
  if (!Array.isArray(brutes) || brutes.length === 0 || !summary) return null
  const coordonnees: [number, number][] = []
  for (const p of brutes as unknown[]) {
    if (!Array.isArray(p) || p.length < 2 || typeof p[0] !== 'number' || typeof p[1] !== 'number') return null
    coordonnees.push([arrondir5(p[0]), arrondir5(p[1])])
  }
  return {
    coordonnees,
    minutes: Math.round((summary.duration ?? 0) / 60),
    km: Math.round(((summary.distance ?? 0) / 1000) * 10) / 10,
  }
}
