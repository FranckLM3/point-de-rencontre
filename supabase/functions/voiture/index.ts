// Fonction Edge `voiture` : calcule, pour un Croco, les temps et distances en
// voiture vers chaque point de la grille de 8 km, via la matrice OpenRouteService,
// et les écrit dans `public.temps` (couche 'voiture').
//
// Entrée : POST { ami_id }, jeton de l'utilisateur connecté (vérifié par
// supabase.auth.getUser), sinon 401. Ne journalise jamais d'adresse ni de
// coordonnées (seulement l'identifiant de l'ami).
import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  assemblerResultats,
  calculerCle,
  corpsMatrice,
  decouperEnPaquets,
  encoderCouche,
  versBytea,
  type Point,
} from './encodage.ts'
import { enTetesCors } from './cors.ts'

/** Bumper si le générateur ou le pas de la grille de 8 km change : force le recalcul de toutes les couches. */
const VERSION_GRILLE = 'grille-8km-v1'
const COUCHE = 'voiture'
const GRILLE_URL_DEFAUT = 'https://francklm3.github.io/point-de-rencontre/data/grille-8km.json'
const URL_MATRICE_ORS = 'https://api.openrouteservice.org/v2/matrix/driving-car'
const HTTP_TROP_DE_REQUETES = 429
const MESSAGE_QUOTA = 'Trop de calculs de trajets en ce moment (quota OpenRouteService atteint) : réessaie plus tard.'
const MESSAGE_RESEAU = 'Le calcul des temps en voiture a échoué (problème réseau).'

function reponse(corps: unknown, status = 200): Response {
  return new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } })
}

interface GrilleBrute {
  lon0: number
  lat0: number
  pasLon: number
  pasLat: number
  nx: number
  ny: number
  dedans: string
}

/** Points en France, dans l'ordre où `dedans` les liste (même ordre que la couche stockée). */
function pointsEnFrance(brut: GrilleBrute): Point[] {
  const octets = Uint8Array.from(atob(brut.dedans), (c) => c.charCodeAt(0))
  const points: Point[] = []
  for (let i = 0; i < octets.length; i++) {
    if (octets[i] !== 1) continue
    const colonne = i % brut.nx
    const ligne = Math.floor(i / brut.nx)
    points.push({ lon: brut.lon0 + colonne * brut.pasLon, lat: brut.lat0 + ligne * brut.pasLat })
  }
  return points
}

interface ReponseMatrice {
  durations?: (number | null)[][]
  distances?: (number | null)[][]
}

Deno.serve(async (req: Request) => {
  const cors = enTetesCors(req.headers.get('Origin'))
  // Contrôle préalable du navigateur : sans réponse positive, l'appel réel n'est jamais envoyé.
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const res = await traiter(req)
  for (const [nom, valeur] of Object.entries(cors)) res.headers.set(nom, valeur)
  return res
})

async function traiter(req: Request): Promise<Response> {
  if (req.method !== 'POST') return reponse({ erreur: 'Méthode non supportée.' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const orsCle = Deno.env.get('ORS_CLE')
  const grilleUrl = Deno.env.get('GRILLE_URL') ?? GRILLE_URL_DEFAUT
  if (!supabaseUrl || !anonKey || !serviceKey || !orsCle) {
    console.error('voiture : configuration serveur incomplète (URL, clés ou ORS_CLE manquants).')
    return reponse({ erreur: 'Configuration serveur incomplète.' }, 500)
  }

  const autorisation = req.headers.get('Authorization')
  if (!autorisation) return reponse({ erreur: 'Non authentifié.' }, 401)
  const client = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: autorisation } } })
  const {
    data: { user },
    error: erreurUtilisateur,
  } = await client.auth.getUser()
  if (erreurUtilisateur || !user) return reponse({ erreur: 'Non authentifié.' }, 401)

  let corpsRequete: { ami_id?: unknown }
  try {
    corpsRequete = (await req.json()) as { ami_id?: unknown }
  } catch {
    return reponse({ erreur: 'Corps de requête invalide.' }, 400)
  }
  const amiId = corpsRequete.ami_id
  if (typeof amiId !== 'string' || amiId.length === 0) return reponse({ erreur: 'ami_id manquant.' }, 400)

  // Clé de service : seule la fonction écrit dans `temps` (RLS ferme l'écriture côté client).
  const admin = createClient(supabaseUrl, serviceKey)

  const { data: ami, error: erreurAmi } = await admin.from('amis').select('lat, lon').eq('id', amiId).single()
  if (erreurAmi || !ami) {
    console.error(`voiture : ami ${amiId} introuvable.`)
    return reponse({ erreur: 'Personne introuvable.' }, 404)
  }

  const cle = calculerCle(ami.lat as number, ami.lon as number, VERSION_GRILLE)
  const { data: existant } = await admin.from('temps').select('cle').eq('ami_id', amiId).eq('couche', COUCHE).maybeSingle()
  if (existant?.cle === cle) return reponse({ etat: 'a_jour' })

  let grilleBrute: GrilleBrute
  try {
    const reponseGrille = await fetch(grilleUrl)
    if (!reponseGrille.ok) throw new Error(`HTTP ${reponseGrille.status}`)
    grilleBrute = (await reponseGrille.json()) as GrilleBrute
  } catch (e) {
    console.error(`voiture : grille indisponible (ami ${amiId})`, e)
    return reponse({ erreur: 'Grille indisponible.' }, 502)
  }

  const points = pointsEnFrance(grilleBrute)
  const paquets = decouperEnPaquets(points.length)
  const personne: Point = { lon: ami.lon as number, lat: ami.lat as number }

  const resultats: { paquet: (typeof paquets)[number]; durations: (number | null)[]; distances: (number | null)[] }[] = []
  for (const paquet of paquets) {
    let res: Response
    try {
      res = await fetch(URL_MATRICE_ORS, {
        method: 'POST',
        headers: { Authorization: orsCle, 'Content-Type': 'application/json' },
        body: JSON.stringify(corpsMatrice(personne, points, paquet)),
      })
    } catch (e) {
      console.error(`voiture : réseau ORS (ami ${amiId})`, e)
      return reponse({ erreur: MESSAGE_RESEAU }, 502)
    }
    if (res.status === HTTP_TROP_DE_REQUETES) {
      console.error(`voiture : quota ORS atteint (ami ${amiId})`)
      return reponse({ erreur: MESSAGE_QUOTA }, HTTP_TROP_DE_REQUETES)
    }
    if (!res.ok) {
      console.error(`voiture : ORS HTTP ${res.status} (ami ${amiId})`)
      return reponse({ erreur: MESSAGE_RESEAU }, 502)
    }
    const corpsMatriceRecu = (await res.json()) as ReponseMatrice
    resultats.push({
      paquet,
      durations: corpsMatriceRecu.durations?.[0] ?? [],
      distances: corpsMatriceRecu.distances?.[0] ?? [],
    })
  }

  const { minutes, km } = assemblerResultats(points.length, resultats)
  const encode = encoderCouche(minutes, km)
  const { error: erreurEcriture } = await admin.from('temps').upsert({
    ami_id: amiId,
    couche: COUCHE,
    cle,
    minutes: versBytea(encode.minutes),
    km: versBytea(encode.km),
    maj_le: new Date().toISOString(),
  })
  if (erreurEcriture) {
    console.error(`voiture : échec de l’écriture (ami ${amiId})`, erreurEcriture)
    return reponse({ erreur: 'Échec de l’enregistrement.' }, 500)
  }

  return reponse({ etat: 'calcule' })
}
