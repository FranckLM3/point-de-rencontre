import '@fontsource/jost/400.css'
import '@fontsource/jost/500.css'
import '@fontsource/jost/800.css'
import '@fontsource/fredoka/500.css'
import '@fontsource/fredoka/700.css'
import './styles/app.css'
import { agreger, limiterAuMaximum, meilleurIndice } from './calcul/agregat'
import {
  choisirMesure, creerChargeurTc, creerCouches, creerMoteurVoiture, type ChargeurTc, type Couches, type MoteurVoiture,
} from './calcul/couches'
import { coordonnees, type Grille } from './calcul/grille'
import { personnesTrajetCarte } from './calcul/trace'
import { pasTranches, uniteDe } from './calcul/unites'
import { CONSOMMATION_DEFAUT, type Couche, type ParametresPrix } from './calcul/voiture'
import { classerVilles, evaluer, type Mesure, type VilleClassee, villeLaPlusProche } from './calcul/villes'
import { seuils, zones } from './calcul/zones'
import { ajouterAmi, listerAmis, modifierAmi, supprimerAmi } from './donnees/amis'
import { connecter, deconnecter, estConnecte } from './donnees/auth'
import { enregistrerGroupe, listerGroupes } from './donnees/groupes'
import { creerHoraires } from './donnees/horaires'
import { chargerCarburant, chargerGrille, chargerGrille8km, chargerVilles, type PrixCarburant } from './donnees/statiques'
import { chargerCouches, creerFileCalculVoiture, type FileCalculVoiture } from './donnees/voiture'
import { ecrireEtat, lireEtat } from './etat/url'
import type { Ami, Etat, Groupe, Lieu, Mode, Ville } from './types'
import { rendreAmis } from './ui/amis'
import { amisChoisis, cleFocus, cleZones, libelleClic } from './ui/assemblage'
import { creerCarte, type Carte } from './ui/carte'
import { afficherConnexion } from './ui/connexion'
import { prixEtiquette, selectionEtiquettes, valeurEtiquette } from './ui/etiquettes'
import { ouvrirFicheAmi } from './ui/fiche-ami'
import { rendreFiltres } from './ui/filtres'
import { rendreLegende } from './ui/legende'
import { rendreRechercheLieu, rendreResultatLieu, type RechercheLieu } from './ui/lieu'
import { rendreVilles } from './ui/liste-villes'
import { infobulleCentre } from './ui/marqueurs'
import { mascotteCroco } from './ui/mascotte'
import { rendreRepaire, type Repaire } from './ui/repaire'

const NB_VILLES = 20
/** Nombre de grandes villes (population décroissante) offertes en renfort aux étiquettes de la carte (D3). */
const NB_GRANDES_VILLES = 40
const MAX_ETIQUETTES = 32
const TEXTE_CHARGEMENT = 'Chargement de la carte…'
const TEXTE_HORAIRES = 'Chargement des horaires…'
const TEXTE_VOITURE = 'Chargement de la voiture…'
const TEXTE_HORAIRES_ET_VOITURE = 'Chargement des horaires et de la voiture…'
const racine = document.querySelector<HTMLElement>('#app')!

/** Tête de crocodile de la marque, décorative : le nom qui suit la nomme déjà. */
const CROCO = mascotteCroco('croco', 28)

interface Session {
  grille: Grille
  villes: Ville[]
  amis: Ami[]
  groupes: Groupe[]
  etat: Etat
  carte: Carte
  recherche: RechercheLieu
  /** Valeurs de grille par personne, recalculées seulement si la clé change. */
  couches: Couches
  /** Horaires des trains, chargés à la première activation du mode transports. */
  tc: ChargeurTc
  /** Grille de 8 km et prix des carburants, chargés à la première activation du mode voiture ou mixte. */
  voitureBase: { grille8: Grille; carburant: PrixCarburant } | null
  /** Couches voiture déjà calculées, par personne (toutes celles en voiture, pas seulement cochées :
   * sert aussi à l'indicateur « calcul en cours » de la liste, décision 6). */
  voitureCouches: Map<string, Couche>
  /** Augmente à chaque relecture des couches voiture (E4). */
  voitureVersion: number
  /** Un seul calcul voiture à la fois (quota OpenRouteService) ; déclenché depuis la fiche d'une personne. */
  fileVoiture: FileCalculVoiture
  /** Augmente à chaque rendu : un calcul asynchrone périmé est ignoré. */
  rendu: number
  /** Augmente à chaque rechargement des personnes (E4). */
  version: number
  /** Identifiant à mettre brièvement en avant sur la carte (vient d'être ajouté ou modifié) ; consommé au rendu suivant. */
  recemment: string | null
  cleZones: string | null
  /** Résumé du meilleur point, recalculé en même temps que les zones (même clé). */
  repaire: (Repaire & { lat: number; lon: number }) | null
  /** Grandes villes (population décroissante), calculé une fois : renfort des étiquettes de la carte (D3). */
  grandesVilles: Ville[]
  /** Ville choisie (carte de ville ou étiquette cliquée) : lignes vertes et bordure d'accent (D3). */
  villeChoisie: VilleClassee | null
}

