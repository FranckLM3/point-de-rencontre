import type { Horaires, Ligne, Station } from '../donnees/horaires'
import { INJOIGNABLE, NB_VOISINS } from '../donnees/horaires'
import type { Ami, Grandeur } from '../types'
import { haversineKm } from './geo'
import { bout, etapeDirecte, etapeGare, garesDuReseau, type Bout, type Etape, type Segment } from './etapes'
import type { Grille } from './grille'

const PRIX_MIN_TRAIN = 5
const TAUX_GRANDE_LIGNE = 0.1
const TAUX_REGIONAL = 0.12
/** Deux gares plus proches que cela comptent pour une seule (même règle que `_distincte` dans
 * horaires/sortie.py, qui construit l'index de gares voisines de la grille : les deux doivent
 * rester cohérents, sous peine d'écarts entre les zones/le repaire (grille) et les villes/lieux
 * (calcul point à point) comme observé pour Lyon Part Dieu / Lyon-Part-Dieu Gare Routière). */
const ECART_MIN_KM = 0.5
/** Au-delà, une gare ne sert ni au départ ni à l'arrivée (la Corse n'a pas de train dans ces données). */
export const GARE_MAX_KM = 50

const distanceGare = (lat: number, lon: number, s: Station): number => {
  if (!s.desservie) return Number.POSITIVE_INFINITY
  const km = haversineKm(lat, lon, s.lat, s.lon)
  return km <= GARE_MAX_KM ? km : Number.POSITIVE_INFINITY
}

export type { Segment }

export function prixTrain(km: number, grandeLigne: boolean): number {
  if (km <= 0) return 0
  return Math.max(PRIX_MIN_TRAIN, km * (grandeLigne ? TAUX_GRANDE_LIGNE : TAUX_REGIONAL))
}

export interface Proche {
  gare: number
  km: number
}

/**
 * Deux gares à moins de 500 m comptent pour une, sauf une gare et une gare routière voisines
 * (E7) : gardées toutes les deux, pour que le classement de `meilleurVers` puisse choisir entre
 * elles plutôt que de perdre la gare de train au tri par seule proximité.
 */
const tropPres = (stations: Station[], s: Station, retenues: Proche[]): boolean =>
  retenues.some(
    (r) => stations[r.gare]!.train === s.train && haversineKm(s.lat, s.lon, stations[r.gare]!.lat, stations[r.gare]!.lon) <= ECART_MIN_KM,
  )

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
  /** Nombre de changements de train jusqu'à chaque gare. */
  correspondances: Uint8Array
  /** Gares de départ envisagées, et l'étape pour les rejoindre. */
  departs: Depart[]
  /** Le domicile : réseau urbain et stations proches, pour les trajets sans train. */
  domicile: Bout
}

export interface Depart {
  gare: number
  etape: Etape
}

/** Une gare du réseau urbain plus longue à rejoindre que la meilleure de plus que cela n'est pas envisagée. */
const ECART_DEPART_MAX_MIN = 45

/**
 * Gares de départ : les 3 plus proches, plus, dans un réseau urbain, ses gares SNCF (toutes les
 * gares parisiennes pour un Parisien) à 45 min au plus de la mieux placée.
 */
export function departsPossibles(h: Horaires, ami: Ami): { domicile: Bout; departs: Depart[] } {
  const domicile = bout(h.reseaux, ami.lat, ami.lon)
  const proches = garesProches(h.stations, ami.lat, ami.lon).map((p) => p.gare)
  const indices = [...new Set([...proches, ...garesDuReseau(domicile)])]
  const tous = indices.map((gare) => ({ gare, etape: etapeGare(domicile, h.stations[gare]!, gare, ami, 'acces') }))
  const meilleure = Math.min(...tous.map((t) => t.etape.segment.minutes))
  const departs = tous.filter((t) => proches.includes(t.gare) || t.etape.segment.minutes <= meilleure + ECART_DEPART_MAX_MIN)
  return { domicile, departs }
}

