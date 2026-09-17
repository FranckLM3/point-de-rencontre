import { supabase } from './supabase'

const HTTP_TROP_DE_REQUETES = 429

export async function estConnecte(): Promise<boolean> {
  const { data } = await supabase().auth.getSession()
  return data.session !== null
}

/** Rend un message d'erreur lisible, ou null si la connexion a réussi. */
export async function connecter(motDePasse: string): Promise<string | null> {
  const email = import.meta.env.VITE_COMPTE_EMAIL
  const { error } = await supabase().auth.signInWithPassword({ email, password: motDePasse })
  if (!error) return null
  return error.status === HTTP_TROP_DE_REQUETES ? 'Trop de tentatives, réessaie dans quelques minutes.' : 'Mot de passe incorrect.'
}

export async function deconnecter(): Promise<void> {
  await supabase().auth.signOut()
}
