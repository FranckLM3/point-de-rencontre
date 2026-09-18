import type { Horaires } from '../donnees/horaires'
import type { Ami, Etat } from '../types'
import { distancesOiseau } from './agregat'
import type { Grille } from './grille'
import { coucheTc, depuisGares, garesProches, versPointTc, type DepuisGares, type Proche } from './tc'
import { descriptionTrajet, descriptionVoiture } from '../ui/format'
import { coucheVoiture, indexPointsFrance, prixVoiture, valeurVoiture, type Couche, type ParametresPrix } from './voiture'
import { mesureOiseau, type Mesure } from './villes'

type Choix = Pick<Etat, 'mode' | 'grandeur'>

export const cleDepuis = (a: Ami): string => `${a.lat},${a.lon},${a.transport}`

/** `voiture` et `mixte` dépendent aussi de la version des couches voiture chargées et du réglage
 * « personnes par voiture » (le prix en dépend) ; les autres modes gardent leur clé d'origine. */
export const cleCouche = (c: Choix, a: Ami, versionHoraires: number, versionVoiture = 0, personnesParVoiture = 0): string => {
  const base = `${c.mode}|${c.grandeur}|${cleDepuis(a)}|${versionHoraires}`
  return c.mode === 'voiture' || c.mode === 'mixte' ? `${base}|${versionVoiture}|${personnesParVoiture}` : base
}

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

/** Couches voiture chargées et réglages de prix, pour le mode voiture et le volet voiture de mixte. */
export interface MoteurVoiture {
  grille8: Grille
  index8: Int32Array
  parametres: ParametresPrix
  /** Augmente à chaque nouveau chargement des couches (E4) : périme le cache de `creerCouches`. */
  version: number
  /** `undefined` : couche pas encore calculée pour cette personne (« calcul en cours »). */
  couche(amiId: string): Couche | undefined
}

export function creerMoteurVoiture(grille8: Grille, parametres: ParametresPrix, couches: Map<string, Couche>, version = 0): MoteurVoiture {
  return { grille8, index8: indexPointsFrance(grille8), parametres, version, couche: (id) => couches.get(id) }
}

function mesureTcPersonne(moteur: MoteurTc, grandeur: Choix['grandeur']): Mesure {
  return (a, lat, lon) => {
    const t = versPointTc(moteur.horaires, moteur.depuis(a), a, lat, lon, moteur.gares(lat, lon))
    if (t === null) return null
    return { valeur: grandeur === 'temps' ? t.minutes : t.euros, precision: descriptionTrajet(t) }
  }
}

function mesureVoiturePersonne(moteur: MoteurVoiture, grandeur: Choix['grandeur']): Mesure {
  return (a, lat, lon) => {
    const couche = moteur.couche(a.id)
    if (!couche) return null
    const v = valeurVoiture(moteur.grille8, moteur.index8, couche, lon, lat)
    if (!v) return null
    return { valeur: grandeur === 'temps' ? v.minutes : prixVoiture(v.km, moteur.parametres), precision: descriptionVoiture(v, moteur.parametres) }
  }
}

/**
 * Mesure d'un point vers chaque personne, selon le mode. En mixte, chaque personne utilise son
 * propre moyen (voiture si `transport === 'voiture'`, transports sinon) ; tant que sa couche
 * voiture n'est pas prête, elle est mesurée en transports le temps du calcul (décision 2), ou à
 * vol d'oiseau si les transports non plus ne sont pas disponibles (décision 1).
 */
