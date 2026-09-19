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

test('éteindre l’interrupteur d’un ami rend la sélection sans lui', () => {
  const el = document.createElement('div')
  const a = actions()
  rendreAmis(el, { amis, groupes: [], selection: new Set(['a', 'b']) }, a)
  el.querySelector<HTMLButtonElement>('.interrupteur[data-id="a"]')!.click()
  expect(a.changerSelection).toHaveBeenCalledWith(['b'])
})

test('toucher la ligne (hors crayon) bascule aussi l’interrupteur', () => {
  const el = document.createElement('div')
  const a = actions()
  rendreAmis(el, { amis, groupes: [], selection: new Set(['a', 'b']) }, a)
  el.querySelector<HTMLElement>('.ligne-ami[data-personne="a"] .nom-ami')!.click()
  expect(a.changerSelection).toHaveBeenCalledWith(['b'])
})

test('l’interrupteur est un vrai switch accessible, la ligne exclue est visuellement atténuée', () => {
  const el = document.createElement('div')
  rendreAmis(el, { amis, groupes: [], selection: new Set(['a']) }, actions())
  const bTom = el.querySelector<HTMLButtonElement>('.interrupteur[data-id="b"]')!
  expect(bTom.getAttribute('role')).toBe('switch')
  expect(bTom.getAttribute('aria-checked')).toBe('false')
  expect(bTom.getAttribute('aria-label')).toBe('Inclure <b>Tom</b>')
  expect(el.querySelector('.ligne-ami[data-personne="b"]')!.classList.contains('exclu')).toBe(true)
})

test('cliquer le crayon appelle éditer sans basculer l’interrupteur', () => {
  const el = document.createElement('div')
  const a = actions()
  rendreAmis(el, { amis, groupes: [], selection: new Set(['a', 'b']) }, a)
  el.querySelector<HTMLButtonElement>('[data-edit="b"]')!.click()
  expect(a.editer).toHaveBeenCalledWith(amis[1])
  expect(a.changerSelection).not.toHaveBeenCalled()
})

test('choisir une puce de groupe coche ses membres encore présents', () => {
  const el = document.createElement('div')
  const a = actions()
  rendreAmis(el, { amis, groupes: [{ id: 'g', nom: 'Sud', amis: ['b', 'disparu'] }], selection: new Set() }, a)
  el.querySelector<HTMLButtonElement>('[data-groupe="g"]')!.click()
  expect(a.changerSelection).toHaveBeenCalledWith(['b'])
})

test('sans groupe enregistré, pas de puce « Tout le monde » en doublon de « Tous »', () => {
  const el = document.createElement('div')
  rendreAmis(el, { amis, groupes: [], selection: new Set(['a', 'b']) }, actions())
  expect(el.querySelector('[data-groupe=""]')).toBeNull()
  expect(el.querySelector('[data-action="groupe"]')).not.toBeNull()
})

test('avec des groupes, la puce « Tout le monde » sélectionne tout le monde et se met en avant', () => {
  const el = document.createElement('div')
  const a = actions()
  rendreAmis(el, { amis, groupes: [{ id: 'g', nom: 'Sud', amis: ['b'] }], selection: new Set(['a', 'b']) }, a)
  const tous = el.querySelector<HTMLButtonElement>('[data-groupe=""]')!
  expect(tous.textContent).toBe('Tout le monde')
  expect(tous.getAttribute('aria-pressed')).toBe('true')
  tous.click()
  expect(a.changerSelection).toHaveBeenCalledWith(['a', 'b'])
})

test('en-tête : nombre de personnes cochées sur le total', () => {
  const el = document.createElement('div')
  rendreAmis(el, { amis, groupes: [], selection: new Set(['a']) }, actions())
  expect(el.querySelector('.compte-amis')!.textContent).toBe('1/2')
})

test('ligne : nom échappé, ville et moyen de transport visibles', () => {
  const el = document.createElement('div')
  rendreAmis(el, { amis, groupes: [], selection: new Set() }, actions())
  expect(el.querySelector('b')).toBeNull()
  expect(el.textContent).toContain('<b>Tom</b>')
  expect(el.textContent).toContain('Lyon')
  expect(el.textContent).toContain('voiture')
})