const $ = <T extends HTMLElement>(sel: string): T => document.querySelector<T>(sel)!

/** Bandeau d'erreur ; `relancer` ajoute un bouton « Réessayer ». */
function signaler(message: string, relancer?: () => void): void {
  const bandeau = $('#message')
  bandeau.textContent = ''
  if (!message) return
  const texte = document.createElement('span')
  texte.textContent = message
  bandeau.append(texte)
  if (!relancer) return
  const bouton = document.createElement('button')
  bouton.type = 'button'
  bouton.className = 'pastille secondaire'
  bouton.textContent = 'Réessayer'
  bouton.addEventListener('click', relancer)
  bandeau.append(' ', bouton)
}

/** Moteur voiture prêt pour le calcul (mode voiture ou mixte) ; `null` tant que la grille de 8 km
 * et le prix des carburants ne sont pas chargés (première activation de l'un de ces deux modes). */
function voitureMoteur(s: Session): MoteurVoiture | null {
  if (!s.voitureBase) return null
  const parametres: ParametresPrix = {
    consommationL100: CONSOMMATION_DEFAUT, prixLitre: s.voitureBase.carburant.gazole, personnesParVoiture: s.etat.personnesParVoiture,
  }
  return creerMoteurVoiture(s.voitureBase.grille8, parametres, s.voitureCouches, s.voitureVersion)
}

/** Relit les couches voiture déjà calculées pour tous les Crocos en voiture (pas seulement cochés :
 * l'indicateur « calcul en cours » de la liste en a besoin même hors sélection). Best-effort : une
 * erreur ne bloque pas le reste de l'application. */
async function actualiserCouchesVoiture(s: Session, amis: Ami[]): Promise<void> {
  const ids = amis.filter((a) => a.transport === 'voiture').map((a) => a.id)
  try {
    s.voitureCouches = await chargerCouches(ids)
    s.voitureVersion++
  } catch (e) {
    console.error('Couches voiture :', e)
  }
}

/** Personnes en voiture dont la couche n'est pas encore calculée, parmi celles données. */
function personnesEnCalcul(s: Session, amis: Ami[]): Ami[] {
  return amis.filter((a) => a.transport === 'voiture' && !s.voitureCouches.has(a.id))
}

/** En mode voiture, une personne dont la couche n'est pas prête est exclue du calcul (zones, repaire,
 * villes) le temps du calcul ; en mixte elle retombe sur les transports (couches.ts) et reste incluse. */
function calculables(s: Session, choisis: Ami[]): Ami[] {
  if (s.etat.mode !== 'voiture') return choisis
  const enAttente = new Set(personnesEnCalcul(s, choisis).map((a) => a.id))
  return choisis.filter((a) => !enAttente.has(a.id))
}

const PLURIEL = (n: number, singulier: string, pluriel: string): string => (n > 1 ? pluriel : singulier)

/** Bandeau/note « calcul en cours » (décision 6) : exclusion en voiture, repli transports en mixte. */
function avisVoiture(s: Session, choisis: Ami[]): string {
  if (s.etat.mode !== 'voiture' && s.etat.mode !== 'mixte') return ''
  const noms = personnesEnCalcul(s, choisis).map((a) => a.nom)
  if (noms.length === 0) return ''
  const liste = noms.join(', ')
  if (s.etat.mode === 'voiture') {
    return `Calcul du trajet en voiture en cours pour ${liste}. En attendant, la zone est calculée sans ${PLURIEL(noms.length, 'cette personne', 'ces personnes')}.`
  }
  return `Trajet en voiture pas encore calculé pour ${liste} : les transports sont utilisés en attendant.`
}

async function recharger(s: Session): Promise<void> {
  const [amis, groupes] = await Promise.all([listerAmis(), listerGroupes()])
  s.amis = amis
  s.groupes = groupes
  s.version++
  await actualiserCouchesVoiture(s, amis)
  rafraichir(s)
}

