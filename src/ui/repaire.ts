import type { Unite } from '../calcul/unites'
import type { Critere } from '../types'
import { aideRepaire, type ContexteAide } from './aide-repaire'
import { echapper, valeur } from './format'

export interface Repaire {
  /** Ville la plus proche du meilleur point, à vol d'oiseau. */
  ville: string
  pire: number
  total: number
  /** Personnes comptées dans le total (pour la moyenne). */
  nombre?: number
}

/** Résumé du meilleur point, au-dessus de la liste des villes. Rien n'est coché : rien n'est affiché. */
/** La valeur du critère actif passe en premier : moyenne puis pire, ou pire puis total. */
function ligneRepaire(r: Repaire, unite: Unite, critere: Critere): string {
  if (critere === 'moyenne' && r.nombre) {
    return `près de ${echapper(r.ville)} · ${valeur(r.total / r.nombre, unite)} en moyenne · ${valeur(r.pire, unite)} au pire`
  }
  return `près de ${echapper(r.ville)} · ${valeur(r.pire, unite)} au pire · ${valeur(r.total, unite)} au total`
}

export function rendreRepaire(
  el: HTMLElement,
  r: Repaire | null,
  unite: Unite,
  voir: () => void,
  critere: Critere = 'pire',
  aide: ContexteAide | null = null,
): void {
  if (!r) {
    el.innerHTML = ''
    return
  }
  el.innerHTML = `
    <article class="ville-carte repaire">
      <span class="sur-titre">Le repaire</span>${aide ? aideRepaire(unite, critere, aide) : ''}
      <span class="ligne">${ligneRepaire(r, unite, critere)}</span>
      <button type="button" class="pastille verte" data-action="voir-carte">Voir sur la carte</button>
    </article>`
  el.querySelector('[data-action="voir-carte"]')!.addEventListener('click', () => voir())
}
