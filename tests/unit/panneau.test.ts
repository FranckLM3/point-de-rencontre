import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { Ami, Lieu } from '../../src/types'

const chercherAdresses = vi.fn<(texte: string) => Promise<Lieu[]>>()
vi.mock('../../src/donnees/geocodage', () => ({ LONGUEUR_MIN: 3, chercherAdresses: (t: string) => chercherAdresses(t) }))

const { rendreAmis } = await import('../../src/ui/amis')
const { rendreFiltres } = await import('../../src/ui/filtres')
const { rendreRechercheLieu, rendreResultatLieu } = await import('../../src/ui/lieu')
const { rendreVilles } = await import('../../src/ui/liste-villes')
const { ETAT_DEFAUT } = await import('../../src/etat/url')
type ActionsAmis = import('../../src/ui/amis').ActionsAmis

const DELAI_FRAPPE_MS = 250

const amis: Ami[] = [
  { id: 'a', nom: 'Léa', adresse: '1 rue X 75004 Paris', lat: 48.85, lon: 2.36, transport: 'tc', navigo: true },
  { id: 'b', nom: '<b>Tom</b>', adresse: '2 rue Y 69001 Lyon', lat: 45.76, lon: 4.83, transport: 'voiture', navigo: false },
]
const marseille: Lieu = { label: '1 La Canebière 13001 Marseille', lat: 43.2965, lon: 5.3698 }
const brest: Lieu = { label: '1 Rue de Siam 29200 Brest', lat: 48.39, lon: -4.49 }

beforeEach(() => { chercherAdresses.mockReset() })
afterEach(() => { vi.useRealTimers() })

const actions = (): ActionsAmis => ({
  changerSelection: vi.fn(),
  editer: vi.fn(),
  ajouter: vi.fn(),
  enregistrerGroupe: vi.fn(() => Promise.resolve()),
})

const cliquer = (el: Element, sel: string) => el.querySelector<HTMLElement>(sel)!.click()

test('décocher un ami rend la sélection sans lui', () => {
  const el = document.createElement('div')
  const a = actions()
  rendreAmis(el, { amis, groupes: [], selection: new Set(['a', 'b']) }, a)
  const caseLea = el.querySelector<HTMLInputElement>('input[data-id="a"]')!
  caseLea.checked = false
  caseLea.dispatchEvent(new Event('change'))
  expect(a.changerSelection).toHaveBeenCalledWith(['b'])
})

test('choisir un groupe coche ses membres encore présents', () => {
  const el = document.createElement('div')
  const a = actions()
  rendreAmis(el, { amis, groupes: [{ id: 'g', nom: 'Sud', amis: ['b', 'disparu'] }], selection: new Set() }, a)
  const select = el.querySelector('select')!
  select.value = 'g'
  select.dispatchEvent(new Event('change'))
  expect(a.changerSelection).toHaveBeenCalledWith(['b'])
})

test('pastille : nom échappé, ville et moyen de transport visibles', () => {
  const el = document.createElement('div')
  rendreAmis(el, { amis, groupes: [], selection: new Set() }, actions())
  expect(el.querySelector('b')).toBeNull()
  expect(el.textContent).toContain('<b>Tom</b>')
  expect(el.textContent).toContain('Lyon')
  expect(el.textContent).toContain('voiture')
})

test('libellés : Aucune, Ajouter une personne, pas d’aria-pressed sur une liste', () => {
  const el = document.createElement('div')
  const a = actions()
  rendreAmis(el, { amis, groupes: [], selection: new Set(['a']) }, a)
  expect(el.querySelector('[data-action="aucun"]')!.textContent).toBe('Aucune')
  expect(el.querySelector('select')!.hasAttribute('aria-pressed')).toBe(false)
  cliquer(el, '[data-action="aucun"]')
  expect(a.changerSelection).toHaveBeenCalledWith([])
  const ajouter = el.querySelector<HTMLButtonElement>('[data-action="ajouter"]')!
  expect(ajouter.textContent).toBe('Ajouter une personne')
  ajouter.click()
  expect(a.ajouter).toHaveBeenCalled()
})