function changer(s: Session, p: Partial<Etat>): void {
  s.etat = { ...s.etat, ...p }
  rafraichir(s)
}

function ajouter(s: Session): void {
  ouvrirFicheAmi(null, {
    enregistrer: async (x) => {
      const cree = await ajouterAmi(x)
      s.recemment = cree.id
      await recharger(s)
    },
  })
}

function editer(s: Session, ami: Ami): void {
  ouvrirFicheAmi(ami, {
    enregistrer: async (x) => {
      const maj = await modifierAmi(ami.id, x)
      s.recemment = maj.id
      await recharger(s)
    },
    supprimer: async () => { await supprimerAmi(ami.id); await recharger(s) },
  })
}

function retirerLieu(s: Session): void {
  s.recherche.definir(null)
  changer(s, { lieu: null })
  $('#champ-lieu').focus()
}

/** Cible affichée sur la carte : la ville choisie prime sur un lieu testé (une seule à la fois,
 * pour ne jamais dessiner deux trajets vers le même point, D8). */
function cibleCarte(s: Session): Lieu | null {
  return s.villeChoisie ? { lat: s.villeChoisie.ville.lat, lon: s.villeChoisie.ville.lon, label: s.villeChoisie.ville.nom } : s.etat.lieu
}

/** Dessine les trajets vers la cible : même fonction pour la carte de ville, l'étiquette cliquée
 * sur la carte et le lieu testé (D8, un seul chemin d'appel, une seule couche). */
function dessinerTrajets(s: Session, choisis: Ami[]): void {
  const cible = cibleCarte(s)
  s.carte.trajets(personnesTrajetCarte(choisis, s.etat.mode, s.tc.pret(), voitureMoteur(s), cible), cible)
}

/** Ville choisie (carte de ville ou étiquette cliquée sur la carte) : mêmes lignes vertes dans les deux cas.
 * Dessine directement (pas de rafraîchir complet, qui reconstruirait #villes et refermerait la carte
 * dépliée) ; s.villeChoisie est repris par rendreCarte à chaque rendu suivant pour rester affiché. */
function choisirVille(s: Session, choisis: Ami[], v: VilleClassee): void {
  s.villeChoisie = v
  dessinerTrajets(s, choisis)
}

function rendrePanneau(s: Session, choisis: Ami[], mesure: Mesure, villes: VilleClassee[]): void {
  const enCalcul = new Set(personnesEnCalcul(s, s.amis).map((a) => a.id))
  rendreAmis($('#amis'), { amis: s.amis, groupes: s.groupes, selection: new Set(choisis.map((a) => a.id)), enCalcul }, {
    changerSelection: (ids) => changer(s, { selection: ids }),
    editer: (ami) => editer(s, ami),
    ajouter: () => ajouter(s),
    enregistrerGroupe: async (nom, ids) => {
      await enregistrerGroupe(nom, ids)
      await recharger(s)
    },
  })
  rendreFiltres($('#filtres'), s.etat, choisis.length, (p) => changer(s, p))
  $('#avis-voiture').textContent = avisVoiture(s, choisis)
  const { lieu, mode, critere, max } = s.etat
  const unite = uniteDe(mode, s.etat.grandeur)
  rendreRepaire($('#repaire'), s.repaire, unite, () => {
    if (!s.repaire) return
    s.carte.centrerSur(s.repaire.lat, s.repaire.lon)
    fermerVolet()
  })
  const details = lieu ? choisis.map((a) => mesure(a, lieu.lat, lieu.lon)) : []
  rendreResultatLieu($('#resultat-lieu'), lieu, choisis, details, unite, () => retirerLieu(s))
  rendreVilles($('#villes'), { villes, amis: choisis, nbPersonnes: s.amis.length, max, unite, mode, critere }, {
    choisir: (c) => choisirVille(s, choisis, c),
    ajouter: () => ajouter(s),
  })
}

/** Pire trajet et total exacts au meilleur point, pour la carte « Le repaire » (mêmes règles que classerVilles). */
function calculerRepaire(s: Session, calculables: Ami[], meilleur: number): Session['repaire'] {
  let pire = 0
  let total = 0
  const moteurTc = s.tc.pret()
  const moteurVoiture = voitureMoteur(s)
  for (const a of calculables) {
    const v = s.couches.obtenir(a, s.etat, moteurTc, moteurVoiture)?.[meilleur]
    if (v === undefined) continue
    total += v
    if (v > pire) pire = v
  }
  const [lon, lat] = coordonnees(s.grille, meilleur)
  const proche = villeLaPlusProche(s.villes, lat, lon)
  return { ville: proche?.nom ?? '', pire, total, lat, lon }
}