export function depuisGares(h: Horaires, ami: Ami): DepuisGares {
  const n = h.stations.length
  const { domicile, departs } = departsPossibles(h, ami)
  const r: DepuisGares = {
    minutes: new Float32Array(n).fill(Number.POSITIVE_INFINITY),
    euros: new Float32Array(n).fill(Number.NaN),
    depart: new Int32Array(n).fill(-1),
    correspondances: new Uint8Array(n),
    departs,
    domicile,
  }
  for (const p of departs) {
    const ligne = h.ligne(p.gare)
    if (!ligne) continue
    const avant = p.etape.segment.minutes
    for (let g = 0; g < n; g++) {
      const m = ligne.minutes[g]!
      if (m === INJOIGNABLE) continue
      const total = avant + m
      if (total < r.minutes[g]!) {
        r.minutes[g] = total
        r.euros[g] = p.etape.euros + prixTrain(ligne.km[g]!, ligne.grandeLigne[g] === 1)
        r.depart[g] = p.gare
        r.correspondances[g] = ligne.correspondances[g]!
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
  /** Indices des gares (pour retracer le chemin réel sur la carte), null pour un trajet direct sans train. */
  departIndice: number | null
  arriveeIndice: number | null
  /** Rejoindre la gare de départ ; le trajet entier s'il n'y a pas de train. */
  acces: Segment
  /** Quitter la gare d'arrivée ; null si le lieu est la gare même ou s'il n'y a pas de train. */
  sortie: Segment | null
  correspondances: number
}

/**
 * Pénalité au classement pour arriver dans une gare desservie seulement par autocar (E7) :
 * à temps égal ou proche, une vraie gare est préférée. `train` absent (données anciennes) ne
 * pénalise pas : seul `false` (constaté) le fait. Le temps affiché reste le temps réel.
 */
const PENALITE_GARE_ROUTIERE_MIN = 10
const penaliteArrivee = (s: Station): number => (s.train === false ? PENALITE_GARE_ROUTIERE_MIN : 0)

function meilleurVers(h: Horaires, d: DepuisGares, ami: Ami, lat: number, lon: number, gares: Proche[]): TrajetTc | null {
  const lieu = bout(h.reseaux, lat, lon)
  // À l'arrivée, pas de voiture : qui est venu en train finit à pied ou en transports, sinon en taxi.
  const voyageur: Ami = { ...ami, transport: 'tc' }
  let best: TrajetTc | null = null
  let meilleurScore = Number.POSITIVE_INFINITY
  const direct = etapeDirecte(d.domicile, lieu, ami)
  if (direct) {
    best = {
      minutes: direct.segment.minutes,
      euros: direct.euros,
      depart: null,
      arrivee: null,
      departIndice: null,
      arriveeIndice: null,
      acces: direct.segment,
      sortie: null,
      correspondances: 0,
    }
    meilleurScore = best.minutes
  }
  const arrivees = [...new Set([...gares.map((g) => g.gare), ...garesDuReseau(lieu)])]
  for (const g of arrivees) {
    const avant = d.minutes[g]!
    if (!Number.isFinite(avant)) continue
    const gare = h.stations[g]!
    const sortie = etapeGare(lieu, gare, g, voyageur, 'sortie')
    const minutes = avant + sortie.segment.minutes
    const score = minutes + penaliteArrivee(gare)
    if (score < meilleurScore) {
      meilleurScore = score
      const gareDepart = d.depart[g]!
      best = {
        minutes,
        euros: d.euros[g]! + sortie.euros,
        depart: h.stations[gareDepart]!.nom,
        arrivee: gare.nom,
        departIndice: gareDepart,
        arriveeIndice: g,
        acces: d.departs.find((p) => p.gare === gareDepart)!.etape.segment,
        sortie: sortie.segment.minutes > 0 ? sortie.segment : null,
        correspondances: d.correspondances[g]!,
      }
    }
  }
  return best
}

/** Sécurité contre une chaîne `precedente` bouclée (donnée corrompue) : plus qu'assez pour un trajet réel. */
const CHEMIN_PAS_MAX = 400

/**
 * Remonte la gare précédente depuis `arrivee` jusqu'à `depart`, à partir de `ligne` (celle de la
 * gare de départ, déjà chargée). S'arrête à `depart`, sur une précédente injoignable (INJOIGNABLE :
 * donnée incohérente) ou après `CHEMIN_PAS_MAX` pas, et renvoie les indices de gares dans l'ordre
 * du trajet (le résultat peut alors ne pas remonter jusqu'à `depart`).
 */
export function cheminGares(ligne: Ligne, depart: number, arrivee: number): number[] {
  const chemin: number[] = [arrivee]
  let courante = arrivee
  for (let i = 0; i < CHEMIN_PAS_MAX && courante !== depart; i++) {
    const precedente = ligne.precedente[courante]
    if (precedente === undefined || precedente === INJOIGNABLE) break
    chemin.push(precedente)
    courante = precedente
  }
  return chemin.reverse()
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
  return meilleurVers(h, d, ami, lat, lon, gares)
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
    const t = meilleurVers(h, d, ami, lat, lon, gares)
    if (t) sortie[k] = grandeur === 'temps' ? t.minutes : t.euros
  }
  return sortie
}
