import type { Segment, TrajetTc } from '../calcul/tc'
import type { Unite } from '../calcul/unites'
import { prixVoiture, type ParametresPrix, type ValeurVoiture } from '../calcul/voiture'
import type { Critere, Mode, Transport } from '../types'

export const km = (valeur: number): string => `${Math.round(valeur)} km`

export function duree(minutes: number): string {
  const total = Math.round(minutes)
  if (total < 60) return `${total} min`
  const h = Math.floor(total / 60)
  const m = total % 60
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`
}

export const euros = (v: number): string => `${Math.round(v)} €`

export function valeur(v: number, unite: Unite): string {
  if (unite === 'min') return duree(v)
  if (unite === 'eur') return euros(v)
  return km(v)
}

/** « Paris Gare de Lyon Hall 1 - 2 » devient « Paris Gare de Lyon » ; les autres noms sont gardés tels quels. */
export const nomCourt = (nom: string): string => nom.replace(/ Hall \d+( - \d+)?$/, '').trim()

/** Une étape enchaînée : « 8 min en transports ». */
export const SUITE: Record<Segment['mode'], (d: string) => string> = {
  'à pied': (d) => `${d} à pied`,
  transports: (d) => `${d} en transports`,
  voiture: (d) => `${d} de voiture`,
}

/** Le trajet entier, sans train : « 35 min en voiture ». */
const SEUL: Record<Segment['mode'], (d: string) => string> = {
  'à pied': (d) => `${d} à pied`,
  transports: (d) => `${d} en transports`,
  voiture: (d) => `${d} en voiture`,
}

export const correspondances = (nombre: number): string =>
  `${nombre} correspondance${nombre > 1 ? 's' : ''}`

/** Étapes du trajet : accès, gares, correspondances, sortie. Une étape nulle n'est pas écrite. */
export function descriptionTrajet(t: TrajetTc): string {
  if (t.depart === null) return SEUL[t.acces.mode](duree(t.acces.minutes))
  const etapes: string[] = []
  if (Math.round(t.acces.minutes) > 0) etapes.push(SUITE[t.acces.mode](duree(t.acces.minutes)))
  etapes.push(`${nomCourt(t.depart)} → ${nomCourt(t.arrivee ?? '')}`)
  if (t.correspondances > 0) etapes.push(correspondances(t.correspondances))
  if (t.sortie && Math.round(t.sortie.minutes) > 0) etapes.push(SUITE[t.sortie.mode](duree(t.sortie.minutes)))
  return etapes.join(' · ')
}

export const libelleTransport = (t: Transport): string => (t === 'voiture' ? 'voiture' : 'transports')

/** Détail d'un trajet en voiture, quelle que soit la grandeur affichée : « 3 h 12 de route · 468 km · ≈ 71 € ». */
export function descriptionVoiture(v: ValeurVoiture, p: ParametresPrix): string {
  return `${duree(v.minutes)} de route · ${km(v.km)} · ≈ ${euros(prixVoiture(v.km, p))}`
}

const LIBELLE_MODE: Record<Mode, string> = {
  oiseau: 'à vol d’oiseau',
  tc: 'en transports',
  voiture: 'en voiture',
  mixte: 'chacun avec son moyen',
}

export interface OptionsTitre {
  mode: Mode
  unite: Unite
  critere: Critere
  max: number | null
}

/** Titre principal, court : juste le nombre de Crocos. Le reste va dans `sousTitre`. */
export function titreCourt(nombre: number): string {
  return `Où se retrouver entre ${nombre} Croco${nombre > 1 ? 's' : ''}`
}

const majuscule = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)

function phraseCritere(o: OptionsTitre): string {
  if (o.unite === 'eur') return o.critere === 'pire' ? 'sans billet trop cher pour personne' : 'au moins cher en moyenne'
  return o.critere === 'pire' ? 'au pire trajet le plus court' : 'au plus court en moyenne'
}

/** Sous-titre sous le h1 : mode, critère, et maximum s'il y en a un (toujours sur le pire trajet, décision 4). */
export function sousTitre(o: OptionsTitre): string {
  const debut = `${majuscule(LIBELLE_MODE[o.mode])}, ${phraseCritere(o)}`
  return o.max !== null ? `${debut}, sans que personne ne dépasse ${valeur(o.max, o.unite)}` : debut
}

/** Échappe le texte avant insertion dans le HTML. */
export function echapper(texte: string): string {
  return texte.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}
