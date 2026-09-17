import type { Horaires, Station } from '../donnees/horaires'
import { INJOIGNABLE, NB_VOISINS } from '../donnees/horaires'
import type { Ami, Grandeur, Transport } from '../types'
import { haversineKm } from './geo'
import type { Grille } from './grille'

const DETOUR = 1.3
const MARCHE_MAX_KM = 1.5
const VITESSE = { marche: 4.5, bus: 20, voiture: 40 } as const
const DIRECT_MAX_KM = 30
const PRIX_BUS = 2
const PRIX_MIN_TRAIN = 5
const TAUX_GRANDE_LIGNE = 0.1
const TAUX_REGIONAL = 0.12
/** Deux gares plus proches que cela comptent pour une seule (même règle que l'index Python). */
const ECART_MIN_KM = 0.5
/** Au-delà, une gare ne sert ni au départ ni à l'arrivée (la Corse n'a pas de train dans ces données). */
export const GARE_MAX_KM = 50

const distanceGare = (lat: number, lon: number, s: Station): number => {
  if (!s.desservie) return Number.POSITIVE_INFINITY
  const km = haversineKm(lat, lon, s.lat, s.lon)
  return km <= GARE_MAX_KM ? km : Number.POSITIVE_INFINITY
}

const minutesA = (km: number, vitesse: number): number => ((km * DETOUR) / vitesse) * 60

export function acces(km: number, transport: Transport): number {
  if (km <= MARCHE_MAX_KM) return minutesA(km, VITESSE.marche)
  return minutesA(km, transport === 'voiture' ? VITESSE.voiture : VITESSE.bus)
}

const prixAcces = (km: number, transport: Transport): number =>
  km > MARCHE_MAX_KM && transport !== 'voiture' ? PRIX_BUS : 0

export function prixTrain(km: number, grandeLigne: boolean): number {
  if (km <= 0) return 0
  return Math.max(PRIX_MIN_TRAIN, km * (grandeLigne ? TAUX_GRANDE_LIGNE : TAUX_REGIONAL))
}

export interface Proche {
  gare: number
  km: number
}

const tropPres = (stations: Station[], s: Station, retenues: Proche[]): boolean =>
  retenues.some((r) => haversineKm(s.lat, s.lon, stations[r.gare]!.lat, stations[r.gare]!.lon) <= ECART_MIN_KM)

/** Gares desservies à 50 km au plus, distinctes de plus de 500 m, la plus proche d'abord. */
export function garesProches(stations: Station[], lat: number, lon: number, n = NB_VOISINS): Proche[] {
  const distances = stations.map((s) => distanceGare(lat, lon, s))
  const ecartees = new Uint8Array(stations.length)
  const retenues: Proche[] = []
  // n passages linéaires plutôt qu'un tri complet : appelé pour chaque ville.
  while (retenues.length < n) {
    let meilleure = -1
    let plusCourte = Number.POSITIVE_INFINITY
    for (let i = 0; i < distances.length; i++) {
      if (ecartees[i] === 1 || !(distances[i]! < plusCourte)) continue
      if (tropPres(stations, stations[i]!, retenues)) {
        ecartees[i] = 1
      } else {
        meilleure = i
        plusCourte = distances[i]!
      }
    }
    if (meilleure < 0) break
    ecartees[meilleure] = 1
    retenues.push({ gare: meilleure, km: plusCourte })
  }
  return retenues
}

/** Meilleur trajet d'une personne vers chaque gare (accès compris). */
export interface DepuisGares {
  minutes: Float32Array
  euros: Float32Array
  /** Gare de départ retenue, -1 si injoignable. */
  depart: Int32Array
  proches: Proche[]
}

export function depuisGares(h: Horaires, ami: Ami): DepuisGares {
  const n = h.stations.length
  const r: DepuisGares = {
    minutes: new Float32Array(n).fill(Number.POSITIVE_INFINITY),
    euros: new Float32Array(n).fill(Number.NaN),
    depart: new Int32Array(n).fill(-1),
    proches: garesProches(h.stations, ami.lat, ami.lon),
  }
  for (const p of r.proches) {
    const ligne = h.ligne(p.gare)
    if (!ligne) continue
    const avant = acces(p.km, ami.transport)
    const prixAvant = prixAcces(p.km, ami.transport)
    for (let g = 0; g < n; g++) {
      const m = ligne.minutes[g]!
      if (m === INJOIGNABLE) continue
      const total = avant + m
      if (total < r.minutes[g]!) {
        r.minutes[g] = total
        r.euros[g] = prixAvant + prixTrain(ligne.km[g]!, ligne.grandeLigne[g] === 1)
        r.depart[g] = p.gare
      }
    }
  }
  return r
}

export interface TrajetTc {
  minutes: number
  euros: number
  /** Noms des gares, null pour un trajet direct sans train. */
  depart: string | null
  arrivee: string | null
}

function meilleurVers(h: Horaires, d: DepuisGares, ami: Ami, km: number, gares: Proche[]): TrajetTc | null {
  let best: TrajetTc | null = null
  if (km <= DIRECT_MAX_KM) {
    best = { minutes: acces(km, ami.transport), euros: prixAcces(km, ami.transport), depart: null, arrivee: null }
  }
  for (const g of gares) {
    const avant = d.minutes[g.gare]!
    if (!Number.isFinite(avant)) continue
    const minutes = avant + acces(g.km, 'tc')
    if (best === null || minutes < best.minutes) {
      best = {
        minutes,
        euros: d.euros[g.gare]! + prixAcces(g.km, 'tc'),
        depart: h.stations[d.depart[g.gare]!]!.nom,
        arrivee: h.stations[g.gare]!.nom,
      }
    }
  }
  return best
}

/** `gares` : gares proches du point, à passer quand elles sont déjà connues (cache par ville). */
export function versPointTc(
  h: Horaires,
  d: DepuisGares,
  ami: Ami,
  lat: number,
  lon: number,
  gares: Proche[] = garesProches(h.stations, lat, lon),
): TrajetTc | null {
  return meilleurVers(h, d, ami, haversineKm(ami.lat, ami.lon, lat, lon), gares)
}

export function coucheTc(grille: Grille, h: Horaires, d: DepuisGares, ami: Ami, grandeur: Grandeur): Float32Array {
  const sortie = new Float32Array(grille.nx * grille.ny).fill(Number.NaN)
  for (let k = 0; k < sortie.length; k++) {
    if (grille.dedans[k] !== 1) continue
    const lon = grille.lon0 + (k % grille.nx) * grille.pasLon
    const lat = grille.lat0 + Math.floor(k / grille.nx) * grille.pasLat
    const gares: Proche[] = []
    for (let v = 0; v < NB_VOISINS; v++) {
      const gare = h.voisins.gares[k * NB_VOISINS + v]!
      const kmGare = h.voisins.hectometres[k * NB_VOISINS + v]! / 10
      if (gare !== INJOIGNABLE && kmGare <= GARE_MAX_KM) gares.push({ gare, km: kmGare })
    }
    const t = meilleurVers(h, d, ami, haversineKm(ami.lat, ami.lon, lat, lon), gares)
    if (t) sortie[k] = grandeur === 'temps' ? t.minutes : t.euros
  }
  return sortie
}
