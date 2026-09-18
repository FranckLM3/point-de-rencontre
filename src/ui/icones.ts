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

/** Le tracé seul, décoratif : à poser à côté d'un texte qui porte déjà le nom accessible. */
export const svgTransport = (t: Transport): string => (t === 'voiture' ? VOITURE : TRAIN)

/** Icône + texte visuellement masqué (repris par les lecteurs d'écran) : jamais d'émoji. */
export function pictoTransport(t: Transport): string {
  return `<span class="picto-transport">${svgTransport(t)}<span class="invisible">${libelleTransport(t)}</span></span>`
}

/** Crayon : bouton « Modifier X » porte déjà son nom accessible, l'icône reste décorative. */
export const ICONE_CRAYON =
  `<svg viewBox="0 0 24 24" width="16" height="16" ${TRAIT} aria-hidden="true" focusable="false">` +
  '<path d="M4 20l1-4.5L15.5 5 19 8.5 8.5 19 4 20Z"/><path d="M13.5 6.5 17.5 10.5"/></svg>'

/** Coche : confirmation d'adresse retenue dans la fiche d'un Croco. */
export const ICONE_COCHE =
  `<svg viewBox="0 0 24 24" width="14" height="14" ${TRAIT} aria-hidden="true" focusable="false">` +
  '<path d="M4 12.5 9.5 18 20 6"/></svg>'

/** Loupe : champ de recherche de la liste des Crocos. */
export const ICONE_RECHERCHE =
  `<svg viewBox="0 0 24 24" width="16" height="16" ${TRAIT} aria-hidden="true" focusable="false">` +
  '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M20 20l-4.35-4.35"/></svg>'

/** Plein écran : quatre coins qui se rejoignent, posé sur la carte à côté du zoom. */
export const ICONE_PLEIN_ECRAN =
  `<svg viewBox="0 0 24 24" width="16" height="16" ${TRAIT} aria-hidden="true" focusable="false">` +
  '<path d="M8 4H4v4M16 4h4v4M8 20H4v-4M16 20h4v-4"/></svg>'
