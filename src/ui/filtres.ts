import { maximaProposes, uniteDe, type Unite } from '../calcul/unites'
import type { Etat, Grandeur, Mode } from '../types'
import { sousTitre, titreCourt, valeur } from './format'

interface BoutonMode {
  mode: Mode
  libelle: string
  actif: boolean
}

const MODES: BoutonMode[] = [
  { mode: 'oiseau', libelle: 'Vol d’oiseau', actif: true },
  { mode: 'mixte', libelle: 'Chacun son moyen', actif: false },
  { mode: 'voiture', libelle: 'Tous en voiture', actif: false },
  { mode: 'tc', libelle: 'Tous en transports', actif: true },
]

const GRANDEURS: { grandeur: Grandeur; libelle: string }[] = [
  { grandeur: 'temps', libelle: 'Temps' },
  { grandeur: 'prix', libelle: 'Prix' },
]

const LIBELLE_MAX: Record<Unite, string> = { km: 'Distance maximum', min: 'Durée maximum', eur: 'Prix maximum' }

const presse = (vrai: boolean): string => `aria-pressed="${vrai}"`

/** Le mode courant passe en tête de la rangée (décision du plan 1), les autres gardent leur ordre. */
function boutonsModes(courant: Mode): string {
  const ordonnes = [...MODES].sort((a, b) => Number(b.mode === courant) - Number(a.mode === courant))
  return ordonnes
    .map((m) =>
      `<button type="button" class="pastille" data-mode="${m.mode}"${m.actif ? '' : ' disabled title="Bientôt"'} ${presse(m.mode === courant)}>${m.libelle}</button>`,
    )
    .join('')
}

function pastillesGrandeur(e: Etat): string {
  if (e.mode !== 'tc') return ''
  const boutons = GRANDEURS.map(
    (g) => `<button type="button" class="pastille" data-grandeur="${g.grandeur}" ${presse(e.grandeur === g.grandeur)}>${g.libelle}</button>`,
  ).join('')
  return `<div class="rang" role="group" aria-label="Grandeur">${boutons}</div>`
}

function menuMaximum(e: Etat, unite: Unite): string {
  const libelle = LIBELLE_MAX[unite]
  const options = maximaProposes(unite)
    .map((m) => `<option value="${m}" ${e.max === m ? 'selected' : ''}>${valeur(m, unite)} max</option>`)
    .join('')
  return `<select class="pastille${e.max !== null ? ' verte' : ''}" aria-label="${libelle}">
        <option value="">${libelle}</option>
        ${options}
      </select>`
}

export function rendreFiltres(el: HTMLElement, e: Etat, nombre: number, changer: (p: Partial<Etat>) => void): void {
  const unite = uniteDe(e.mode, e.grandeur)
  el.innerHTML = `
    <div class="rang defile" role="group" aria-label="Mode de calcul">${boutonsModes(e.mode)}</div>
    ${pastillesGrandeur(e)}
    <div class="rang defile" role="group" aria-label="Critère">
      <button type="button" class="pastille" data-critere="pire" ${presse(e.critere === 'pire')}>Pire trajet</button>
      <button type="button" class="pastille" data-critere="moyenne" ${presse(e.critere === 'moyenne')}>Moyenne</button>
      ${menuMaximum(e, unite)}
    </div>
    <h1>${titreCourt(nombre)}</h1>
    <p class="sous-titre">${sousTitre({ mode: e.mode, unite, critere: e.critere, max: e.max })}</p>`
  // Les unités diffèrent d'un mode ou d'une grandeur à l'autre : le maximum repart de zéro.
  el.querySelectorAll<HTMLButtonElement>('[data-mode]:not([disabled])').forEach((b) =>
    b.addEventListener('click', () => changer({ mode: b.dataset.mode as Mode, max: null })),
  )
  el.querySelectorAll<HTMLButtonElement>('[data-grandeur]').forEach((b) =>
    b.addEventListener('click', () => changer({ grandeur: b.dataset.grandeur as Grandeur, max: null })),
  )
  el.querySelectorAll<HTMLButtonElement>('[data-critere]').forEach((b) =>
    b.addEventListener('click', () => changer({ critere: b.dataset.critere as Etat['critere'] })),
  )
  el.querySelector('select')!.addEventListener('change', (evt) => {
    const v = (evt.target as HTMLSelectElement).value
    changer({ max: v ? Number(v) : null })
  })
}
