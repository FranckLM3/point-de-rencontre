import type { Station } from '../donnees/horaires'
import type { ReseauUrbain } from '../donnees/urbain'
import type { Ami } from '../types'
import { haversineKm } from './geo'
import { arretsProches, meilleurUrbain, reseauDe, type Arret } from './urbain'

/**
 * Étapes hors train : rejoindre la gare, la quitter, ou tout le trajet sans train.
 * À pied jusqu'à 1,5 km ; dans un réseau urbain (métro, RER, tram), par ce réseau ; ailleurs, en
 * voiture. Qui se déplace en voiture prend sa voiture au-delà de la marche, réseau ou pas.
 */
const DETOUR = 1.3
const MARCHE_MAX_KM = 1.5
const VITESSE = { marche: 4.5, transports: 20, voiture: 40 } as const
/** Au-delà, pas de trajet direct sans train (la voiture seule relève du mode Voiture). */
const DIRECT_MAX_KM = 30
/** Passer du quai du métro ou du RER au quai du train, dans la même gare. */
const CORRESPONDANCE_GARE_MIN = 5
/** Un ticket par trajet urbain (estimations 2026) ; `navigo` le rend gratuit en Île-de-France. */
const TICKET: Record<string, number> = { idf: 2.5, lyon: 2.1, marseille: 2 }
const TICKET_DEFAUT = 2

/** Partie d'une étape faite dans un réseau urbain : stations de montée et de descente. */
export interface TronconUrbain {
  reseau: ReseauUrbain
  de: number
  vers: number
}

export interface Segment {
  minutes: number
  mode: 'à pied' | 'transports' | 'voiture'
  /** Présent quand l'étape passe par le métro, le RER ou le tram (tracé arrêt par arrêt). */
  urbain?: TronconUrbain
}

export interface Etape {
  segment: Segment
  euros: number
}

/** Un bout de trajet (domicile ou lieu visé) : son réseau urbain et ses stations proches. */
export interface Bout {
  lat: number
  lon: number
  reseau: ReseauUrbain | null
  arrets: Arret[]
}

export function bout(reseaux: ReseauUrbain[] | undefined, lat: number, lon: number): Bout {
  const reseau = reseauDe(reseaux, lat, lon)
  return { lat, lon, reseau, arrets: reseau ? arretsProches(reseau, lat, lon) : [] }
}

const minutesA = (km: number, vitesse: number): number => ((km * DETOUR) / vitesse) * 60

const ticket = (r: ReseauUrbain, ami: Ami): number => (r.id === 'idf' && ami.navigo ? 0 : (TICKET[r.id] ?? TICKET_DEFAUT))

const aPied = (km: number): Etape => ({ segment: { minutes: minutesA(km, VITESSE.marche), mode: 'à pied' }, euros: 0 })
const enVoiture = (km: number): Etape => ({ segment: { minutes: minutesA(km, VITESSE.voiture), mode: 'voiture' }, euros: 0 })
const enTransports = (minutes: number, r: ReseauUrbain, ami: Ami, urbain?: TronconUrbain): Etape => ({
  segment: urbain ? { minutes, mode: 'transports', urbain } : { minutes, mode: 'transports' },
  euros: ticket(r, ami),
})
const plusCourte = (a: Etape, b: Etape | null): Etape => (b && b.segment.minutes < a.segment.minutes ? b : a)

const rattachements = new WeakMap<ReseauUrbain, Map<number, number>>()
/** Station urbaine rattachée à une gare SNCF (même gare), ou undefined. */
function stationDeGare(r: ReseauUrbain, gare: number): number | undefined {
  let m = rattachements.get(r)
  if (!m) {
    m = new Map(r.gares.map((g) => [g.gare, g.station]))
    rattachements.set(r, m)
  }
  return m.get(gare)
}

/** Gares SNCF du réseau d'un bout (départs ou arrivées possibles en plus des gares proches). */
export const garesDuReseau = (b: Bout): number[] => (b.reseau ? b.reseau.gares.map((g) => g.gare) : [])

/**
 * Étape entre un bout et une gare SNCF : `sens` 'acces' va du bout à la gare, 'sortie' de la gare
 * au bout (la matrice urbaine n'est pas symétrique).
 */
export function etapeGare(b: Bout, gare: Station, indiceGare: number, ami: Ami, sens: 'acces' | 'sortie'): Etape {
  const km = haversineKm(b.lat, b.lon, gare.lat, gare.lon)
  const marche = km <= MARCHE_MAX_KM ? aPied(km) : null
  if (ami.transport === 'voiture' || !b.reseau) return marche ?? enVoiture(km)
  const station = stationDeGare(b.reseau, indiceGare)
  if (station === undefined) {
    // Gare du réseau sans station urbaine voisine : bus, non modélisés, estimés à 20 km/h.
    return marche ?? enTransports(minutesA(km, VITESSE.transports), b.reseau, ami)
  }
  const quai = [{ station, minutes: 0 }]
  const u = sens === 'acces' ? meilleurUrbain(b.reseau, b.arrets, quai) : meilleurUrbain(b.reseau, quai, b.arrets)
  const parReseau = u ? enTransports(u.minutes + CORRESPONDANCE_GARE_MIN, b.reseau, ami, { reseau: b.reseau, de: u.de, vers: u.vers }) : null
  if (marche) return plusCourte(marche, parReseau)
  return parReseau ?? enTransports(minutesA(km, VITESSE.transports), b.reseau, ami)
}

/** Tout le trajet sans train, ou null au-delà de 30 km hors d'un même réseau. */
export function etapeDirecte(depuis: Bout, vers: Bout, ami: Ami): Etape | null {
  const km = haversineKm(depuis.lat, depuis.lon, vers.lat, vers.lon)
  const marche = km <= MARCHE_MAX_KM ? aPied(km) : null
  const memeReseau = depuis.reseau !== null && depuis.reseau === vers.reseau && ami.transport !== 'voiture'
  if (memeReseau) {
    const r = depuis.reseau!
    const u = meilleurUrbain(r, depuis.arrets, vers.arrets)
    const parReseau = u ? enTransports(u.minutes, r, ami, { reseau: r, de: u.de, vers: u.vers }) : null
    if (marche) return plusCourte(marche, parReseau)
    if (parReseau) return parReseau
  }
  if (km > DIRECT_MAX_KM) return null
  return marche ?? enVoiture(km)
}