/** Étiquettes de villes façon Chronotrains (D3) : villes classées d'abord, grandes villes en renfort. */
function rendreEtiquettes(s: Session, choisis: Ami[], calculables: Ami[], villesClassees: VilleClassee[], mesure: Mesure): void {
  const { critere, mode, grandeur } = s.etat
  const unite = uniteDe(mode, grandeur)
  const grandesClassees = classerVilles(s.grandesVilles, calculables, mesure, critere, null, NB_GRANDES_VILLES).sort(
    (a, b) => b.ville.population - a.ville.population,
  )
  const candidats = selectionEtiquettes(villesClassees, grandesClassees, MAX_ETIQUETTES)
  // Ligne de prix même quand le critère actif est le temps : mesure séparée, mais seulement point à
  // point sur les quelques villes déjà retenues (pas de nouveau calcul de grille). Pas à vol d'oiseau.
  const mesurePrix =
    mode !== 'oiseau' && grandeur !== 'prix' ? choisirMesure({ mode, grandeur: 'prix' }, s.tc.pret(), voitureMoteur(s)) : null
  const enrichis = candidats.map((c) => {
    const prixCalc = mesurePrix ? evaluer(c.ville.ville, calculables, mesurePrix) : null
    return { ...c, valeurAffichee: valeurEtiquette(c.ville, critere, unite), prix: prixCalc ? prixEtiquette(prixCalc, critere) : undefined }
  })
  s.carte.etiquettes(enrichis, (v) => choisirVille(s, choisis, v))
}

function rendreZones(s: Session, choisis: Ami[], calculables: Ami[], villesClassees: VilleClassee[], mesure: Mesure): void {
  if (calculables.length === 0) {
    s.carte.zones([])
    s.carte.sansCentre()
    s.carte.etiquettes([], () => {})
    rendreLegende($('#legende'), [])
    s.repaire = null
    return
  }
  const moteurTc = s.tc.pret()
  const moteurVoiture = voitureMoteur(s)
  const couchesCalculables = calculables
    .map((a) => s.couches.obtenir(a, s.etat, moteurTc, moteurVoiture))
    .filter((c): c is Float32Array => c !== null)
  const taille = s.grille.nx * s.grille.ny
  const critereValeurs = agreger(couchesCalculables, s.etat.critere, taille)
  // Le maximum s'applique toujours au pire trajet, quel que soit le critère affiché (décision 4).
  const pireValeurs = s.etat.critere === 'pire' ? critereValeurs : agreger(couchesCalculables, 'pire', taille)
  const valeurs = limiterAuMaximum(critereValeurs, pireValeurs, s.etat.max)
  let plusGrande = 0
  for (const v of valeurs) if (v > plusGrande) plusGrande = v
  const unite = uniteDe(s.etat.mode, s.etat.grandeur)
  const tranches = zones(s.grille, valeurs, seuils(pasTranches(unite), s.etat.max, plusGrande))
  s.carte.zones(tranches)
  rendreLegende($('#legende'), tranches, unite)
  const meilleur = meilleurIndice(valeurs)
  if (meilleur < 0) {
    s.carte.sansCentre()
    s.repaire = null
  } else {
    const [lon, lat] = coordonnees(s.grille, meilleur)
    s.carte.centre(lat, lon, infobulleCentre(valeurs[meilleur]!, s.etat.critere, unite))
    s.repaire = calculerRepaire(s, calculables, meilleur)
  }
  rendreEtiquettes(s, choisis, calculables, villesClassees, mesure)
}

function rendreCarte(s: Session, choisis: Ami[], calculables: Ami[], villesClassees: VilleClassee[], mesure: Mesure): void {
  const ids = choisis.map((a) => a.id)
  s.carte.amis(s.amis, new Set(ids), s.recemment)
  s.recemment = null
  dessinerTrajets(s, choisis)
  const cle = cleZones(s.etat, ids, s.version, s.voitureVersion)
  if (cle === s.cleZones) return
  s.cleZones = cle
  rendreZones(s, choisis, calculables, villesClassees, mesure)
}

