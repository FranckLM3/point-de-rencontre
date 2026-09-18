import type { Unite } from '../calcul/unites'
import { echapper, valeur } from './format'

export interface Repaire {
  /** Ville la plus proche du meilleur point, à vol d'oiseau. */
  ville: string
  pire: number
  total: number
}

/** Résumé du meilleur point, au-dessus de la liste des villes. Rien n'est coché : rien n'est affiché. */
export function rendreRepaire(el: HTMLElement, r: Repaire | null, unite: Unite, voir: () => void): void {
  if (!r) {
    el.innerHTML = ''
    return
  }
  el.innerHTML = `
    <article class="ville-carte repaire">
      <span class="sur-titre">Le repaire</span>
      <span class="ligne">près de ${echapper(r.ville)} · ${valeur(r.pire, unite)} au pire · ${valeur(r.total, unite)} au total</span>
      <button type="button" class="pastille verte" data-action="voir-carte">Voir sur la carte</button>
    </article>`
  el.querySelector('button')!.addEventListener('click', () => voir())
}
