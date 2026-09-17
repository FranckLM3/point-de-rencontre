import type { Etat } from '../types'
import { titre } from './format'

const MAX_KM = [100, 200, 300, 400, 500, 700]

const presse = (vrai: boolean): string => `aria-pressed="${vrai}"`

export function rendreFiltres(el: HTMLElement, e: Etat, nombre: number, changer: (p: Partial<Etat>) => void): void {
  el.innerHTML = `
    <div class="rang defile" role="group" aria-label="Mode de calcul">
      <button type="button" class="pastille" data-mode="mixte" disabled title="Bientôt" ${presse(false)}>Chacun son moyen</button>
      <button type="button" class="pastille" data-mode="voiture" disabled title="Bientôt" ${presse(false)}>Tous en voiture</button>
      <button type="button" class="pastille" data-mode="tc" disabled title="Bientôt" ${presse(false)}>Tous en transports</button>
      <button type="button" class="pastille" data-mode="oiseau" ${presse(e.mode === 'oiseau')}>Vol d’oiseau</button>
    </div>
    <div class="rang defile" role="group" aria-label="Critère">
      <button type="button" class="pastille" data-critere="pire" ${presse(e.critere === 'pire')}>Pire trajet</button>
      <button type="button" class="pastille" data-critere="moyenne" ${presse(e.critere === 'moyenne')}>Moyenne</button>
      <select class="pastille${e.max !== null ? ' verte' : ''}" aria-label="Distance maximum">
        <option value="">Distance maximum</option>
        ${MAX_KM.map((m) => `<option value="${m}" ${e.max === m ? 'selected' : ''}>${m} km max</option>`).join('')}
      </select>
    </div>
    <h1>${titre(nombre, e.critere, e.max)}</h1>`
  el.querySelectorAll<HTMLButtonElement>('[data-critere]').forEach((b) =>
    b.addEventListener('click', () => changer({ critere: b.dataset.critere as Etat['critere'] })),
  )
  el.querySelector('select')!.addEventListener('change', (evt) => {
    const v = (evt.target as HTMLSelectElement).value
    changer({ max: v ? Number(v) : null })
  })
}
