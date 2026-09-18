import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { Ami, Lieu } from '../../src/types'

const chercherAdresses = vi.fn<(texte: string) => Promise<Lieu[]>>()
vi.mock('../../src/donnees/geocodage', () => ({ LONGUEUR_MIN: 3, chercherAdresses: (t: string) => chercherAdresses(t) }))

const { ouvrirFicheAmi } = await import('../../src/ui/fiche-ami')

const DELAI_FRAPPE_MS = 250

beforeEach(() => { chercherAdresses.mockReset() })
afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

const lea: Ami = { id: 'a', nom: 'Léa', adresse: '10 Rue de Rivoli 75004 Paris', lat: 48.8555, lon: 2.36041, transport: 'voiture', navigo: false }
const lyon: Lieu = { label: '1 Place Bellecour 69002 Lyon', lat: 45.757, lon: 4.832 }
const brest: Lieu = { label: '1 Rue de Siam 29200 Brest', lat: 48.39, lon: -4.49 }

const $ = <T extends Element>(sel: string): T => document.querySelector<T>(sel)!
const soumettre = () => $('form').dispatchEvent(new Event('submit'))
const boutonEnregistrer = () => $<HTMLButtonElement>('button[type="submit"]')
const boutonSupprimer = () => $<HTMLButtonElement>('[data-action="supprimer"]')
const echap = () => $('.feuille').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
const libelles = () => [...document.querySelectorAll('.propositions button')].map((b) => b.textContent)

function differe<T>() {
  let resoudre!: (v: T) => void
  let rejeter!: (e: Error) => void
  const promesse = new Promise<T>((ok, ko) => { resoudre = ok; rejeter = ko })
  return { promesse, resoudre, rejeter }
}

/** Tape un texte dans le champ adresse et laisse passer le délai de frappe. */
async function taper(texte: string): Promise<void> {
  const adresse = $<HTMLInputElement>('input[name="adresse"]')
  adresse.value = texte
  adresse.dispatchEvent(new Event('input'))
  await vi.advanceTimersByTimeAsync(DELAI_FRAPPE_MS)
}

test('la fiche est un dialogue modal nommé par son titre', () => {
  ouvrirFicheAmi(null, { enregistrer: vi.fn() })
  const dialogue = $<HTMLDialogElement>('dialog.feuille')
  expect(dialogue.open).toBe(true)
  expect(dialogue.getAttribute('aria-labelledby')).toBe('fiche-titre')
  expect($('#fiche-titre').textContent).toBe('Nouveau Croco')
  expect(document.querySelector('[data-action="supprimer"]')).toBeNull()
})

test('titre « Modifier <nom> », sans aria-pressed', () => {
  ouvrirFicheAmi(lea, { enregistrer: vi.fn(), supprimer: vi.fn() })
  expect($('#fiche-titre').textContent).toBe('Modifier Léa')
  expect(document.querySelector('[aria-pressed]')).toBeNull()
})

test('une seconde fiche est refusée tant que la première est ouverte', () => {
  expect(ouvrirFicheAmi(lea, { enregistrer: vi.fn() })).toBe(true)
  expect(ouvrirFicheAmi(null, { enregistrer: vi.fn() })).toBe(false)
  expect(document.querySelectorAll('.feuille')).toHaveLength(1)
})

