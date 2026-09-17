import type { Unite } from '../calcul/unites'
import type { Tranche } from '../calcul/zones'
import { valeur } from './format'
import { TEINTE_ZONES, opaciteCumulee } from './rendu-zones'

/**
 * Réglette horizontale : une case par tranche. En km, les cases portent le nombre nu et
 * l'unité finale « km » ferme la légende (comportement historique). Dans les autres
 * unités, chaque case porte déjà sa valeur formée (« 1 h », « 20 € ») et il n'y a pas
 * d'unité finale à répéter.
 */
export function rendreLegende(el: HTMLElement, tranches: Tranche[], unite: Unite = 'km'): void {
  const croissantes = [...tranches].sort((a, b) => a.seuil - b.seuil)
  el.hidden = croissantes.length === 0
  el.setAttribute('role', 'img')
  el.setAttribute('aria-label', `Légende : ${croissantes.map((t) => `jusqu’à ${valeur(t.seuil, unite)}`).join(', ')}`)
  // Chaque case montre l'opacité réellement visible sur la carte (couches cumulées).
  el.innerHTML = croissantes
    .map(
      (t, rang) =>
        `<span class="case"><span class="nuance" style="background:${TEINTE_ZONES};opacity:${opaciteCumulee(rang, croissantes.length).toFixed(2)}"></span>${unite === 'km' ? Math.round(t.seuil) : valeur(t.seuil, unite)}</span>`,
    )
    .join('')
    .concat(unite === 'km' && croissantes.length > 0 ? '<span class="unite">km</span>' : '')
}
