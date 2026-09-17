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

test('libellés : Aucune, Ajouter un Croco, pas d’aria-pressed sur une liste', () => {
  const el = document.createElement('div')
  const a = actions()
  rendreAmis(el, { amis, groupes: [], selection: new Set(['a']) }, a)
  expect(el.querySelector('[data-action="aucun"]')!.textContent).toBe('Aucune')
  expect(el.querySelector('select')!.hasAttribute('aria-pressed')).toBe(false)
  cliquer(el, '[data-action="aucun"]')
  expect(a.changerSelection).toHaveBeenCalledWith([])
  const ajouter = el.querySelector<HTMLButtonElement>('[data-action="ajouter"]')!
  expect(ajouter.textContent).toBe('Ajouter un Croco')
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

test('filtres : seuls « Chacun son moyen » et « Tous en voiture » restent désactivés', () => {
  const el = document.createElement('div')
  rendreFiltres(el, ETAT_DEFAUT, 2, vi.fn())
  for (const m of ['mixte', 'voiture']) {
    expect(el.querySelector<HTMLButtonElement>(`[data-mode="${m}"]`)!.disabled).toBe(true)
  }
  expect(el.querySelector<HTMLButtonElement>('[data-mode="tc"]')!.disabled).toBe(false)
  expect(el.querySelector('h1')!.textContent).toContain('à 2')
  expect(el.querySelector('select')!.hasAttribute('aria-pressed')).toBe(false)
})

test('filtres : changer de mode remet le maximum à zéro', () => {
  const el = document.createElement('div')
  const changer = vi.fn()
  rendreFiltres(el, { ...ETAT_DEFAUT, max: 300 }, 2, changer)
  cliquer(el, '[data-mode="tc"]')
  expect(changer).toHaveBeenCalledWith({ mode: 'tc', max: null })
  const tc = document.createElement('div')
  rendreFiltres(tc, { ...ETAT_DEFAUT, mode: 'tc' }, 2, changer)
  cliquer(tc, '[data-mode="oiseau"]')
  expect(changer).toHaveBeenCalledWith({ mode: 'oiseau', max: null })
})

test('filtres : le mode actif est en tête de la rangée', () => {
  const el = document.createElement('div')
  rendreFiltres(el, { ...ETAT_DEFAUT, mode: 'tc' }, 2, vi.fn())
  const modes = [...el.querySelectorAll<HTMLButtonElement>('[data-mode]')].map((b) => b.dataset.mode)
  expect(modes[0]).toBe('tc')
  expect(el.querySelector('[data-mode="tc"]')!.getAttribute('aria-pressed')).toBe('true')
  expect(el.querySelector('[data-mode="oiseau"]')!.getAttribute('aria-pressed')).toBe('false')
})

test('filtres : pastilles Temps et Prix en transports seulement', () => {
  const oiseauEl = document.createElement('div')
  rendreFiltres(oiseauEl, ETAT_DEFAUT, 2, vi.fn())
  expect(oiseauEl.querySelector('[aria-label="Grandeur"]')).toBeNull()

  const el = document.createElement('div')
  const changer = vi.fn()
  rendreFiltres(el, { ...ETAT_DEFAUT, mode: 'tc', max: 120 }, 2, changer)
  const groupe = el.querySelector('[role="group"][aria-label="Grandeur"]')!
  const temps = groupe.querySelector('[data-grandeur="temps"]')!
  const prix = groupe.querySelector('[data-grandeur="prix"]')!
  expect(temps.textContent).toBe('Temps')
  expect(prix.textContent).toBe('Prix')
  expect(temps.getAttribute('aria-pressed')).toBe('true')
  expect(prix.getAttribute('aria-pressed')).toBe('false')
  cliquer(el, '[data-grandeur="prix"]')
  expect(changer).toHaveBeenCalledWith({ grandeur: 'prix', max: null })
})

test('filtres : critère et distance maximum', () => {
  const el = document.createElement('div')
  const changer = vi.fn()
  rendreFiltres(el, ETAT_DEFAUT, 2, changer)
  cliquer(el, '[data-critere="moyenne"]')
  expect(changer).toHaveBeenCalledWith({ critere: 'moyenne' })
  const select = el.querySelector('select')!
  expect(select.getAttribute('aria-label')).toBe('Distance maximum')
  expect([...select.options].map((o) => o.textContent)).toContain('300 km max')
  select.value = '300'
  select.dispatchEvent(new Event('change'))
  expect(changer).toHaveBeenCalledWith({ max: 300 })
})

test('filtres : maximum en durée ou en prix selon la grandeur', () => {
  const el = document.createElement('div')
  rendreFiltres(el, { ...ETAT_DEFAUT, mode: 'tc', max: 180 }, 3, vi.fn())
  const select = el.querySelector('select')!
  expect(select.getAttribute('aria-label')).toBe('Durée maximum')
  expect(select.options[0]!.textContent).toBe('Durée maximum')
  expect([...select.options].map((o) => o.textContent)).toContain('3 h max')
  expect(select.value).toBe('180')
  expect(el.querySelector('h1')!.textContent).toBe('Où se retrouver à 3 Crocos, en transports, sans dépasser 3 h')

  const prix = document.createElement('div')
  rendreFiltres(prix, { ...ETAT_DEFAUT, mode: 'tc', grandeur: 'prix' }, 3, vi.fn())
  const menu = prix.querySelector('select')!
  expect(menu.getAttribute('aria-label')).toBe('Prix maximum')
  expect([...menu.options].map((o) => o.textContent)).toContain('40 € max')
  expect(prix.querySelector('h1')!.textContent).toContain('en transports')
})

const ville = { nom: 'Dijon', dep: '21', lat: 47.3, lon: 5.04, population: 1 }
const classee = { ville, parAmi: [{ valeur: 270 }, { valeur: 170 }], total: 440, moyenne: 220, pire: 270 }
const enTrain = {
  ville,
  parAmi: [{ valeur: 194, precision: 'Marseille Saint-Charles → Paris Gare de Lyon' }, { valeur: 126, precision: 'sans train' }],
  total: 320,
  moyenne: 160,
  pire: 194,
}
const actionsVilles = () => ({ choisir: vi.fn(), ajouter: vi.fn() })
const oiseau = { unite: 'km', mode: 'oiseau' } as const
const transports = { unite: 'min', mode: 'tc' } as const

test('une carte de ville affiche pire trajet et total, et se déplie', () => {
  const el = document.createElement('div')
  const a = actionsVilles()
  rendreVilles(el, { villes: [classee], amis, nbPersonnes: 2, max: null, ...oiseau }, a)
  expect(el.textContent).toContain('Pire trajet 270 km')
  expect(el.textContent).toContain('Total 440 km')
  const bouton = el.querySelector<HTMLButtonElement>('.ville-carte button')!
  bouton.click()
  expect(bouton.getAttribute('aria-expanded')).toBe('true')
  expect(el.querySelector<HTMLElement>('.zone-detail')!.hidden).toBe(false)
  expect(a.choisir).toHaveBeenCalledWith(classee)
})

test('une carte de ville en minutes affiche des durées', () => {
  const el = document.createElement('div')
  rendreVilles(el, { villes: [enTrain], amis, nbPersonnes: 2, max: null, ...transports }, actionsVilles())
  expect(el.textContent).toContain('Pire trajet 3 h 14')
  expect(el.textContent).toContain('Total 5 h 20')
  expect(el.querySelector('.detail')!.textContent).toContain('2 h 06')
})

test('en transports : précision sous le nom et liens de réservation', () => {
  const el = document.createElement('div')
  const avecBalise = { ...enTrain, parAmi: [enTrain.parAmi[0]!, { valeur: 126, precision: '<b>Gare</b>' }] }
  rendreVilles(el, { villes: [avecBalise], amis, nbPersonnes: 2, max: null, ...transports }, actionsVilles())
  const precisions = [...el.querySelectorAll('.detail .precision')].map((p) => p.textContent)
  expect(precisions).toContain('Marseille Saint-Charles → Paris Gare de Lyon')
  expect(precisions).toContain('<b>Gare</b>')
  expect(el.querySelector('.detail b')).toBeNull()
  const liens = [...el.querySelectorAll<HTMLAnchorElement>('.zone-detail a')]
  expect(liens.map((l) => l.textContent)).toEqual(['SNCF Connect', 'Trainline'])
  expect(liens.map((l) => l.href)).toEqual(['https://www.sncf-connect.com/', 'https://www.thetrainline.com/fr'])
  for (const l of liens) {
    expect(l.target).toBe('_blank')
    expect(l.rel).toBe('noopener')
  }
})

test('à vol d’oiseau : aucun lien de réservation ni précision', () => {
  const el = document.createElement('div')
  rendreVilles(el, { villes: [classee], amis, nbPersonnes: 2, max: null, ...oiseau }, actionsVilles())
  expect(el.querySelector('a')).toBeNull()
  expect(el.querySelector('.precision')).toBeNull()
})

test('personne en base : invitation à ajouter la première personne', () => {
  const el = document.createElement('div')
  const a = actionsVilles()
  rendreVilles(el, { villes: [], amis: [], nbPersonnes: 0, max: null, ...oiseau }, a)
  expect(el.textContent).toContain('Ajoute le premier Croco pour commencer.')
  const bouton = el.querySelector<HTMLButtonElement>('button')!
  expect(bouton.textContent).toBe('Ajouter un Croco')
  bouton.click()
  expect(a.ajouter).toHaveBeenCalled()
})

test('personne cochée : consigne', () => {
  const el = document.createElement('div')
  rendreVilles(el, { villes: [], amis: [], nbPersonnes: 2, max: null, ...oiseau }, actionsVilles())
  expect(el.textContent).toBe('Coche au moins un Croco pour voir la carte.')
})

test('aucune ville sous le maximum : message avec la valeur réelle', () => {
  const el = document.createElement('div')
  rendreVilles(el, { villes: [], amis, nbPersonnes: 2, max: 150, ...oiseau }, actionsVilles())
  expect(el.textContent).toBe('Aucune ville à moins de 150 km pour tout le monde. Choisis une distance plus grande.')
  rendreVilles(el, { villes: [], amis, nbPersonnes: 2, max: 180, ...transports }, actionsVilles())
  expect(el.textContent).toBe('Aucune ville à moins de 3 h pour tout le monde. Choisis une durée plus longue.')
  rendreVilles(el, { villes: [], amis, nbPersonnes: 2, max: 40, unite: 'eur', mode: 'tc' }, actionsVilles())
  expect(el.textContent).toBe('Aucune ville à moins de 40 € pour tout le monde. Choisis un prix plus élevé.')
})

test('le lieu testé liste chaque ami et peut être retiré', () => {
  const el = document.createElement('div')
  const retirer = vi.fn()
  rendreResultatLieu(el, { lat: 47.3, lon: 5.04, label: '<i>Dijon</i>' }, amis, [{ valeur: 270 }, { valeur: 170 }], 'km', retirer)
  expect(el.querySelectorAll('.detail tr')).toHaveLength(2)
  expect(el.querySelector('i')).toBeNull()
  expect(el.textContent).toContain('Pire trajet 270 km')
  const bouton = el.querySelector<HTMLButtonElement>('button')!
  expect(bouton.textContent).toBe('Retirer le lieu')
  bouton.click()
  expect(retirer).toHaveBeenCalled()
})

test('le lieu testé affiche l’unité courante et la précision', () => {
  const el = document.createElement('div')
  rendreResultatLieu(el, marseille, amis, enTrain.parAmi, 'min', vi.fn())
  expect(el.textContent).toContain('Pire trajet 3 h 14')
  expect(el.textContent).toContain('Total 5 h 20')
  expect(el.querySelector('.precision')!.textContent).toBe('Marseille Saint-Charles → Paris Gare de Lyon')
})

test('le lieu testé injoignable pour une personne le dit', () => {
  const el = document.createElement('div')
  rendreResultatLieu(el, marseille, amis, [{ valeur: 194 }, null], 'min', vi.fn())
  expect(el.textContent).toContain('Pas de trajet pour tout le monde')
  expect(el.textContent).not.toContain('Total')
  expect(el.querySelector('.detail')!.textContent).toContain('Pas de trajet')
  expect(el.querySelectorAll('.detail tr')).toHaveLength(2)
})

test('sans lieu, rien n’est affiché', () => {
  const el = document.createElement('div')
  el.innerHTML = 'ancien'
  rendreResultatLieu(el, null, amis, [], 'km', vi.fn())
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
