import '@fontsource/jost/400.css'
import '@fontsource/jost/500.css'
import '@fontsource/jost/800.css'
import './styles/app.css'
import { agreger, meilleurIndice } from './calcul/agregat'
import { choisirMesure, creerChargeurTc, creerCouches, type ChargeurTc, type Couches } from './calcul/couches'
import { coordonnees, type Grille } from './calcul/grille'
import { pasTranches, uniteDe } from './calcul/unites'
import { classerVilles, type Mesure } from './calcul/villes'
import { seuils, zones } from './calcul/zones'
import { ajouterAmi, listerAmis, modifierAmi, supprimerAmi } from './donnees/amis'
import { connecter, deconnecter, estConnecte } from './donnees/auth'
import { enregistrerGroupe, listerGroupes } from './donnees/groupes'
import { creerHoraires } from './donnees/horaires'
import { chargerGrille, chargerVilles } from './donnees/statiques'
import { ecrireEtat, lireEtat } from './etat/url'
import type { Ami, Etat, Groupe, Ville } from './types'
import { rendreAmis } from './ui/amis'
import { amisChoisis, cleFocus, cleZones, libelleClic } from './ui/assemblage'
import { creerCarte, type Carte } from './ui/carte'
import { afficherConnexion } from './ui/connexion'
import { ouvrirFicheAmi } from './ui/fiche-ami'
import { rendreFiltres } from './ui/filtres'
import { rendreLegende } from './ui/legende'
import { rendreRechercheLieu, rendreResultatLieu, type RechercheLieu } from './ui/lieu'
import { rendreVilles } from './ui/liste-villes'
import { infobulleCentre } from './ui/marqueurs'

const NB_VILLES = 20
const TEXTE_CHARGEMENT = 'Chargement de la carte…'
const TEXTE_HORAIRES = 'Chargement des horaires…'
const racine = document.querySelector<HTMLElement>('#app')!

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
  /** Augmente à chaque rendu : un calcul asynchrone périmé est ignoré. */
  rendu: number
  /** Augmente à chaque rechargement des personnes (E4). */
  version: number
  cleZones: string | null
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

async function recharger(s: Session): Promise<void> {
  const [amis, groupes] = await Promise.all([listerAmis(), listerGroupes()])
  s.amis = amis
  s.groupes = groupes
  s.version++
  rafraichir(s)
}

function changer(s: Session, p: Partial<Etat>): void {
  s.etat = { ...s.etat, ...p }
  rafraichir(s)
}

function ajouter(s: Session): void {
  ouvrirFicheAmi(null, { enregistrer: async (x) => { await ajouterAmi(x); await recharger(s) } })
}

function editer(s: Session, ami: Ami): void {
  ouvrirFicheAmi(ami, {
    enregistrer: async (x) => { await modifierAmi(ami.id, x); await recharger(s) },
    supprimer: async () => { await supprimerAmi(ami.id); await recharger(s) },
  })
}

function retirerLieu(s: Session): void {
  s.recherche.definir(null)
  changer(s, { lieu: null })
  $('#champ-lieu').focus()
}

function rendrePanneau(s: Session, choisis: Ami[], mesure: Mesure): void {
  rendreAmis($('#amis'), { amis: s.amis, groupes: s.groupes, selection: new Set(choisis.map((a) => a.id)) }, {
    changerSelection: (ids) => changer(s, { selection: ids }),
    editer: (ami) => editer(s, ami),
    ajouter: () => ajouter(s),
    enregistrerGroupe: async (nom, ids) => {
      await enregistrerGroupe(nom, ids)
      await recharger(s)
    },
  })
  rendreFiltres($('#filtres'), s.etat, choisis.length, (p) => changer(s, p))
  const { lieu, mode, critere, max } = s.etat
  const unite = uniteDe(mode, s.etat.grandeur)
  const details = lieu ? choisis.map((a) => mesure(a, lieu.lat, lieu.lon)) : []
  rendreResultatLieu($('#resultat-lieu'), lieu, choisis, details, unite, () => retirerLieu(s))
  const villes = classerVilles(s.villes, choisis, mesure, critere, max, NB_VILLES)
  rendreVilles($('#villes'), { villes, amis: choisis, nbPersonnes: s.amis.length, max, unite, mode }, {
    choisir: (c) => s.carte.lignes(choisis, { lat: c.ville.lat, lon: c.ville.lon, label: c.ville.nom }),
    ajouter: () => ajouter(s),
  })
}

function rendreZones(s: Session, choisis: Ami[]): void {
  if (choisis.length === 0) {
    s.carte.zones([])
    s.carte.sansCentre()
    rendreLegende($('#legende'), [])
    return
  }
  const valeurs = agreger(choisis.map((a) => s.couches.obtenir(a, s.etat, s.tc.pret())), s.etat.critere, s.grille.nx * s.grille.ny)
  let plusGrande = 0
  for (const v of valeurs) if (v > plusGrande) plusGrande = v
  const unite = uniteDe(s.etat.mode, s.etat.grandeur)
  const tranches = zones(s.grille, valeurs, seuils(pasTranches(unite), s.etat.max, plusGrande))
  s.carte.zones(tranches)
  rendreLegende($('#legende'), tranches, unite)
  const meilleur = meilleurIndice(valeurs)
  if (meilleur < 0) {
    s.carte.sansCentre()
    return
  }
  const [lon, lat] = coordonnees(s.grille, meilleur)
  s.carte.centre(lat, lon, infobulleCentre(valeurs[meilleur]!, s.etat.critere, unite))
}

