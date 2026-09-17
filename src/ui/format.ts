import type { Unite } from '../calcul/unites'
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

export const libelleTransport = (t: Transport): string => (t === 'voiture' ? 'voiture' : 'transports')

const LIBELLE_MODE: Record<Mode, string> = {
  oiseau: 'à vol d’oiseau',
  tc: 'en transports',
  voiture: 'en voiture',
  mixte: 'chacun avec son moyen',
}

export interface OptionsTitre {
  nombre: number
  mode: Mode
  unite: Unite
  critere: Critere
  max: number | null
}

export function titre(o: OptionsTitre): string {
  const debut = `Où se retrouver à ${o.nombre}, ${LIBELLE_MODE[o.mode]}`
  if (o.max !== null) return `${debut}, sans dépasser ${valeur(o.max, o.unite)}`
  if (o.unite === 'eur') {
    return o.critere === 'pire' ? `${debut}, sans billet trop cher pour personne` : `${debut}, au moins cher en moyenne`
  }
  return o.critere === 'pire' ? `${debut}, au pire trajet le plus court` : `${debut}, au plus court en moyenne`
}

/** Échappe le texte avant insertion dans le HTML. */
export function echapper(texte: string): string {
  return texte.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}
