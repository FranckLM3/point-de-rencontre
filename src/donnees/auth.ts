import { supabase } from './supabase'

const HTTP_TROP_DE_REQUETES = 429
const HTTP_IDENTIFIANTS_INVALIDES = 400
const CODE_IDENTIFIANTS_INVALIDES = 'invalid_credentials'

export async function estConnecte(): Promise<boolean> {
  const { data } = await supabase().auth.getSession()
  return data.session !== null
}

/** Rend un message d'erreur lisible, ou null si la connexion a réussi. */
export async function connecter(motDePasse: string): Promise<string | null> {
  const email = import.meta.env.VITE_COMPTE_EMAIL
  if (!email) throw new Error('Configuration absente : VITE_COMPTE_EMAIL.')
  const { error } = await supabase().auth.signInWithPassword({ email, password: motDePasse })
  if (!error) return null
  if (error.status === HTTP_TROP_DE_REQUETES) return 'Trop de tentatives, réessaie dans quelques minutes.'
  if (error.status === HTTP_IDENTIFIANTS_INVALIDES || error.code === CODE_IDENTIFIANTS_INVALIDES) {
    return 'Mot de passe incorrect.'
  }
  console.error('Échec de connexion Supabase :', error)
  return 'Connexion impossible. Vérifie ta connexion et réessaie.'
}

export async function deconnecter(): Promise<void> {
  const { error } = await supabase().auth.signOut()
  if (!error) return
  console.error('Échec de déconnexion Supabase :', error)
  throw new Error('Déconnexion impossible. Réessaie.')
}

const LONGUEUR_MIN = 8

export type RetourEmail = { type: 'reinitialisation' } | { type: 'erreur'; message: string }

/**
 * Lien reçu par e-mail (« mot de passe oublié ») : Supabase revient sur la page avec l'issue dans
 * le fragment de l'adresse. À lire avant la première requête Supabase, qui consomme ce fragment.
 */
export function lireRetourEmail(fragment: string): RetourEmail | null {
  const p = new URLSearchParams(fragment.replace(/^#/, ''))
  if (p.get('type') === 'recovery' && p.get('access_token')) return { type: 'reinitialisation' }
  if (p.get('error')) return { type: 'erreur', message: 'Ce lien a expiré ou a déjà servi. Redemande un e-mail de réinitialisation.' }
  return null
}

/** Nouveau mot de passe du compte du groupe (session ouverte par le lien) ; message d'erreur ou null. */
export async function changerMotDePasse(motDePasse: string): Promise<string | null> {
  const { error } = await supabase().auth.updateUser({ password: motDePasse })
  if (!error) return null
  if (error.code === 'weak_password') return `Mot de passe trop faible : ${LONGUEUR_MIN} caractères au moins.`
  if (error.code === 'same_password') return 'C’est déjà le mot de passe actuel.'
  console.error('Échec du changement de mot de passe :', error.status, error.code)
  return 'Changement impossible. Réessaie ou redemande un e-mail.'
}
