import type { Couche } from '../calcul/voiture'
import { supabase } from './supabase'

const COUCHE_VOITURE = 'voiture'
const COLONNES = 'ami_id, minutes, km'

interface CoucheBrute {
  ami_id: string
  minutes: string
  km: string
}

function decoderBytea(hex: string): Uint8Array {
  if (!hex.startsWith('\\x')) throw new Error('bytea invalide : doit commencer par \\x.')
  const corps = hex.slice(2)
  const octets = new Uint8Array(corps.length / 2)
  for (let i = 0; i < octets.length; i++) octets[i] = parseInt(corps.slice(i * 2, i * 2 + 2), 16)
  return octets
}

function decoderUint16(octets: Uint8Array): Uint16Array {
  const vue = new DataView(octets.buffer, octets.byteOffset, octets.byteLength)
  const sortie = new Uint16Array(octets.length / 2)
  for (let i = 0; i < sortie.length; i++) sortie[i] = vue.getUint16(i * 2, true)
  return sortie
}

/** Décode une couche stockée en bytea (format hexadécimal `\x...` rendu par PostgREST). */
export function decoderCouche(brut: { minutes: string; km: string }): Couche {
  return { minutes: decoderUint16(decoderBytea(brut.minutes)), km: decoderUint16(decoderBytea(brut.km)) }
}

/** Couches voiture déjà calculées pour les personnes demandées (absente = pas encore calculée). */
export async function chargerCouches(amiIds: string[]): Promise<Map<string, Couche>> {
  if (amiIds.length === 0) return new Map()
  const { data, error } = await supabase().from('temps').select(COLONNES).eq('couche', COUCHE_VOITURE).in('ami_id', amiIds)
  if (error) {
    console.error('Erreur Supabase (de charger les temps en voiture) :', error)
    throw new Error('Impossible de charger les temps en voiture.')
  }
  const sortie = new Map<string, Couche>()
  for (const ligne of (data ?? []) as CoucheBrute[]) sortie.set(ligne.ami_id, decoderCouche(ligne))
  return sortie
}

export interface FileCalculVoiture {
  /** Demande le calcul de la couche voiture d'une personne ; ignoré si déjà en cours ou en attente. */
  demander(amiId: string): Promise<void>
  /** Vrai si cette personne est en cours de calcul ou en attente dans la file. */
  enCours(amiId: string): boolean
}

export interface RappelsFileCalculVoiture {
  /** Message français rendu par la fonction (quota dépassé, etc.), à afficher dans un bandeau. */
  onErreur?: (message: string) => void
  /** Un calcul vient de se terminer (succès ou échec) : l'appelant peut relire les couches. */
  onTermine?: (amiId: string) => void
}

const MESSAGE_ERREUR_DEFAUT = 'Impossible de calculer ce trajet en voiture pour le moment.'

/**
 * File d'un seul appel à la fois à la fonction Edge `voiture` : elle interroge la matrice
 * OpenRouteService, coûteuse en quota, donc jamais deux calculs en parallèle.
 */
export function creerFileCalculVoiture(rappels: RappelsFileCalculVoiture = {}): FileCalculVoiture {
  const enTraitement = new Set<string>()
  const attente: string[] = []
  let actif = false

  const traiterSuivant = (): void => {
    if (actif) return
    const amiId = attente.shift()
    if (amiId === undefined) return
    actif = true
    supabase()
      .functions.invoke('voiture', { body: { ami_id: amiId } })
      .then(({ error }: { error: unknown }) => {
        if (error) {
          console.error(`Erreur fonction voiture (ami ${amiId}) :`, error)
          rappels.onErreur?.((error as { message?: string }).message ?? MESSAGE_ERREUR_DEFAUT)
        }
      })
      .catch((e: unknown) => {
        console.error(`Erreur fonction voiture (ami ${amiId}) :`, e)
        rappels.onErreur?.(MESSAGE_ERREUR_DEFAUT)
      })
      .finally(() => {
        enTraitement.delete(amiId)
        actif = false
        rappels.onTermine?.(amiId)
        traiterSuivant()
      })
  }

  return {
    demander: (amiId) => {
      if (enTraitement.has(amiId) || attente.includes(amiId)) return Promise.resolve()
      enTraitement.add(amiId)
      attente.push(amiId)
      traiterSuivant()
      return Promise.resolve()
    },
    enCours: (amiId) => enTraitement.has(amiId),
  }
}

// --- Itinéraire routier réel (fonction Edge `voiture`, action 'itineraire') ---------------------

export interface PointRoute {
  lat: number
  lon: number
}

export interface Itineraire {
  /** [lat, lon] du tracé, dans l'ordre du départ vers l'arrivée (rendu par l'edge function en [lon, lat]). */
  coordonnees: [number, number][]
  minutes: number
  km: number
}

interface ReponseItineraire {
  coordonnees: [number, number][]
  minutes: number
  km: number
}

const ARRONDI_CLE = 1e5
const arrondirCle = (x: number): number => Math.round(x * ARRONDI_CLE) / ARRONDI_CLE
const cleItineraire = (depart: PointRoute, arrivee: PointRoute): string =>
  `${arrondirCle(depart.lat)},${arrondirCle(depart.lon)}|${arrondirCle(arrivee.lat)},${arrondirCle(arrivee.lon)}`

/**
 * Itinéraires routiers réels (ORS Directions, via la fonction Edge), mis en cache pour la durée de
 * la session (par couple départ/arrivée arrondi) : un seul appel réseau par trajet, jamais rejoué au
 * fil des rendus. Tant qu'un trajet n'est pas en cache (jamais demandé, en cours, ou en échec), la
 * ligne droite pointillée habituelle reste affichée (src/calcul/trace.ts).
 */
export interface Itineraires {
  /** Itinéraire déjà en cache, sinon null (jamais demandé, en cours de calcul, ou échec). */
  regarder(depart: PointRoute, arrivee: PointRoute): Itineraire | null
  /** Déclenche la demande si elle n'a pas déjà été faite (idempotent) ; `surTermine` est appelé une
   * fois le résultat (succès ou échec) en cache, pour que l'appelant puisse redessiner. */
  demander(depart: PointRoute, arrivee: PointRoute, surTermine: () => void): void
}

export function creerItineraires(): Itineraires {
  const cache = new Map<string, Itineraire | null>()
  const enCours = new Set<string>()
  return {
    regarder: (depart, arrivee) => cache.get(cleItineraire(depart, arrivee)) ?? null,
    demander: (depart, arrivee, surTermine) => {
      const cle = cleItineraire(depart, arrivee)
      if (cache.has(cle) || enCours.has(cle)) return
      enCours.add(cle)
      supabase()
        .functions.invoke('voiture', {
          body: { action: 'itineraire', depart: [depart.lon, depart.lat], arrivee: [arrivee.lon, arrivee.lat] },
        })
        .then(({ data, error }: { data: ReponseItineraire | null; error: unknown }) => {
          cache.set(cle, error || !data ? null : { coordonnees: data.coordonnees, minutes: data.minutes, km: data.km })
        })
        .catch((e: unknown) => {
          console.error('Itinéraire voiture :', e)
          cache.set(cle, null)
        })
        .finally(() => {
          enCours.delete(cle)
          surTermine()
        })
    },
  }
}