function afficher(s: Session, choisis: Ami[], mesure: Mesure, focus: string | null): void {
  const disponibles = calculables(s, choisis)
  const villesClassees = classerVilles(s.villes, disponibles, mesure, s.etat.critere, s.etat.max, NB_VILLES)
  // La carte d'abord : elle recalcule s.repaire (même clé que les zones), lu ensuite par le panneau.
  rendreCarte(s, choisis, disponibles, villesClassees, mesure)
  rendrePanneau(s, choisis, mesure, villesClassees)
  const actif = document.activeElement
  const perdu = !actif || actif === document.body || !actif.isConnected
  if (focus && perdu) $('#panneau').querySelector<HTMLElement>(focus)?.focus()
}

/** Pendant le premier chargement (horaires et/ou grille voiture) : filtres à jour, résultats et zones vidés. */
function attendreChargement(s: Session, choisis: Ami[], texte: string): void {
  rendreFiltres($('#filtres'), s.etat, choisis.length, (p) => changer(s, p))
  $('#chargement').textContent = texte
  $('#villes').textContent = ''
  $('#resultat-lieu').textContent = ''
  s.carte.zones([])
  s.carte.sansCentre()
  s.carte.etiquettes([], () => {})
  rendreLegende($('#legende'), [])
  s.repaire = null
  rendreRepaire($('#repaire'), null, uniteDe(s.etat.mode, s.etat.grandeur), () => {})
  s.cleZones = null
}

/** Repli à vol d'oiseau (décision 1) quand les horaires ou la grille voiture ne se chargent pas :
 * mode mémorisé pour le bouton « Réessayer », qui retente le mode voulu au départ. */
function echecPreparation(s: Session, modeVoulu: Mode, e: unknown): void {
  console.error('Préparation (horaires ou voiture) :', e)
  changer(s, { mode: 'oiseau', max: null })
  signaler(`Estimation à vol d’oiseau : ${(e as Error).message}`, () => changer(s, { mode: modeVoulu, max: null }))
}

function viderChargement(texte: string): void {
  const statut = $('#chargement')
  if (statut.textContent === texte) statut.textContent = ''
}

async function preparerTc(s: Session, choisis: Ami[]): Promise<void> {
  await (await s.tc.obtenir()).preparer(choisis)
}

async function chargerBaseVoiture(): Promise<{ grille8: Grille; carburant: PrixCarburant }> {
  const [grille8, carburant] = await Promise.all([chargerGrille8km(), chargerCarburant()])
  return { grille8, carburant }
}

async function preparerVoitureBase(s: Session): Promise<void> {
  if (s.voitureBase) return
  s.voitureBase = await chargerBaseVoiture()
}

function rafraichir(s: Session): void {
  history.replaceState(null, '', ecrireEtat(s.etat))
  signaler('')
  const rendu = ++s.rendu
  const actif = document.activeElement
  const focus = $('#panneau').contains(actif) ? cleFocus(actif) : null
  const choisis = amisChoisis(s.amis, s.etat.selection)
  const modeVoulu = s.etat.mode
  const besoinTc = modeVoulu === 'tc' || modeVoulu === 'mixte'
  const besoinVoiture = modeVoulu === 'voiture' || modeVoulu === 'mixte'
  if (!besoinTc && !besoinVoiture) {
    viderChargement(TEXTE_HORAIRES)
    viderChargement(TEXTE_VOITURE)
    viderChargement(TEXTE_HORAIRES_ET_VOITURE)
    return afficher(s, choisis, choisirMesure(s.etat, null, null), focus)
  }
  const manqueTc = besoinTc && !s.tc.pret()
  const manqueVoiture = besoinVoiture && !s.voitureBase
  const texteAttente = manqueTc && manqueVoiture ? TEXTE_HORAIRES_ET_VOITURE : manqueTc ? TEXTE_HORAIRES : manqueVoiture ? TEXTE_VOITURE : ''
  if (texteAttente) attendreChargement(s, choisis, texteAttente)
  Promise.all([besoinTc ? preparerTc(s, choisis) : Promise.resolve(), besoinVoiture ? preparerVoitureBase(s) : Promise.resolve()])
    .then(() => {
      if (texteAttente) viderChargement(texteAttente)
      if (rendu === s.rendu) afficher(s, choisis, choisirMesure(s.etat, s.tc.pret(), voitureMoteur(s)), focus)
    })
    .catch((e: unknown) => {
      if (texteAttente) viderChargement(texteAttente)
      if (rendu === s.rendu) echecPreparation(s, modeVoulu, e)
    })
}