export function choisirMesure(c: Choix, moteurTc: MoteurTc | null, moteurVoiture: MoteurVoiture | null = null): Mesure {
  if (c.mode === 'tc') return moteurTc ? mesureTcPersonne(moteurTc, c.grandeur) : mesureOiseau
  if (c.mode === 'voiture') return moteurVoiture ? mesureVoiturePersonne(moteurVoiture, c.grandeur) : mesureOiseau
  if (c.mode === 'mixte') {
    const mesureVoit = moteurVoiture ? mesureVoiturePersonne(moteurVoiture, c.grandeur) : null
    const mesureTr = moteurTc ? mesureTcPersonne(moteurTc, c.grandeur) : mesureOiseau
    return (a, lat, lon) => {
      if (a.transport === 'voiture') return mesureVoit?.(a, lat, lon) ?? mesureTr(a, lat, lon)
      return mesureTr(a, lat, lon)
    }
  }
  return mesureOiseau
}

export interface Couches {
  /**
   * Valeurs de la grille pour une personne ; recalculées seulement si la clé change. `null` :
   * pas encore calculable (couche voiture pas encore prête en mode voiture, décision du plan :
   * cette personne est alors exclue des zones/du repaire pour ce rendu, avec un bandeau).
   */
  obtenir(a: Ami, c: Choix, moteurTc: MoteurTc | null, moteurVoiture?: MoteurVoiture | null): Float32Array | null
}

function coucheVoiturePersonne(grille: Grille, moteur: MoteurVoiture, a: Ami, grandeur: Choix['grandeur']): Float32Array | null {
  const couche = moteur.couche(a.id)
  if (!couche) return null
  return coucheVoiture(grille, moteur.grille8, moteur.index8, couche, grandeur, moteur.parametres)
}

export function creerCouches(grille: Grille): Couches {
  const memo = new Map<string, { cle: string; valeurs: Float32Array | null }>()
  const calculer = (a: Ami, c: Choix, moteurTc: MoteurTc | null, moteurVoiture: MoteurVoiture | null): Float32Array | null => {
    if (c.mode === 'oiseau') return distancesOiseau(grille, a.lat, a.lon)
    if (c.mode === 'voiture') {
      if (!moteurVoiture) throw new Error('Pas de calcul disponible pour le mode voiture.')
      return coucheVoiturePersonne(grille, moteurVoiture, a, c.grandeur)
    }
    if (c.mode === 'mixte') {
      if (a.transport === 'voiture') {
        const enVoiture = moteurVoiture ? coucheVoiturePersonne(grille, moteurVoiture, a, c.grandeur) : null
        if (enVoiture) return enVoiture
        // Le temps que sa couche voiture soit prête, cette personne est mesurée en transports (décision 2).
        if (moteurTc) return coucheTc(grille, moteurTc.horaires, moteurTc.depuis(a), a, c.grandeur)
        return null
      }
      if (!moteurTc) return null
      return coucheTc(grille, moteurTc.horaires, moteurTc.depuis(a), a, c.grandeur)
    }
    if (moteurTc === null) throw new Error(`Pas de calcul disponible pour le mode ${c.mode}.`)
    return coucheTc(grille, moteurTc.horaires, moteurTc.depuis(a), a, c.grandeur)
  }
  return {
    obtenir: (a, c, moteurTc, moteurVoiture = null) => {
      // Le vol d'oiseau ne dépend pas de la grandeur : une seule place pour lui.
      const choix: Choix = c.mode === 'oiseau' ? { mode: 'oiseau', grandeur: 'temps' } : c
      const place = `${a.id}|${choix.mode}|${choix.grandeur}`
      const versionVoiture = moteurVoiture?.version ?? 0
      const personnesParVoiture = moteurVoiture?.parametres.personnesParVoiture ?? 0
      // En mixte, une personne « voiture » peut retomber sur les transports tant que sa couche
      // n'est pas prête : la présence/version du moteur transports fait donc aussi partie de la clé.
      const versionHoraires = choix.mode === 'tc' || choix.mode === 'mixte' ? (moteurTc?.version ?? 0) : 0
      const cle = cleCouche(choix, a, versionHoraires, versionVoiture, personnesParVoiture)
      const connue = memo.get(place)
      if (connue?.cle === cle) return connue.valeurs
      const valeurs = calculer(a, choix, moteurTc, moteurVoiture)
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
