import type { Critere, Transport } from '../types'

export const km = (valeur: number): string => `${Math.round(valeur)} km`

export const libelleTransport = (t: Transport): string => (t === 'voiture' ? 'voiture' : 'transports')

export function titre(nombre: number, critere: Critere, max: number | null): string {
  const debut = `Où se retrouver à ${nombre}, à vol d’oiseau`
  if (max !== null) return `${debut}, sans dépasser ${km(max)}`
  return critere === 'pire' ? `${debut}, au pire trajet le plus court` : `${debut}, au plus court en moyenne`
}

/** Échappe le texte avant insertion dans le HTML. */
export function echapper(texte: string): string {
  return texte.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}