test('le formulaire de groupe enregistre le nom saisi et la sélection, sans boîte du navigateur', async () => {
  const invite = vi.spyOn(window, 'prompt')
  const el = document.createElement('div')
  const a = actions()
  rendreAmis(el, { amis, groupes: [], selection: new Set(['b']) }, a)
  const formulaire = el.querySelector<HTMLFormElement>('form.groupe')!
  expect(formulaire.hidden).toBe(true)
  cliquer(el, '[data-action="groupe"]')
  expect(formulaire.hidden).toBe(false)
  const champ = el.querySelector<HTMLInputElement>('input[name="nom-groupe"]')!
  expect(el.querySelector(`label[for="${champ.id}"]`)!.textContent).toBe('Nom du groupe')
  champ.value = 'Sud'
  formulaire.dispatchEvent(new Event('submit', { cancelable: true }))
  expect(a.enregistrerGroupe).toHaveBeenCalledWith('Sud', ['b'])
  expect(invite).not.toHaveBeenCalled()
  await Promise.resolve()
  await Promise.resolve()
  expect(formulaire.hidden).toBe(true)
})

test('le formulaire de groupe affiche l’erreur et rend le bouton', async () => {
  const el = document.createElement('div')
  const a = actions()
  a.enregistrerGroupe = vi.fn(() => Promise.reject(new Error('Impossible d’enregistrer le groupe.')))
  rendreAmis(el, { amis, groupes: [], selection: new Set(['b']) }, a)
  cliquer(el, '[data-action="groupe"]')
  el.querySelector<HTMLInputElement>('input[name="nom-groupe"]')!.value = 'Sud'
  el.querySelector('form.groupe')!.dispatchEvent(new Event('submit', { cancelable: true }))
  const bouton = el.querySelector<HTMLButtonElement>('form.groupe button[type="submit"]')!
  expect(bouton.disabled).toBe(true)
  expect(bouton.textContent).toBe('Enregistrement…')
  await vi.waitFor(() => expect(bouton.disabled).toBe(false))
  expect(bouton.textContent).toBe('Enregistrer le groupe')
  expect(el.querySelector('form.groupe .erreur')!.textContent).toBe('Impossible d’enregistrer le groupe.')
})

test('Annuler referme le formulaire de groupe', () => {
  const el = document.createElement('div')
  rendreAmis(el, { amis, groupes: [], selection: new Set() }, actions())
  cliquer(el, '[data-action="groupe"]')
  cliquer(el, 'form.groupe [data-action="annuler-groupe"]')
  expect(el.querySelector<HTMLFormElement>('form.groupe')!.hidden).toBe(true)
})

test('les modes pas encore livrés sont désactivés', () => {
  const el = document.createElement('div')
  rendreFiltres(el, ETAT_DEFAUT, 2, vi.fn())
  for (const m of ['mixte', 'voiture', 'tc']) {
    expect(el.querySelector<HTMLButtonElement>(`[data-mode="${m}"]`)!.disabled).toBe(true)
  }
  expect(el.querySelector('h1')!.textContent).toContain('à 2')
  expect(el.querySelector('select')!.hasAttribute('aria-pressed')).toBe(false)
})

test('filtres : critère et distance maximum', () => {
  const el = document.createElement('div')
  const changer = vi.fn()
  rendreFiltres(el, ETAT_DEFAUT, 2, changer)
  cliquer(el, '[data-critere="moyenne"]')
  expect(changer).toHaveBeenCalledWith({ critere: 'moyenne' })
  const select = el.querySelector('select')!
  select.value = '300'
  select.dispatchEvent(new Event('change'))
  expect(changer).toHaveBeenCalledWith({ max: 300 })
})

const ville = { nom: 'Dijon', dep: '21', lat: 47.3, lon: 5.04, population: 1 }
const classee = { ville, parAmi: [270, 170], total: 440, moyenne: 220, pire: 270 }
const actionsVilles = () => ({ choisir: vi.fn(), ajouter: vi.fn() })

test('une carte de ville affiche pire trajet et total, et se déplie', () => {
  const el = document.createElement('div')
  const a = actionsVilles()
  rendreVilles(el, { villes: [classee], amis, nbPersonnes: 2, max: null }, a)
  expect(el.textContent).toContain('Pire trajet 270 km')
  expect(el.textContent).toContain('Total 440 km')
  const bouton = el.querySelector<HTMLButtonElement>('.ville-carte button')!
  bouton.click()
  expect(bouton.getAttribute('aria-expanded')).toBe('true')
  expect(el.querySelector<HTMLElement>('.zone-detail')!.hidden).toBe(false)
  expect(a.choisir).toHaveBeenCalledWith(classee)
})

test('personne en base : invitation à ajouter la première personne', () => {
  const el = document.createElement('div')
  const a = actionsVilles()
  rendreVilles(el, { villes: [], amis: [], nbPersonnes: 0, max: null }, a)
  expect(el.textContent).toContain('Ajoute la première personne pour commencer.')
  const bouton = el.querySelector<HTMLButtonElement>('button')!
  expect(bouton.textContent).toBe('Ajouter une personne')
  bouton.click()
  expect(a.ajouter).toHaveBeenCalled()
})

