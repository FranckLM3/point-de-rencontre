import { haversineKm } from '../calcul/geo'
import type { Station } from './horaires'

/** Réseaux de métro, RER, tram (plan 4) : stations et durées moyennes de chaque station vers chaque autre. */
export interface StationUrbaine {
  nom: string
  lat: number
  lon: number
}

export interface GareRattachee {
  /** Indice dans les stations SNCF (`Horaires.stations`). */
  gare: number
  /** Indice de la station urbaine la plus proche, à `GARE_STATION_MAX_KM` au plus. */
  station: number
}

export interface ReseauUrbain {
  id: string
  nom: string
  stations: StationUrbaine[]
  /** N x N minutes, ligne i = depuis la station i ; `INJOIGNABLE_URBAIN` si pas de trajet. */
  minutes: Uint8Array
  gares: GareRattachee[]
}

export const INJOIGNABLE_URBAIN = 255
/** Une gare SNCF et une station urbaine à moins de 400 m sont la même gare (Gare de Lyon SNCF et RER). */
const GARE_STATION_MAX_KM = 0.4

interface IndexPublie {
  reseaux: { id: string; nom: string; stations: [string, number, number][] }[]
}

/** Gares SNCF desservies proches d'une station du réseau (même station pour l'accès et la sortie). */
export function rattacherGares(stations: StationUrbaine[], sncf: Station[]): GareRattachee[] {
  const gares: GareRattachee[] = []
  const latMin = Math.min(...stations.map((s) => s.lat)) - 0.01
  const latMax = Math.max(...stations.map((s) => s.lat)) + 0.01
  sncf.forEach((g, gare) => {
    if (!g.desservie || g.lat < latMin || g.lat > latMax) return
    let meilleure = -1
    let meilleurKm = GARE_STATION_MAX_KM
    stations.forEach((s, station) => {
      const km = haversineKm(g.lat, g.lon, s.lat, s.lon)
      if (km <= meilleurKm) {
        meilleurKm = km
        meilleure = station
      }
    })
    if (meilleure >= 0) gares.push({ gare, station: meilleure })
  })
  return gares
}

async function lire(chemin: string): Promise<Response> {
  const reponse = await fetch(`${import.meta.env.BASE_URL}data/urbain/${chemin}`)
  if (!reponse.ok) throw new Error(`${chemin} HTTP ${reponse.status}`)
  return reponse
}

/**
 * Réseaux publiés, gares SNCF rattachées. Un échec n'empêche pas le reste : la page fonctionne
 * alors sans réseaux urbains (accès aux gares à pied puis en voiture), et l'erreur est journalisée.
 */
export async function chargerReseaux(sncf: Station[]): Promise<ReseauUrbain[]> {
  try {
    const index = (await (await lire('reseaux.json')).json()) as IndexPublie
    return await Promise.all(
      index.reseaux.map(async (r) => {
        const minutes = new Uint8Array(await (await lire(`${r.id}.bin`)).arrayBuffer())
        const stations = r.stations.map(([nom, lat, lon]) => ({ nom, lat, lon }))
        if (minutes.length !== stations.length * stations.length) throw new Error(`${r.id}.bin : taille inattendue`)
        return { id: r.id, nom: r.nom, stations, minutes, gares: rattacherGares(stations, sncf) }
      }),
    )
  } catch (e) {
    console.warn('Réseaux urbains indisponibles, accès aux gares estimés :', e)
    return []
  }
}