const SQUELETTE = `
  <div class="app">
    <aside id="panneau" class="panneau" aria-label="Recherche et résultats">
      <button type="button" id="poignee" aria-expanded="false" aria-controls="panneau">Voir la liste</button>
      <header class="rang entete">
        <strong class="marque">${CROCO}Les Crocos</strong>
        <button type="button" class="pastille secondaire pousse" id="sortir">Se déconnecter</button>
      </header>
      <div id="amis"></div>
      <div id="lieu"></div>
      <div id="resultat-lieu"></div>
      <div id="filtres"></div>
      <div id="repaire"></div>
      <p id="chargement" class="chargement" role="status">${TEXTE_CHARGEMENT}</p>
      <div id="message" class="bandeau erreur" role="alert"></div>
      <p id="avis-voiture" class="bandeau" role="status"></p>
      <div id="villes" class="villes"></div>
    </aside>
    <div class="carte" id="carte" role="region" aria-label="Carte des zones">
      <div id="legende" class="legende" hidden></div>
    </div>
  </div>`

function ouvrirOuFermerVolet(ouvert: boolean): void {
  $('.app').classList.toggle('volet-ouvert', ouvert)
  const poignee = $('#poignee')
  poignee.setAttribute('aria-expanded', String(ouvert))
  poignee.textContent = ouvert ? 'Réduire' : 'Voir la liste'
}

/** Sans effet sur ordinateur (la poignée y est masquée, la classe n'y change rien). */
function fermerVolet(): void {
  ouvrirOuFermerVolet(false)
}

function brancherVolet(): void {
  const app = $('.app')
  const poignee = $('#poignee')
  poignee.addEventListener('click', () => ouvrirOuFermerVolet(!app.classList.contains('volet-ouvert')))
}

function brancherSortie(): void {
  $('#sortir').addEventListener('click', async () => {
    try {
      await deconnecter()
      location.reload()
    } catch (e) {
      signaler((e as Error).message)
    }
  })
}

async function charger(carte: Carte, installer: (s: Session) => void): Promise<void> {
  const statut = $('#chargement')
  statut.textContent = TEXTE_CHARGEMENT
  signaler('')
  try {
    const [grille, villes, amis, groupes] = await Promise.all([chargerGrille(), chargerVilles(), listerAmis(), listerGroupes()])
    const idsVoiture = amis.filter((a) => a.transport === 'voiture').map((a) => a.id)
    const voitureCouches = await chargerCouches(idsVoiture).catch((e: unknown) => {
      console.error('Couches voiture :', e)
      return new Map<string, Couche>()
    })
    const etat = lireEtat(location.search)
    const s: Session = {
      grille, villes, amis, groupes, etat, carte,
      recherche: rendreRechercheLieu($('#lieu'), etat.lieu, (lieu) => changer(s, { lieu })),
      couches: creerCouches(grille),
      tc: creerChargeurTc(creerHoraires),
      voitureBase: null,
      voitureCouches,
      voitureVersion: 1,
      fileVoiture: creerFileCalculVoiture({
        onErreur: (message) => signaler(message),
        onTermine: () => { void actualiserCouchesVoiture(s, s.amis).then(() => rafraichir(s)) },
      }),
      rendu: 0,
      version: 0,
      recemment: null,
      cleZones: null,
      repaire: null,
      grandesVilles: [...villes].sort((a, b) => b.population - a.population).slice(0, NB_GRANDES_VILLES),
      villeChoisie: null,
    }
    installer(s)
    statut.textContent = ''
    rafraichir(s)
  } catch (e) {
    console.error('Échec du chargement :', e)
    statut.textContent = ''
    signaler((e as Error).message, () => void charger(carte, installer))
  }
}

async function demarrer(): Promise<void> {
  racine.innerHTML = SQUELETTE
  brancherVolet()
  brancherSortie()
  const carte = creerCarte($('#carte'))
  carte.isoler($('#legende'))
  let session: Session | null = null
  carte.surClic((lat, lon) => {
    if (!session) return
    const lieu = { lat, lon, label: libelleClic(lat, lon) }
    session.recherche.definir(lieu)
    changer(session, { lieu })
  })
  await charger(carte, (s) => { session = s })
}

async function lancer(): Promise<void> {
  try {
    if (await estConnecte()) return await demarrer()
    afficherConnexion(racine, connecter, () => void demarrer())
  } catch (e) {
    racine.innerHTML = `<p class="bandeau erreur" role="alert"></p>`
    $('.bandeau').textContent = (e as Error).message
  }
}

void lancer()
