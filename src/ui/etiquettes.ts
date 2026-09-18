import type { Unite } from '../calcul/unites'
import type { VilleClassee } from '../calcul/villes'
import type { Critere } from '../types'
import { valeur } from './format'

export interface EtiquetteVille {
  ville: VilleClassee
  /** Vrai pour la toute première ville classée : bordure d'accent sur l'étiquette. */
  meilleure: boolean
  /** Valeur du critère actif, déjà mise en forme (ex. « 2 h 19 ») ; remplie après la sélection. */
  valeurAffichee?: string
  /** Ligne de prix (mode transports seulement), ex. « ≈ 38 € ». */
  prix?: string
}

/** Valeur du critère actif, mise en forme pour une étiquette. */
export function valeurEtiquette(c: VilleClassee, critere: Critere, unite: Unite): string {
  return valeur(critere === 'pire' ? c.pire : c.moyenne, unite)
}

/** Ligne de prix approchée (mode transports) : « ≈ 38 € ». */
export function prixEtiquette(c: VilleClassee, critere: Critere): string {
  return `≈ ${valeur(critere === 'pire' ? c.pire : c.moyenne, 'eur')}`
}

/**
 * Étiquettes affichées sur la carte : les villes classées d'abord (déjà triées, meilleure en tête),
 * puis les grandes villes fournies en renfort (déjà triées par population décroissante par l'appelant),
 * pour couvrir le territoire même là où personne n'est classé. Sans doublon, bornée à `max`.
 */
export function selectionEtiquettes(classees: VilleClassee[], grandesVilles: VilleClassee[], max: number): EtiquetteVille[] {
  const dejaVues = new Set<string>()
  const resultat: EtiquetteVille[] = []
  const ajouter = (c: VilleClassee): void => {
    if (resultat.length >= max || dejaVues.has(c.ville.nom)) return
    dejaVues.add(c.ville.nom)
    resultat.push({ ville: c, meilleure: c === classees[0] })
  }
  for (const c of classees) ajouter(c)
  for (const c of grandesVilles) ajouter(c)
  return resultat
}

export interface BoiteEtiquette {
  id: string
  x: number
  y: number
  largeur: number
  hauteur: number
}

const chevauchent = (a: BoiteEtiquette, b: BoiteEtiquette): boolean =>
  a.x < b.x + b.largeur && a.x + a.largeur > b.x && a.y < b.y + b.hauteur && a.y + a.hauteur > b.y

/**
 * Évitement glouton des collisions en espace écran : les boîtes sont prises dans l'ordre fourni
 * (les mieux classées d'abord), une boîte qui chevauche une boîte déjà retenue est écartée.
 */
export function eviterCollisions(boites: BoiteEtiquette[]): BoiteEtiquette[] {
  const retenues: BoiteEtiquette[] = []
  for (const b of boites) {
    if (!retenues.some((r) => chevauchent(r, b))) retenues.push(b)
  }
  return retenues
}
