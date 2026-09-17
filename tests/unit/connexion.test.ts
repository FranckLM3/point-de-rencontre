import { afterEach, expect, test, vi } from 'vitest'
import { afficherConnexion } from '../../src/ui/connexion'

afterEach(() => { document.body.innerHTML = '' })

test('affiche l’erreur puis appelle succes quand le mot de passe est bon', async () => {
  const racine = document.createElement('div')
  const connecter = vi.fn().mockResolvedValueOnce('Mot de passe incorrect.').mockResolvedValueOnce(null)
  const succes = vi.fn()
  afficherConnexion(racine, connecter, succes)

  const champ = racine.querySelector('input')!
  const form = racine.querySelector('form')!
  champ.value = 'faux'
  form.dispatchEvent(new Event('submit'))
  await vi.waitFor(() => expect(racine.textContent).toContain('Mot de passe incorrect.'))
  expect(succes).not.toHaveBeenCalled()

  champ.value = 'bon'
  form.dispatchEvent(new Event('submit'))
  await vi.waitFor(() => expect(succes).toHaveBeenCalledOnce())
  expect(connecter).toHaveBeenLastCalledWith('bon')
})

test('le bouton s’appelle « Ouvrir la carte » et le champ a un libellé visible', () => {
  const racine = document.createElement('div')
  afficherConnexion(racine, vi.fn(), vi.fn())
  expect(racine.querySelector('button[type="submit"]')!.textContent).toBe('Ouvrir la carte')
  expect(racine.querySelector('label[for="mdp"]')!.textContent).toBe('Mot de passe du groupe')
})

test('le bouton est désactivé pendant la connexion puis réactivé après un refus', async () => {
  const racine = document.createElement('div')
  let repondre: (m: string | null) => void = () => {}
  const connecter = vi.fn(() => new Promise<string | null>((r) => { repondre = r }))
  afficherConnexion(racine, connecter, vi.fn())
  const bouton = racine.querySelector<HTMLButtonElement>('button[type="submit"]')!
  racine.querySelector('form')!.dispatchEvent(new Event('submit'))
  expect(bouton.disabled).toBe(true)
  repondre('Mot de passe incorrect.')
  await vi.waitFor(() => expect(bouton.disabled).toBe(false))
  expect(bouton.textContent).toBe('Ouvrir la carte')
})
