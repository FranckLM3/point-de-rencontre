import type { Repaire } from '../calcul/repaires'
import type { Unite } from '../calcul/unites'
import type { Critere } from '../types'
import { aideRepaire, type ContexteAide } from './aide-repaire'
import { echapper, valeur } from './format'

/** La valeur du critère actif passe en premier : moyenne puis pire, ou pire puis moyenne. */
function ligneRepaire(r: Repaire, unite: Unite, critere: Critere): string {
  const { pire, moyenne } = r.classee
  return critere === 'moyenne'
    ? `${valeur(moyenne, unite)} en moyenne · ${valeur(pire, unite)} au pire`
    : `${valeur(pire, unite)} au pire · ${valeur(moyenne, unite)} en moyenne`
}

/**
 * Les meilleurs lieux du groupe (trois au plus), cliquables : le premier est la meilleure ville,
 * les suivantes portent « ça se vaut » quand l'écart tient dans la marge d'erreur de nos temps
 * (src/calcul/repaires.ts). Personne de coché : rien n'est affiché.
 */
export function rendreRepaires(
  el: HTMLElement,
  repaires: Repaire[],
  unite: Unite,
  voir: (r: Repaire) => void,
  critere: Critere = 'pire',
  aide: ContexteAide | null = null,
): void {
  if (repaires.length === 0) {
    el.innerHTML = ''
    return
  }
  const lignes = repaires
    .map((r, i) => {
      const equivalent = i > 0 && r.equivalente ? '<small class="equivalent">ça se vaut</small>' : ''
      return `<li>
        <button type="button" class="repaire-ville" data-i="${i}">
          <span class="nom">${echapper(r.classee.ville.nom)}${equivalent}</span>
          <span class="ligne">${ligneRepaire(r, unite, critere)}</span>
        </button>
      </li>`
    })
    .join('')
  el.innerHTML = `
    <article class="ville-carte repaire">
      <span class="sur-titre">${repaires.length > 1 ? 'Les repaires' : 'Le repaire'}</span>${aide ? aideRepaire(unite, critere, aide) : ''}
      <ol class="repaires">${lignes}</ol>
    </article>`
  el.querySelectorAll<HTMLButtonElement>('.repaire-ville').forEach((b) =>
    b.addEventListener('click', () => voir(repaires[Number(b.dataset.i)]!)),
  )
}
