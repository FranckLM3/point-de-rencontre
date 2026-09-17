import type { Tranche } from '../calcul/zones'
import { km } from './format'
import { TEINTE_ZONES, opaciteCumulee } from './rendu-zones'

/** Réglette horizontale : une case par tranche, bornes sous les cases, unité à la fin. */
export function rendreLegende(el: HTMLElement, tranches: Tranche[]): void {
  const croissantes = [...tranches].sort((a, b) => a.seuil - b.seuil)
  el.hidden = croissantes.length === 0
  el.setAttribute('role', 'img')
  el.setAttribute('aria-label', `Légende : ${croissantes.map((t) => `jusqu’à ${km(t.seuil)}`).join(', ')}`)
  // Chaque case montre l'opacité réellement visible sur la carte (couches cumulées).
  el.innerHTML = croissantes
    .map(
      (t, rang) =>
        `<span class="case"><span class="nuance" style="background:${TEINTE_ZONES};opacity:${opaciteCumulee(rang, croissantes.length).toFixed(2)}"></span>${Math.round(t.seuil)}</span>`,
    )
    .join('')
    .concat(croissantes.length > 0 ? '<span class="unite">km</span>' : '')
}
