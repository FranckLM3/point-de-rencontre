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
  if (error) throw new Error(`Impossible de se déconnecter : ${error.message}`)
}
