import type { Tranche } from '../calcul/zones'
import { km } from './format'

/** Réglette horizontale : une case par tranche, bornes sous les cases. */
export function rendreLegende(el: HTMLElement, tranches: Tranche[]): void {
  const croissantes = [...tranches].sort((a, b) => a.seuil - b.seuil)
  el.hidden = croissantes.length === 0
  el.setAttribute('role', 'img')
  el.setAttribute('aria-label', `Légende : ${croissantes.map((t) => `jusqu’à ${km(t.seuil)}`).join(', ')}`)
  // Les couleurs viennent de COULEURS_TRANCHES (constantes), jamais d'une saisie.
  el.innerHTML = croissantes
    .map((t) => `<span class="case"><span class="nuance" style="background:${t.couleur}"></span>${km(t.seuil)}</span>`)
    .join('')
}