test('ligne : « calcul en cours » pour un Croco en voiture dont la couche n’est pas encore prête (décision 6)', () => {
  const el = document.createElement('div')
  rendreAmis(el, { amis, groupes: [], selection: new Set(), enCalcul: new Set(['b']) }, actions())
  const ligneTom = el.querySelector<HTMLElement>('.ligne-ami[data-personne="b"]')!
  expect(ligneTom.querySelector('.calcul-en-cours')).not.toBeNull()
  expect(ligneTom.textContent).toContain('calcul en cours')
  const ligneLea = el.querySelector<HTMLElement>('.ligne-ami[data-personne="a"]')!
  expect(ligneLea.querySelector('.calcul-en-cours')).toBeNull()
})

test('les personnes sont regroupées par ville, avec un en-tête qui bascule tout le groupe', () => {
  const el = document.createElement('div')
  const a = actions()
  const paris2: Ami = { id: 'c', nom: 'Zoé', adresse: '3 rue Z 75011 Paris', lat: 48.86, lon: 2.38, transport: 'tc', navigo: false }
  rendreAmis(el, { amis: [...amis, paris2], groupes: [], selection: new Set(['a']) }, a)
  const entetes = [...el.querySelectorAll<HTMLButtonElement>('.bouton-ville')]
  expect(entetes.map((b) => b.dataset.ville)).toEqual(['Lyon', 'Paris'])
  const paris = entetes.find((b) => b.dataset.ville === 'Paris')!
  expect(paris.textContent).toContain('1/2')
  paris.click()
  expect(a.changerSelection).toHaveBeenCalledWith(['a', 'c'])
})

test('libellés : Aucun, + Ajouter un Croco', () => {
  const el = document.createElement('div')
  const a = actions()
  rendreAmis(el, { amis, groupes: [], selection: new Set(['a']) }, a)
  expect(el.querySelector('[data-action="aucun"]')!.textContent).toBe('Aucun')
  cliquer(el, '[data-action="aucun"]')
  expect(a.changerSelection).toHaveBeenCalledWith([])
  const ajouter = el.querySelector<HTMLButtonElement>('[data-action="ajouter"]')!
  expect(ajouter.textContent).toBe('+ Ajouter un Croco')
  ajouter.click()
  expect(a.ajouter).toHaveBeenCalled()
})

test('la recherche n’apparaît qu’au-delà de 8 personnes, filtre par nom ou ville', () => {
  const el = document.createElement('div')
  rendreAmis(el, { amis, groupes: [], selection: new Set() }, actions())
  expect(el.querySelector('#recherche-amis')).toBeNull()

  const beaucoup: Ami[] = Array.from({ length: 9 }, (_, i) => ({
    id: `x${i}`, nom: `Personne ${i}`, adresse: '1 rue A 75001 Paris', lat: 48.85, lon: 2.35, transport: 'tc', navigo: false,
  }))
  const el2 = document.createElement('div')
  rendreAmis(el2, { amis: beaucoup, groupes: [], selection: new Set() }, actions())
  const champ = el2.querySelector<HTMLInputElement>('#recherche-amis')!
  expect(champ).not.toBeNull()
  champ.value = 'personne 3'
  champ.dispatchEvent(new Event('input'))
  expect([...el2.querySelectorAll('.nom-ami')].map((n) => n.textContent)).toEqual(['Personne 3'])
})