test('fermer rend le focus à l’élément actif avant l’ouverture', () => {
  const declencheur = document.createElement('button')
  document.body.append(declencheur)
  declencheur.focus()
  ouvrirFicheAmi(lea, { enregistrer: vi.fn() })
  expect(document.activeElement).toBe($('input[name="nom"]'))
  $<HTMLButtonElement>('[data-action="annuler"]').click()
  expect(document.querySelector('.feuille')).toBeNull()
  expect(document.activeElement).toBe(declencheur)
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

test('moyen de transport inconnu : transports en commun par défaut', () => {
  const bizarre = { ...lea, transport: 'velo' } as unknown as Ami
  ouvrirFicheAmi(bizarre, { enregistrer: vi.fn() })
  expect($<HTMLInputElement>('input[name="transport"]:checked').value).toBe('tc')
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

test('Échap et Annuler sont ignorés pendant l’enregistrement', async () => {
  const attente = differe<void>()
  ouvrirFicheAmi(lea, { enregistrer: () => attente.promesse })
  soumettre()
  echap()
  $<HTMLButtonElement>('[data-action="annuler"]').click()
  expect(document.querySelector('.feuille')).not.toBeNull()
  attente.resoudre()
  await vi.waitFor(() => expect(document.querySelector('.feuille')).toBeNull())
})

test('supprimer demande deux clics, sans boîte de dialogue du navigateur', async () => {
  const confirmer = vi.spyOn(window, 'confirm')
  const supprimer = vi.fn().mockResolvedValue(undefined)
  ouvrirFicheAmi(lea, { enregistrer: vi.fn(), supprimer })

  boutonSupprimer().click()
  expect(supprimer).not.toHaveBeenCalled()
  expect(boutonSupprimer().textContent).toBe('Confirmer le retrait')
  expect(boutonSupprimer().classList.contains('danger-texte')).toBe(true)

  boutonSupprimer().click()
  await vi.waitFor(() => expect(supprimer).toHaveBeenCalledOnce())
  await vi.waitFor(() => expect(document.querySelector('.feuille')).toBeNull())
  expect(confirmer).not.toHaveBeenCalled()
})

test('enregistrer désarme la suppression', async () => {
  const attente = differe<void>()
  const supprimer = vi.fn()
  ouvrirFicheAmi(lea, { enregistrer: () => attente.promesse, supprimer })
  boutonSupprimer().click()
  soumettre()
  expect(boutonSupprimer().textContent).toBe('Retirer ce Croco')
  expect(boutonSupprimer().classList.contains('danger-texte')).toBe(false)
  attente.rejeter(new Error('Réseau indisponible.'))
  await vi.waitFor(() => expect(boutonSupprimer().disabled).toBe(false))
  boutonSupprimer().click()
  expect(supprimer).not.toHaveBeenCalled()
})

test('échec de la suppression : message affiché, fiche gardée, bouton réarmable', async () => {
  const supprimer = vi.fn().mockRejectedValue(new Error('Suppression refusée.'))
  ouvrirFicheAmi(lea, { enregistrer: vi.fn(), supprimer })
  boutonSupprimer().click()
  boutonSupprimer().click()
  await vi.waitFor(() => expect($('.feuille .erreur').textContent).toBe('Suppression refusée.'))
  expect(document.querySelector('.feuille')).not.toBeNull()
  expect(boutonSupprimer().disabled).toBe(false)
  expect(boutonSupprimer().textContent).toBe('Retirer ce Croco')
  expect(boutonEnregistrer().disabled).toBe(false)
})

test('Échap ferme la fiche sans supprimer', () => {
  const supprimer = vi.fn()
  ouvrirFicheAmi(lea, { enregistrer: vi.fn(), supprimer })
  boutonSupprimer().click()
  echap()
  expect(document.querySelector('.feuille')).toBeNull()
  expect(supprimer).not.toHaveBeenCalled()
})

test('recherche sans résultat : invite à ajouter le code postal', async () => {
  vi.useFakeTimers()
  chercherAdresses.mockResolvedValue([])
  ouvrirFicheAmi(null, { enregistrer: vi.fn() })
  await taper('rue introuvable')
  expect($('.feuille .aide').textContent).toBe('Aucune adresse trouvée. Ajoute le code postal.')
  expect(chercherAdresses).toHaveBeenCalledWith('rue introuvable')
})

test('texte trop court : aucune invite', async () => {
  vi.useFakeTimers()
  chercherAdresses.mockResolvedValue([])
  ouvrirFicheAmi(null, { enregistrer: vi.fn() })
  await taper('ru')
  expect($('.feuille .aide').textContent).toBe('')
})

test('réponses dans le désordre : seule la dernière recherche s’affiche', async () => {
  vi.useFakeTimers()
  const premiere = differe<Lieu[]>()
  const seconde = differe<Lieu[]>()
  chercherAdresses.mockReturnValueOnce(premiere.promesse).mockReturnValueOnce(seconde.promesse)
  ouvrirFicheAmi(null, { enregistrer: vi.fn() })
  await taper('lyon')
  await taper('brest')
  seconde.resoudre([brest])
  await vi.advanceTimersByTimeAsync(0)
  premiere.resoudre([lyon])
  await vi.advanceTimersByTimeAsync(0)
  expect(libelles()).toEqual([brest.label])
})

test('une réponse en vol ne réaffiche pas la liste après un choix', async () => {
  vi.useFakeTimers()
  const enVol = differe<Lieu[]>()
  chercherAdresses.mockResolvedValueOnce([lyon]).mockReturnValueOnce(enVol.promesse)
  ouvrirFicheAmi(null, { enregistrer: vi.fn() })
  await taper('lyon')
  await taper('lyon bel')
  $<HTMLButtonElement>('.propositions button').click()
  enVol.resoudre([brest])
  await vi.advanceTimersByTimeAsync(0)
  expect(libelles()).toEqual([])
  expect($<HTMLInputElement>('input[name="adresse"]').value).toBe(lyon.label)
})

test('échec de la recherche : message affiché et liste vidée', async () => {
  vi.useFakeTimers()
  chercherAdresses.mockResolvedValueOnce([lyon]).mockRejectedValueOnce(new Error('Recherche indisponible.'))
  ouvrirFicheAmi(null, { enregistrer: vi.fn() })
  await taper('lyon')
  expect(libelles()).toEqual([lyon.label])
  await taper('lyonn')
  expect(libelles()).toEqual([])
  expect($('.feuille .erreur').textContent).toBe('Recherche indisponible.')
})

test('choisir une proposition permet d’enregistrer la nouvelle personne', async () => {
  vi.useFakeTimers()
  chercherAdresses.mockResolvedValue([lyon])
  const enregistrer = vi.fn().mockResolvedValue(undefined)
  ouvrirFicheAmi(null, { enregistrer })
  $<HTMLInputElement>('input[name="nom"]').value = 'Tom'
  await taper('bellecour')
  $<HTMLButtonElement>('.propositions button').click()
  expect($<HTMLInputElement>('input[name="adresse"]').value).toBe(lyon.label)
  soumettre()
  await vi.advanceTimersByTimeAsync(0)
  expect(enregistrer).toHaveBeenCalledOnce()
  expect(enregistrer.mock.calls[0]![0]).toMatchObject({ nom: 'Tom', lat: 45.757, transport: 'tc', navigo: false })
})

test('l’avatar affiche les initiales, mises à jour au fil de la saisie du nom', () => {
  ouvrirFicheAmi(null, { enregistrer: vi.fn() })
  const avatar = $('.avatar-ami.apercu')
  expect(avatar.textContent).toBe('?')
  const champNom = $<HTMLInputElement>('input[name="nom"]')
  champNom.value = 'Zoé'
  champNom.dispatchEvent(new Event('input'))
  expect(avatar.textContent).toBe('ZO')
})

test('choisir une adresse en Île-de-France confirme le choix et révèle Navigo', async () => {
  vi.useFakeTimers()
  const rivoli: Lieu = { label: '10 Rue de Rivoli 75004 Paris', lat: 48.8555, lon: 2.36041 }
  chercherAdresses.mockResolvedValue([rivoli])
  ouvrirFicheAmi(null, { enregistrer: vi.fn() })
  expect($<HTMLLabelElement>('label.navigo').hidden).toBe(true)
  await taper('rivoli')
  $<HTMLButtonElement>('.propositions button').click()
  expect($('.adresse-retenue').textContent).toBe('Adresse retenue : 10 Rue de Rivoli 75004 Paris')
  expect($<HTMLLabelElement>('label.navigo').hidden).toBe(false)
})

test('une adresse hors Île-de-France garde Navigo masqué', async () => {
  vi.useFakeTimers()
  chercherAdresses.mockResolvedValue([brest])
  ouvrirFicheAmi(null, { enregistrer: vi.fn() })
  await taper('siam')
  $<HTMLButtonElement>('.propositions button').click()
  expect($<HTMLLabelElement>('label.navigo').hidden).toBe(true)
})

test('modifier une personne d’Île-de-France affiche Navigo et la confirmation dès l’ouverture', () => {
  ouvrirFicheAmi(lea, { enregistrer: vi.fn(), supprimer: vi.fn() })
  expect($<HTMLLabelElement>('label.navigo').hidden).toBe(false)
  expect($('.adresse-retenue').textContent).toBe('Adresse retenue : 10 Rue de Rivoli 75004 Paris')
})

test('un enregistrement réussi affiche un toast « <nom> modifiée » accessible', async () => {
  const enregistrer = vi.fn().mockResolvedValue(undefined)
  ouvrirFicheAmi(lea, { enregistrer })
  soumettre()
  await vi.waitFor(() => expect(document.querySelector('.toast')).not.toBeNull())
  const toast = document.querySelector('.toast')!
  expect(toast.textContent).toBe('Léa modifiée')
  expect(toast.getAttribute('role')).toBe('status')
})

test('un ajout réussi affiche « <nom> ajoutée »', async () => {
  vi.useFakeTimers()
  chercherAdresses.mockResolvedValue([lyon])
  const enregistrer = vi.fn().mockResolvedValue(undefined)
  ouvrirFicheAmi(null, { enregistrer })
  $<HTMLInputElement>('input[name="nom"]').value = 'Zoé'
  await taper('bellecour')
  $<HTMLButtonElement>('.propositions button').click()
  soumettre()
  await vi.advanceTimersByTimeAsync(0)
  const toast = document.querySelector('.toast')!
  expect(toast.textContent).toBe('Zoé ajoutée')
})
