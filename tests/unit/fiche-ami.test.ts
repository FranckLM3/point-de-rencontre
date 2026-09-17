import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { Ami, Lieu } from '../../src/types'

const chercherAdresses = vi.fn<(texte: string) => Promise<Lieu[]>>()
vi.mock('../../src/donnees/geocodage', () => ({ LONGUEUR_MIN: 3, chercherAdresses: (t: string) => chercherAdresses(t) }))

const { ouvrirFicheAmi } = await import('../../src/ui/fiche-ami')

beforeEach(() => { chercherAdresses.mockReset() })
afterEach(() => { document.body.innerHTML = '' })

const lea: Ami = { id: 'a', nom: 'Léa', adresse: '10 Rue de Rivoli 75004 Paris', lat: 48.8555, lon: 2.36041, transport: 'voiture', navigo: false }

const $ = <T extends Element>(sel: string): T => document.querySelector<T>(sel)!
const soumettre = () => $('form').dispatchEvent(new Event('submit'))
const boutonEnregistrer = () => $<HTMLButtonElement>('button[type="submit"]')
const boutonSupprimer = () => $<HTMLButtonElement>('[data-action="supprimer"]')

function differe<T>() {
  let resoudre!: (v: T) => void
  let rejeter!: (e: Error) => void
  const promesse = new Promise<T>((ok, ko) => { resoudre = ok; rejeter = ko })
  return { promesse, resoudre, rejeter }
}

test('titres : « Ajouter une personne » et « Modifier une personne »', () => {
  ouvrirFicheAmi(null, { enregistrer: vi.fn() })
  expect($('h2').textContent).toBe('Ajouter une personne')
  expect(document.querySelector('[data-action="supprimer"]')).toBeNull()
  document.body.innerHTML = ''
  ouvrirFicheAmi(lea, { enregistrer: vi.fn(), supprimer: vi.fn() })
  expect($('h2').textContent).toBe('Modifier une personne')
  expect(document.querySelector('[aria-pressed]')).toBeNull()
})

test('modifier garde l’adresse et envoie le moyen de transport choisi', async () => {
  const enregistrer = vi.fn().mockResolvedValue(undefined)
  ouvrirFicheAmi(lea, { enregistrer })
  $<HTMLInputElement>('input[name="transport"][value="tc"]').checked = true
  soumettre()
  await vi.waitFor(() => expect(enregistrer).toHaveBeenCalledOnce())
  expect(enregistrer.mock.calls[0]![0]).toMatchObject({ nom: 'Léa', transport: 'tc', lat: 48.8555 })
  await vi.waitFor(() => expect(document.querySelector('.feuille')).toBeNull())
})

test('nouvelle personne sans adresse choisie : refus avec message', () => {
  const enregistrer = vi.fn()
  ouvrirFicheAmi(null, { enregistrer })
  $<HTMLInputElement>('input[name="nom"]').value = 'Tom'
  soumettre()
  expect(enregistrer).not.toHaveBeenCalled()
  expect($('.feuille .erreur').textContent).toContain('adresse')
})

test('enregistrement en cours : bouton désactivé, puis texte rendu après une erreur', async () => {
  const attente = differe<void>()
  const enregistrer = vi.fn(() => attente.promesse)
  ouvrirFicheAmi(lea, { enregistrer })
  soumettre()
  expect(boutonEnregistrer().disabled).toBe(true)
  expect(boutonEnregistrer().textContent).toBe('Enregistrement…')

  soumettre()
  expect(enregistrer).toHaveBeenCalledOnce()

  attente.rejeter(new Error('Réseau indisponible.'))
  await vi.waitFor(() => expect(boutonEnregistrer().disabled).toBe(false))
  expect(boutonEnregistrer().textContent).toBe('Enregistrer')
  expect($('.feuille .erreur').textContent).toBe('Réseau indisponible.')
  expect(document.querySelector('.feuille')).not.toBeNull()
})

test('supprimer demande deux clics, sans boîte de dialogue du navigateur', async () => {
  const confirmer = vi.spyOn(window, 'confirm')
  const supprimer = vi.fn().mockResolvedValue(undefined)
  ouvrirFicheAmi(lea, { enregistrer: vi.fn(), supprimer })

  boutonSupprimer().click()
  expect(supprimer).not.toHaveBeenCalled()
  expect(boutonSupprimer().textContent).toBe('Confirmer la suppression')
  expect(boutonSupprimer().classList.contains('danger')).toBe(true)

  boutonSupprimer().click()
  await vi.waitFor(() => expect(supprimer).toHaveBeenCalledOnce())
  await vi.waitFor(() => expect(document.querySelector('.feuille')).toBeNull())
  expect(confirmer).not.toHaveBeenCalled()
})

test('Échap ferme la fiche sans supprimer', () => {
  const supprimer = vi.fn()
  ouvrirFicheAmi(lea, { enregistrer: vi.fn(), supprimer })
  boutonSupprimer().click()
  $('.feuille').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  expect(document.querySelector('.feuille')).toBeNull()
  expect(supprimer).not.toHaveBeenCalled()
})

test('annuler ferme la fiche', () => {
  ouvrirFicheAmi(lea, { enregistrer: vi.fn() })
  $<HTMLButtonElement>('[data-action="annuler"]').click()
  expect(document.querySelector('.feuille')).toBeNull()
})

test('recherche sans résultat : invite à ajouter le code postal', async () => {
  chercherAdresses.mockResolvedValue([])
  ouvrirFicheAmi(null, { enregistrer: vi.fn() })
  const adresse = $<HTMLInputElement>('input[name="adresse"]')
  adresse.value = 'rue introuvable'
  adresse.dispatchEvent(new Event('input'))
  await vi.waitFor(() => expect($('.feuille .aide').textContent).toBe('Aucune adresse trouvée. Ajoute le code postal.'))
  expect(chercherAdresses).toHaveBeenCalledWith('rue introuvable')
})

test('texte trop court : aucune invite', async () => {
  chercherAdresses.mockResolvedValue([])
  ouvrirFicheAmi(null, { enregistrer: vi.fn() })
  const adresse = $<HTMLInputElement>('input[name="adresse"]')
  adresse.value = 'ru'
  adresse.dispatchEvent(new Event('input'))
  await new Promise((r) => setTimeout(r, 400))
  expect($('.feuille .aide').textContent).toBe('')
})

test('choisir une proposition permet d’enregistrer la nouvelle personne', async () => {
  chercherAdresses.mockResolvedValue([{ label: '1 Place Bellecour 69002 Lyon', lat: 45.757, lon: 4.832 }])
  const enregistrer = vi.fn().mockResolvedValue(undefined)
  ouvrirFicheAmi(null, { enregistrer })
  $<HTMLInputElement>('input[name="nom"]').value = 'Tom'
  const adresse = $<HTMLInputElement>('input[name="adresse"]')
  adresse.value = 'bellecour'
  adresse.dispatchEvent(new Event('input'))
  await vi.waitFor(() => expect(document.querySelector('.propositions button')).not.toBeNull())
  $<HTMLButtonElement>('.propositions button').click()
  expect(adresse.value).toBe('1 Place Bellecour 69002 Lyon')
  soumettre()
  await vi.waitFor(() => expect(enregistrer).toHaveBeenCalledOnce())
  expect(enregistrer.mock.calls[0]![0]).toMatchObject({ nom: 'Tom', lat: 45.757, transport: 'tc', navigo: false })
})
