import type { Transport } from '../types'
import { libelleTransport } from './format'

/** Style de trait unique pour les deux pictogrammes : contour seul, sans remplissage. */
const TRAIT = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'

const TRAIN =
  `<svg viewBox="0 0 24 24" width="14" height="14" ${TRAIT} aria-hidden="true" focusable="false">` +
  '<rect x="5" y="3" width="14" height="12" rx="4"/><path d="M5 10h14"/><path d="M9 16l-2.5 4M15 16l2.5 4"/>' +
  '<circle cx="9" cy="19.5" r=".75" fill="currentColor" stroke="none"/><circle cx="15" cy="19.5" r=".75" fill="currentColor" stroke="none"/></svg>'

const VOITURE =
  `<svg viewBox="0 0 24 24" width="14" height="14" ${TRAIT} aria-hidden="true" focusable="false">` +
  '<path d="M4 16v-4.5L6.5 6h11L20 11.5V16"/><path d="M2 16h20"/><circle cx="7.5" cy="17.5" r="1.5"/><circle cx="16.5" cy="17.5" r="1.5"/></svg>'

/** Icône + texte visuellement masqué (repris par les lecteurs d'écran) : jamais d'émoji. */
export function pictoTransport(t: Transport): string {
  const svg = t === 'voiture' ? VOITURE : TRAIN
  return `<span class="picto-transport">${svg}<span class="invisible">${libelleTransport(t)}</span></span>`
}
