import { INJOIGNABLE_URBAIN, type ReseauUrbain } from '../donnees/urbain'
import { haversineKm } from './geo'

/** À pied jusqu'à une station (détour 1,3, 4,5 km/h), au plus 1,5 km. */
const MARCHE_MAX_KM = 1.5
/** Au-delà de la marche, une station se rejoint « en transports » (bus, non modélisés) jusqu'à 5 km. */
export const RESEAU_MAX_KM = 5
const DETOUR = 1.3
const VITESSE = { marche: 4.5, transports: 20 } as const
const NB_A_PIED = 6
const NB_EN_TRANSPORTS = 3
const PAS_INDEX = 0.05

/** Une station du réseau et le temps pour la rejoindre depuis un point (ou pour aller vers ce point). */
export interface Arret {
  station: number
  minutes: number
}

const minutesA = (km: number, vitesse: number): number => ((km * DETOUR) / vitesse) * 60

type Index = Map<string, number[]>
const index = new WeakMap<ReseauUrbain, Index>()
const cleCase = (lat: number, lon: number): string => `${Math.floor(lat / PAS_INDEX)},${Math.floor(lon / PAS_INDEX)}`

function indexDe(r: ReseauUrbain): Index {
  const connu = index.get(r)
  if (connu) return connu
  const cases: Index = new Map()
  r.stations.forEach((s, i) => {
    const cle = cleCase(s.lat, s.lon)
    cases.set(cle, [...(cases.get(cle) ?? []), i])
  })
  index.set(r, cases)
  return cases
}

/** Stations à `maxKm` au plus (cases voisines de l'index : 0,05° couvre au moins 3,5 km), la plus proche d'abord. */
function stationsA(r: ReseauUrbain, lat: number, lon: number, maxKm: number): { station: number; km: number }[] {
  const cases = indexDe(r)
  const portee = Math.ceil(maxKm / 3.5)
  const i0 = Math.floor(lat / PAS_INDEX)
  const j0 = Math.floor(lon / PAS_INDEX)
  const trouvees: { station: number; km: number }[] = []
  for (let di = -portee; di <= portee; di++) {
    for (let dj = -portee; dj <= portee; dj++) {
      for (const station of cases.get(`${i0 + di},${j0 + dj}`) ?? []) {
        const s = r.stations[station]!
        const km = haversineKm(lat, lon, s.lat, s.lon)
        if (km <= maxKm) trouvees.push({ station, km })
      }
    }
  }
  return trouvees.sort((a, b) => a.km - b.km)
}

/** Réseau urbain d'un point : le premier dont une station est à 5 km au plus. */
export function reseauDe(reseaux: ReseauUrbain[] | undefined, lat: number, lon: number): ReseauUrbain | null {
  return reseaux?.find((r) => stationsA(r, lat, lon, RESEAU_MAX_KM).length > 0) ?? null
}

/** Les 6 stations les plus proches à pied (1,5 km), sinon les 3 plus proches en transports (5 km). */
export function arretsProches(r: ReseauUrbain, lat: number, lon: number): Arret[] {
  const proches = stationsA(r, lat, lon, RESEAU_MAX_KM)
  const aPied = proches.filter((p) => p.km <= MARCHE_MAX_KM).slice(0, NB_A_PIED)
  if (aPied.length > 0) return aPied.map((p) => ({ station: p.station, minutes: minutesA(p.km, VITESSE.marche) }))
  return proches.slice(0, NB_EN_TRANSPORTS).map((p) => ({ station: p.station, minutes: minutesA(p.km, VITESSE.transports) }))
}

/** Trajet le plus court de `depuis` vers `vers` par le réseau : durée (accès + trajet + sortie) et
 * stations où l'on monte (`de`) et descend (`vers`) ; null si aucun. */
export function meilleurUrbain(r: ReseauUrbain, depuis: Arret[], vers: Arret[]): { minutes: number; de: number; vers: number } | null {
  const n = r.stations.length
  let meilleur: { minutes: number; de: number; vers: number } | null = null
  for (const a of depuis) {
    for (const b of vers) {
      const m = r.minutes[a.station * n + b.station]!
      if (m === INJOIGNABLE_URBAIN) continue
      const minutes = a.minutes + m + b.minutes
      if (!meilleur || minutes < meilleur.minutes) meilleur = { minutes, de: a.station, vers: b.station }
    }
  }
  return meilleur
}

/** Durée la plus courte de `depuis` vers `vers` par le réseau, l'infini si aucun trajet. */
export const dureeUrbaine = (r: ReseauUrbain, depuis: Arret[], vers: Arret[]): number =>
  meilleurUrbain(r, depuis, vers)?.minutes ?? Number.POSITIVE_INFINITY
