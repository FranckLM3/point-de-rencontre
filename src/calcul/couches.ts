import type { Horaires } from '../donnees/horaires'
import type { Ami, Etat } from '../types'
import { distancesOiseau } from './agregat'
import type { Grille } from './grille'
import { coucheTc, depuisGares, garesProches, versPointTc, type DepuisGares, type Proche } from './tc'
import { descriptionTrajet } from '../ui/format'
import { mesureOiseau, type Mesure } from './villes'

type Choix = Pick<Etat, 'mode' | 'grandeur'>

export const cleDepuis = (a: Ami): string => `${a.lat},${a.lon},${a.transport}`

export const cleCouche = (c: Choix, a: Ami, versionHoraires: number): string =>
  `${c.mode}|${c.grandeur}|${cleDepuis(a)}|${versionHoraires}`

/** Horaires chargés et calculs réutilisables entre deux rendus. */
export interface MoteurTc {
  horaires: Horaires
  version: number
  /** Charge les lignes des gares proches de chaque personne. */
  preparer(amis: Ami[]): Promise<void>
  depuis(a: Ami): DepuisGares
  /** Gares proches d'un point (ville, lieu testé), calculées une fois. */
  gares(lat: number, lon: number): Proche[]
}

export function creerMoteurTc(horaires: Horaires, version: number): MoteurTc {
  const depuis = new Map<string, DepuisGares>()
  const gares = new Map<string, Proche[]>()
  const garesDe = (lat: number, lon: number): Proche[] => {
    const cle = `${lat},${lon}`
    const connues = gares.get(cle)
    if (connues) return connues
    const calculees = garesProches(horaires.stations, lat, lon)
    gares.set(cle, calculees)
    return calculees
  }
  return {
    horaires,
    version,
    preparer: (amis) => horaires.lignes(amis.flatMap((a) => garesDe(a.lat, a.lon).map((g) => g.gare))),
    depuis: (a) => {
      const cle = cleDepuis(a)
      const connu = depuis.get(cle)
      if (connu) return connu
      const d = depuisGares(horaires, a)
      // Tant qu'une ligne manque, le résultat est incomplet : on ne le garde pas.
      if (d.proches.every((p) => horaires.ligne(p.gare) !== undefined)) depuis.set(cle, d)
      return d
    },
    gares: garesDe,
  }
}

export function choisirMesure(c: Choix, moteur: MoteurTc | null): Mesure {
  if (c.mode !== 'tc' || moteur === null) return mesureOiseau
  return (a, lat, lon) => {
    const t = versPointTc(moteur.horaires, moteur.depuis(a), a, lat, lon, moteur.gares(lat, lon))
    if (t === null) return null
    return {
      valeur: c.grandeur === 'temps' ? t.minutes : t.euros,
      precision: descriptionTrajet(t),
    }
  }
}

export interface Couches {
  /** Valeurs de la grille pour une personne ; recalculées seulement si la clé change. */
  obtenir(a: Ami, c: Choix, moteur: MoteurTc | null): Float32Array
}

export function creerCouches(grille: Grille): Couches {
  const memo = new Map<string, { cle: string; valeurs: Float32Array }>()
  const calculer = (a: Ami, c: Choix, moteur: MoteurTc | null): Float32Array => {
    if (c.mode === 'oiseau') return distancesOiseau(grille, a.lat, a.lon)
    if (c.mode !== 'tc' || moteur === null) throw new Error(`Pas de calcul disponible pour le mode ${c.mode}.`)
    return coucheTc(grille, moteur.horaires, moteur.depuis(a), a, c.grandeur)
  }
  return {
    obtenir: (a, c, moteur) => {
      // Le vol d'oiseau ne dépend pas de la grandeur : une seule place pour lui.
      const choix: Choix = c.mode === 'oiseau' ? { mode: 'oiseau', grandeur: 'temps' } : c
      const place = `${a.id}|${choix.mode}|${choix.grandeur}`
      const cle = cleCouche(choix, a, choix.mode === 'tc' ? (moteur?.version ?? 0) : 0)
      const connue = memo.get(place)
      if (connue?.cle === cle) return connue.valeurs
      const valeurs = calculer(a, choix, moteur)
      memo.set(place, { cle, valeurs })
      return valeurs
    },
  }
}

export interface ChargeurTc {
  /** Moteur déjà chargé, sinon null. */
  pret(): MoteurTc | null
  /** Charge les horaires une seule fois ; après un échec, l'appel suivant réessaie. */
  obtenir(): Promise<MoteurTc>
}

export function creerChargeurTc(creer: () => Promise<Horaires>): ChargeurTc {
  let moteur: MoteurTc | null = null
  let enCours: Promise<MoteurTc> | null = null
  let essais = 0
  return {
    pret: () => moteur,
    obtenir: () => {
      if (moteur) return Promise.resolve(moteur)
      enCours ??= creer().then(
        (h) => {
          moteur = creerMoteurTc(h, ++essais)
          return moteur
        },
        (e: unknown) => {
          essais++
          enCours = null
          throw e
        },
      )
      return enCours
    },
  }
}