test('personne cochée : consigne', () => {
  const el = document.createElement('div')
  rendreVilles(el, { villes: [], amis: [], nbPersonnes: 2, max: null }, actionsVilles())
  expect(el.textContent).toBe('Coche au moins une personne pour voir la carte.')
})

test('aucune ville sous le maximum : message avec la valeur réelle', () => {
  const el = document.createElement('div')
  rendreVilles(el, { villes: [], amis, nbPersonnes: 2, max: 150 }, actionsVilles())
  expect(el.textContent).toBe('Aucune ville à moins de 150 km pour tout le monde. Choisis une distance plus grande.')
})

test('le lieu testé liste chaque ami et peut être retiré', () => {
  const el = document.createElement('div')
  const retirer = vi.fn()
  rendreResultatLieu(el, { lat: 47.3, lon: 5.04, label: '<i>Dijon</i>' }, amis, retirer)
  expect(el.querySelectorAll('.detail tr')).toHaveLength(2)
  expect(el.querySelector('i')).toBeNull()
  const bouton = el.querySelector<HTMLButtonElement>('button')!
  expect(bouton.textContent).toBe('Retirer le lieu')
  bouton.click()
  expect(retirer).toHaveBeenCalled()
})

test('sans lieu, rien n’est affiché', () => {
  const el = document.createElement('div')
  el.innerHTML = 'ancien'
  rendreResultatLieu(el, null, amis, vi.fn())
  expect(el.innerHTML).toBe('')
})

function differe<T>() {
  let resoudre!: (v: T) => void
  const promesse = new Promise<T>((r) => { resoudre = r })
  return { promesse, resoudre }
}

test('recherche de lieu : libellé visible, seule la dernière réponse s’affiche', async () => {
  vi.useFakeTimers()
  const el = document.createElement('div')
  const choisir = vi.fn()
  rendreRechercheLieu(el, null, choisir)
  const champ = el.querySelector<HTMLInputElement>('input')!
  expect(el.querySelector(`label[for="${champ.id}"]`)!.textContent).toBe('Tester un lieu')
  const lente = differe<Lieu[]>()
  const rapide = differe<Lieu[]>()
  chercherAdresses.mockReturnValueOnce(lente.promesse).mockReturnValueOnce(rapide.promesse)
  champ.value = 'bre'
  champ.dispatchEvent(new Event('input'))
  await vi.advanceTimersByTimeAsync(DELAI_FRAPPE_MS)
  champ.value = 'canebiere'
  champ.dispatchEvent(new Event('input'))
  await vi.advanceTimersByTimeAsync(DELAI_FRAPPE_MS)
  rapide.resoudre([marseille])
  await vi.advanceTimersByTimeAsync(0)
  lente.resoudre([brest])
  await vi.advanceTimersByTimeAsync(0)
  const boutons = [...el.querySelectorAll<HTMLButtonElement>('.propositions button')]
  expect(boutons.map((b) => b.textContent)).toEqual([marseille.label])
  boutons[0]!.click()
  expect(choisir).toHaveBeenLastCalledWith(marseille)
  expect(champ.value).toBe(marseille.label)
})

test('recherche de lieu : aucun résultat, message d’aide', async () => {
  vi.useFakeTimers()
  const el = document.createElement('div')
  rendreRechercheLieu(el, null, vi.fn())
  chercherAdresses.mockResolvedValueOnce([])
  const champ = el.querySelector<HTMLInputElement>('input')!
  champ.value = 'nulle part'
  champ.dispatchEvent(new Event('input'))
  await vi.advanceTimersByTimeAsync(DELAI_FRAPPE_MS)
  expect(el.querySelector('.aide')!.textContent).toBe('Aucune adresse trouvée. Ajoute le code postal.')
})

test('recherche de lieu : vider le champ retire le lieu, definir remplit le champ', () => {
  const el = document.createElement('div')
  const choisir = vi.fn()
  const recherche = rendreRechercheLieu(el, marseille, choisir)
  const champ = el.querySelector<HTMLInputElement>('input')!
  expect(champ.value).toBe(marseille.label)
  champ.value = ''
  champ.dispatchEvent(new Event('input'))
  expect(choisir).toHaveBeenCalledWith(null)
  recherche.definir(brest)
  expect(champ.value).toBe(brest.label)
  recherche.definir(null)
  expect(champ.value).toBe('')
})
