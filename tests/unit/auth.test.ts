import { afterEach, beforeEach, expect, test, vi } from 'vitest'

const signInWithPassword = vi.fn()
const signOut = vi.fn()
const updateUser = vi.fn()
vi.mock('../../src/donnees/supabase', () => ({
  supabase: () => ({ auth: { signInWithPassword, signOut, updateUser } }),
}))

const { changerMotDePasse, connecter, deconnecter, lireRetourEmail } = await import('../../src/donnees/auth')

beforeEach(() => {
  signInWithPassword.mockReset()
  signOut.mockReset()
  vi.stubEnv('VITE_COMPTE_EMAIL', 'groupe@exemple.fr')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

test('mot de passe correct : aucune erreur', async () => {
  signInWithPassword.mockResolvedValue({ error: null })
  expect(await connecter('bon')).toBeNull()
})

test('code invalid_credentials : « Mot de passe incorrect. »', async () => {
  signInWithPassword.mockResolvedValue({ error: { status: 400, code: 'invalid_credentials', message: 'Invalid login credentials' } })
  expect(await connecter('faux')).toBe('Mot de passe incorrect.')
})

test('statut 400 sans code explicite : « Mot de passe incorrect. »', async () => {
  signInWithPassword.mockResolvedValue({ error: { status: 400, message: 'Bad request' } })
  expect(await connecter('faux')).toBe('Mot de passe incorrect.')
})

test('429 garde son message dédié', async () => {
  signInWithPassword.mockResolvedValue({ error: { status: 429, message: 'Too many requests' } })
  expect(await connecter('faux')).toBe('Trop de tentatives, réessaie dans quelques minutes.')
})

test('erreur réseau (statut indéfini) : message de connexion impossible', async () => {
  signInWithPassword.mockResolvedValue({ error: { status: undefined, message: 'Failed to fetch' } })
  expect(await connecter('faux')).toBe('Connexion impossible. Vérifie ta connexion et réessaie.')
})

test('statut 0 : message de connexion impossible', async () => {
  signInWithPassword.mockResolvedValue({ error: { status: 0, message: 'Network error' } })
  expect(await connecter('faux')).toBe('Connexion impossible. Vérifie ta connexion et réessaie.')
})

test('erreur 5xx : message de connexion impossible', async () => {
  signInWithPassword.mockResolvedValue({ error: { status: 503, message: 'Service unavailable' } })
  expect(await connecter('faux')).toBe('Connexion impossible. Vérifie ta connexion et réessaie.')
})

test('VITE_COMPTE_EMAIL absent : erreur de configuration', async () => {
  vi.stubEnv('VITE_COMPTE_EMAIL', '')
  await expect(connecter('bon')).rejects.toThrow('Configuration absente : VITE_COMPTE_EMAIL.')
  expect(signInWithPassword).not.toHaveBeenCalled()
})

test('deconnecter réussit sans erreur', async () => {
  signOut.mockResolvedValue({ error: null })
  await expect(deconnecter()).resolves.toBeUndefined()
})

test('deconnecter relance un message lisible sans le texte brut de Supabase', async () => {
  const journal = vi.spyOn(console, 'error').mockImplementation(() => {})
  signOut.mockResolvedValue({ error: { message: 'Session absente' } })
  const echec = await deconnecter().catch((e: Error) => e)
  expect((echec as Error).message).toBe('Déconnexion impossible. Réessaie.')
  expect(journal).toHaveBeenCalledWith('Échec de déconnexion Supabase :', { message: 'Session absente' })
  journal.mockRestore()
})

test('retour d’e-mail : lien de réinitialisation, lien expiré, ou rien', () => {
  expect(lireRetourEmail('#access_token=abc&expires_in=3600&refresh_token=r&token_type=bearer&type=recovery')).toEqual({ type: 'reinitialisation' })
  expect(lireRetourEmail('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'))
    .toEqual({ type: 'erreur', message: 'Ce lien a expiré ou a déjà servi. Redemande un e-mail de réinitialisation.' })
  expect(lireRetourEmail('')).toBeNull()
  expect(lireRetourEmail('#autre=1')).toBeNull()
})

test('changer le mot de passe : succès, mot de passe trop faible, autre erreur', async () => {
  updateUser.mockResolvedValueOnce({ error: null })
  expect(await changerMotDePasse('Crocodiles-2026')).toBeNull()
  expect(updateUser).toHaveBeenCalledWith({ password: 'Crocodiles-2026' })
  updateUser.mockResolvedValueOnce({ error: { status: 422, code: 'weak_password', message: 'weak' } })
  expect(await changerMotDePasse('a')).toBe('Mot de passe trop faible : 8 caractères au moins.')
  updateUser.mockResolvedValueOnce({ error: { status: 422, code: 'same_password', message: 'same' } })
  expect(await changerMotDePasse('x')).toBe('C’est déjà le mot de passe actuel.')
  vi.spyOn(console, 'error').mockImplementation(() => {})
  updateUser.mockResolvedValueOnce({ error: { status: 500, message: 'boom' } })
  expect(await changerMotDePasse('x')).toBe('Changement impossible. Réessaie ou redemande un e-mail.')
})