function rendreCarte(s: Session, choisis: Ami[]): void {
  const ids = choisis.map((a) => a.id)
  s.carte.amis(s.amis, new Set(ids))
  s.carte.lignes(choisis, s.etat.lieu)
  const cle = cleZones(s.etat, ids, s.version)
  if (cle === s.cleZones) return
  s.cleZones = cle
  rendreZones(s, choisis)
}

function afficher(s: Session, choisis: Ami[], mesure: Mesure, focus: string | null): void {
  rendrePanneau(s, choisis, mesure)
  rendreCarte(s, choisis)
  const actif = document.activeElement
  const perdu = !actif || actif === document.body || !actif.isConnected
  if (focus && perdu) $('#panneau').querySelector<HTMLElement>(focus)?.focus()
}

/** Pendant le premier chargement des horaires : filtres à jour, résultats et zones vidés. */
function attendreHoraires(s: Session, choisis: Ami[]): void {
  rendreFiltres($('#filtres'), s.etat, choisis.length, (p) => changer(s, p))
  $('#chargement').textContent = TEXTE_HORAIRES
  $('#villes').textContent = ''
  $('#resultat-lieu').textContent = ''
  s.carte.zones([])
  s.carte.sansCentre()
  rendreLegende($('#legende'), [])
  s.cleZones = null
}

function echecHoraires(s: Session, e: unknown): void {
  console.error('Horaires :', e)
  if (s.etat.mode !== 'tc') return
  changer(s, { mode: 'oiseau', max: null })
  signaler((e as Error).message, () => changer(s, { mode: 'tc', max: null }))
}

function viderChargementHoraires(): void {
  const statut = $('#chargement')
  if (statut.textContent === TEXTE_HORAIRES) statut.textContent = ''
}

async function preparerTc(s: Session, choisis: Ami[], rendu: number): Promise<boolean> {
  if (!s.tc.pret()) attendreHoraires(s, choisis)
  try {
    await (await s.tc.obtenir()).preparer(choisis)
  } finally {
    viderChargementHoraires()
  }
  return rendu === s.rendu
}

function rafraichir(s: Session): void {
  history.replaceState(null, '', ecrireEtat(s.etat))
  signaler('')
  const rendu = ++s.rendu
  const actif = document.activeElement
  const focus = $('#panneau').contains(actif) ? cleFocus(actif) : null
  const choisis = amisChoisis(s.amis, s.etat.selection)
  if (s.etat.mode !== 'tc') {
    viderChargementHoraires()
    return afficher(s, choisis, choisirMesure(s.etat, null), focus)
  }
  preparerTc(s, choisis, rendu).then(
    (aJour) => { if (aJour) afficher(s, choisis, choisirMesure(s.etat, s.tc.pret()), focus) },
    (e: unknown) => { if (rendu === s.rendu) echecHoraires(s, e) },
  )
}

const SQUELETTE = `
  <div class="app">
    <aside id="panneau" class="panneau" aria-label="Recherche et résultats">
      <button type="button" id="poignee" aria-expanded="false" aria-controls="panneau">Voir la liste</button>
      <header class="rang entete">
        <strong>Point de rencontre</strong>
        <button type="button" class="pastille secondaire pousse" id="sortir">Se déconnecter</button>
      </header>
      <div id="amis"></div>
      <div id="lieu"></div>
      <div id="resultat-lieu"></div>
      <div id="filtres"></div>
      <p id="chargement" class="chargement" role="status">${TEXTE_CHARGEMENT}</p>
      <div id="message" class="bandeau erreur" role="alert"></div>
      <div id="villes" class="villes"></div>
    </aside>
    <div class="carte" id="carte" role="region" aria-label="Carte des zones">
      <div id="legende" class="legende" hidden></div>
    </div>
  </div>`

function brancherVolet(): void {
  const app = $('.app')
  const poignee = $('#poignee')
  poignee.addEventListener('click', () => {
    const ouvert = app.classList.toggle('volet-ouvert')
    poignee.setAttribute('aria-expanded', String(ouvert))
    poignee.textContent = ouvert ? 'Réduire' : 'Voir la liste'
  })
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
    const etat = lireEtat(location.search)
    const s: Session = {
      grille, villes, amis, groupes, etat, carte,
      recherche: rendreRechercheLieu($('#lieu'), etat.lieu, (lieu) => changer(s, { lieu })),
      couches: creerCouches(grille),
      tc: creerChargeurTc(creerHoraires),
      rendu: 0,
      version: 0,
      cleZones: null,
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