test('recherche sans résultat : message dédié', () => {
  const el = document.createElement('div')
  const beaucoup: Ami[] = Array.from({ length: 9 }, (_, i) => ({
    id: `x${i}`, nom: `Personne ${i}`, adresse: '1 rue A 75001 Paris', lat: 48.85, lon: 2.35, transport: 'tc', navigo: false,
  }))
  rendreAmis(el, { amis: beaucoup, groupes: [], selection: new Set() }, actions())
  const champ = el.querySelector<HTMLInputElement>('#recherche-amis')!
  champ.value = 'introuvable'
  champ.dispatchEvent(new Event('input'))
  expect(el.querySelector('.vide')!.textContent).toContain('introuvable')
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

test('filtres : Transports, Voiture, Chacun son moyen (le vol d’oiseau n’est qu’un repli interne, décision 1)', () => {
  const el = document.createElement('div')
  rendreFiltres(el, ETAT_DEFAUT, 2, vi.fn(), vi.fn())
  const modes = [...el.querySelectorAll<HTMLButtonElement>('[data-mode]')].map((b) => b.dataset.mode)
  expect(modes).toEqual(['tc', 'voiture', 'mixte'])
  expect(el.querySelector('[data-mode="tc"]')!.textContent).toBe('Transports')
  expect(el.querySelector('[data-mode="voiture"]')!.textContent).toBe('Voiture')
  expect(el.querySelector('[data-mode="mixte"]')!.textContent).toBe('Chacun son moyen')
  expect(el.querySelector('h1')!.textContent).toContain('entre 2')
  expect(el.querySelector('select')!.hasAttribute('aria-pressed')).toBe(false)
})

test('filtres : bouton Réinitialiser absent quand l’état est déjà par défaut', () => {
  const el = document.createElement('div')
  rendreFiltres(el, ETAT_DEFAUT, 2, vi.fn(), vi.fn())
  expect(el.querySelector('#reinitialiser-filtres')).toBeNull()
})

test('filtres : bouton Réinitialiser présent dès qu’un réglage diffère, et l’appelle au clic', () => {
  const el = document.createElement('div')
  const reinitialiser = vi.fn()
  rendreFiltres(el, { ...ETAT_DEFAUT, mode: 'tc', critere: 'pire' }, 2, vi.fn(), reinitialiser)
  const bouton = el.querySelector<HTMLButtonElement>('#reinitialiser-filtres')!
  expect(bouton).not.toBeNull()
  expect(bouton.className).toContain('secondaire')
  cliquer(el, '#reinitialiser-filtres')
  expect(reinitialiser).toHaveBeenCalledTimes(1)
})

test('filtres : changer de mode garde la durée maximum (même unité)', () => {
  const el = document.createElement('div')
  const changer = vi.fn()
  rendreFiltres(el, { ...ETAT_DEFAUT, max: 300 }, 2, changer, vi.fn())
  cliquer(el, '[data-mode="tc"]')
  expect(changer).toHaveBeenCalledWith({ mode: 'tc' })
  const tc = document.createElement('div')
  rendreFiltres(tc, { ...ETAT_DEFAUT, mode: 'tc' }, 2, changer, vi.fn())
  cliquer(tc, '[data-mode="voiture"]')
  expect(changer).toHaveBeenCalledWith({ mode: 'voiture' })
})

test('filtres : revenir au temps remet les 4 h par défaut', () => {
  const el = document.createElement('div')
  const changer = vi.fn()
  rendreFiltres(el, { ...ETAT_DEFAUT, grandeur: 'prix', max: null }, 2, changer, vi.fn())
  cliquer(el, '[data-grandeur="temps"]')
  expect(changer).toHaveBeenCalledWith({ grandeur: 'temps', max: 240 })
})

test('filtres : le mode reste dans un ordre fixe, aria-pressed reflète l’actif', () => {
  const el = document.createElement('div')
  rendreFiltres(el, { ...ETAT_DEFAUT, mode: 'tc' }, 2, vi.fn(), vi.fn())
  const modes = [...el.querySelectorAll<HTMLButtonElement>('[data-mode]')].map((b) => b.dataset.mode)
  expect(modes).toEqual(['tc', 'voiture', 'mixte'])
  expect(el.querySelector('[data-mode="tc"]')!.getAttribute('aria-pressed')).toBe('true')
  expect(el.querySelector('[data-mode="voiture"]')!.getAttribute('aria-pressed')).toBe('false')
  expect(el.querySelector('[data-mode="mixte"]')!.getAttribute('aria-pressed')).toBe('false')
})

test('filtres : les groupes sont des interrupteurs étiquetés (Mode, Mesure, Critère)', () => {
  const el = document.createElement('div')
  rendreFiltres(el, ETAT_DEFAUT, 2, vi.fn(), vi.fn())
  const groupeMode = el.querySelector('[role="group"][aria-label="Mode"]')!
  expect(groupeMode.querySelector('[data-mode]')).not.toBeNull()
  // ETAT_DEFAUT est en mode mixte : la Mesure (Temps/Prix) s'applique aussi à ce mode.
  expect(el.querySelector('[role="group"][aria-label="Mesure"]')).not.toBeNull()
  const groupeCritere = el.querySelector('[role="group"][aria-label="Critère"]')!
  expect(groupeCritere.querySelector('[data-critere]')).not.toBeNull()
})

test('filtres : Mesure (Temps / Prix) en transports, voiture et mixte, pas à vol d’oiseau', () => {
  const el = document.createElement('div')
  const changer = vi.fn()
  rendreFiltres(el, { ...ETAT_DEFAUT, mode: 'tc', max: 120 }, 2, changer, vi.fn())
  const groupe = el.querySelector('[role="group"][aria-label="Mesure"]')!
  const temps = groupe.querySelector('[data-grandeur="temps"]')!
  const prix = groupe.querySelector('[data-grandeur="prix"]')!
  expect(temps.textContent).toBe('Temps')
  expect(prix.textContent).toBe('Prix')
  expect(temps.getAttribute('aria-pressed')).toBe('true')
  expect(prix.getAttribute('aria-pressed')).toBe('false')
  cliquer(el, '[data-grandeur="prix"]')
  expect(changer).toHaveBeenCalledWith({ grandeur: 'prix', max: null })

  const voiture = document.createElement('div')
  rendreFiltres(voiture, { ...ETAT_DEFAUT, mode: 'voiture' }, 2, vi.fn(), vi.fn())
  expect(voiture.querySelector('[role="group"][aria-label="Mesure"]')).not.toBeNull()

  const oiseau = document.createElement('div')
  rendreFiltres(oiseau, { ...ETAT_DEFAUT, mode: 'oiseau' }, 2, vi.fn(), vi.fn())
  expect(oiseau.querySelector('[role="group"][aria-label="Mesure"]')).toBeNull()
})

test('filtres : « Personnes par voiture » visible seulement en prix, en voiture ou en mixte', () => {
  const enTemps = document.createElement('div')
  rendreFiltres(enTemps, { ...ETAT_DEFAUT, mode: 'voiture', grandeur: 'temps' }, 2, vi.fn(), vi.fn())
  expect(enTemps.querySelector('[role="group"][aria-label="Personnes par voiture"]')).toBeNull()

  const enTransports = document.createElement('div')
  rendreFiltres(enTransports, { ...ETAT_DEFAUT, mode: 'tc', grandeur: 'prix' }, 2, vi.fn(), vi.fn())
  expect(enTransports.querySelector('[role="group"][aria-label="Personnes par voiture"]')).toBeNull()

  const el = document.createElement('div')
  const changer = vi.fn()
  rendreFiltres(el, { ...ETAT_DEFAUT, mode: 'voiture', grandeur: 'prix', personnesParVoiture: 1 }, 2, changer, vi.fn())
  const groupe = el.querySelector('[role="group"][aria-label="Personnes par voiture"]')!
  const boutons = [...groupe.querySelectorAll('button')]
  expect(boutons.map((b) => b.textContent)).toEqual(['1', '2', '3', '4'])
  expect(boutons[0]!.getAttribute('aria-pressed')).toBe('true')
  boutons[2]!.click()
  expect(changer).toHaveBeenCalledWith({ personnesParVoiture: 3 })

  const mixte = document.createElement('div')
  rendreFiltres(mixte, { ...ETAT_DEFAUT, mode: 'mixte', grandeur: 'prix' }, 2, vi.fn(), vi.fn())
  expect(mixte.querySelector('[role="group"][aria-label="Personnes par voiture"]')).not.toBeNull()
})

test('filtres : critère et distance maximum', () => {
  const el = document.createElement('div')
  const changer = vi.fn()
  rendreFiltres(el, { ...ETAT_DEFAUT, mode: 'oiseau', max: null }, 2, changer, vi.fn())
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
  rendreFiltres(el, { ...ETAT_DEFAUT, mode: 'tc', critere: 'pire', max: 180 }, 3, vi.fn(), vi.fn())
  const select = el.querySelector('select')!
  expect(select.getAttribute('aria-label')).toBe('Durée maximum')
  expect(select.options[0]!.textContent).toBe('Durée maximum')
  expect([...select.options].map((o) => o.textContent)).toContain('3 h max')
  expect(select.value).toBe('180')
  expect(el.querySelector('h1')!.textContent).toBe('Où se retrouver entre 3 Crocos')
  expect(el.querySelector('.sous-titre')!.textContent).toBe(
    'En transports, au pire trajet le plus court, sans que personne ne dépasse 3 h',
  )

  const prix = document.createElement('div')
  rendreFiltres(prix, { ...ETAT_DEFAUT, mode: 'tc', grandeur: 'prix', max: null }, 3, vi.fn(), vi.fn())
  const menu = prix.querySelector('select')!
  expect(menu.getAttribute('aria-label')).toBe('Prix maximum')
  expect([...menu.options].map((o) => o.textContent)).toContain('40 € max')
  expect(prix.querySelector('.sous-titre')!.textContent).toContain('En transports')
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
const oiseau = { unite: 'km', mode: 'oiseau', critere: 'pire' } as const
const transports = { unite: 'min', mode: 'tc', critere: 'pire' } as const

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

test('critère « pire » actif : le pire trajet est mis en avant, le total en texte simple', () => {
  const el = document.createElement('div')
  rendreVilles(el, { villes: [classee], amis, nbPersonnes: 2, max: null, ...oiseau, critere: 'pire' }, actionsVilles())
  const pastilleVerte = el.querySelector('.valeur')!
  expect(pastilleVerte.textContent).toBe('Pire trajet 270 km')
  expect(el.textContent).toContain('Total 440 km')
})

test('critère « moyenne » actif : la moyenne est mise en avant, le pire trajet en texte simple', () => {
  const el = document.createElement('div')
  rendreVilles(el, { villes: [classee], amis, nbPersonnes: 2, max: null, ...oiseau, critere: 'moyenne' }, actionsVilles())
  const pastilleVerte = el.querySelector('.valeur')!
  expect(pastilleVerte.textContent).toBe('Moyenne 220 km')
  expect(el.textContent).toContain('Pire trajet 270 km')
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
  rendreVilles(el, { villes: [], amis, nbPersonnes: 2, max: 40, unite: 'eur', mode: 'tc', critere: 'pire' }, actionsVilles())
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

test('filtres : « Copier le lien » porte le lien de la vue en cours et appelle partager', () => {
  const el = document.createElement('div')
  const partager = vi.fn()
  rendreFiltres(el, { ...ETAT_DEFAUT, mode: 'tc', critere: 'pire' }, 2, vi.fn(), vi.fn(), partager)
  const bouton = el.querySelector<HTMLButtonElement>('#copier-lien')!
  expect(bouton.textContent).toBe('Copier le lien')
  expect(bouton.dataset.lien).toContain('mode=tc')
  expect(bouton.dataset.lien).toContain('critere=pire')
  bouton.click()
  expect(partager).toHaveBeenCalledWith(bouton.dataset.lien)
})

test('tiroir : les étapes détaillées d’une personne se déplient sous son nom', () => {
  const el = document.createElement('div')
  const details = enTrain.parAmi.map((d, i) => (i === 0 ? { ...d, etapes: () => ['22 min à pied jusqu’à Marseille Saint-Charles', '3 h de train : Marseille Saint-Charles → Paris Gare de Lyon'] } : d))
  rendreResultatLieu(el, marseille, amis, details, 'min', vi.fn())
  const tiroir = el.querySelector('details.tiroir')!
  expect(tiroir.querySelector('summary .precision')!.textContent).toBe('Marseille Saint-Charles → Paris Gare de Lyon')
  expect([...tiroir.querySelectorAll('.etapes li')].map((li) => li.textContent)).toEqual([
    '22 min à pied jusqu’à Marseille Saint-Charles',
    '3 h de train : Marseille Saint-Charles → Paris Gare de Lyon',
  ])
  expect(el.querySelectorAll('details.tiroir')).toHaveLength(1)
})
