import L from 'leaflet'
import type { VilleClassee } from '../calcul/villes'
import type { Tranche } from '../calcul/zones'
import type { Ami, Lieu } from '../types'
import { COULEUR_CONTOUR_ZONE, EPAISSEUR_CONTOUR_ZONE, OPACITE_CONTOUR_ZONE, OPACITE_ZONE } from './rendu-zones'
import 'leaflet/dist/leaflet.css'
import { echapper, valeur } from './format'
import type { EtiquetteVille } from './etiquettes'
import { ICONE_PLEIN_ECRAN } from './icones'
import { grouperEcran, listeNoms } from './grappes'
import { etiquette, grouperParPosition, infobulleMarqueur, type Point } from './marqueurs'

/** Tuiles OpenStreetMap (sans clé), très adoucies par la feuille de style (fond quasi blanc, façon Chronotrains). */
const TUILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const ATTRIBUTION = '&copy; OpenStreetMap'
const CENTRE_FRANCE: L.LatLngTuple = [46.6, 2.4]
const ZOOM_FRANCE = 6
const ZOOM_MAX_CADRAGE = 9
const MARGE_CADRAGE: L.PointTuple = [40, 40]
/** Zoom appliqué par « Voir sur la carte » : assez proche pour situer le repaire sans perdre le contexte. */
const ZOOM_REPAIRE = 8
/** Sous ce seuil, le panneau devient un volet fixé en bas (même seuil que app.css). */
const SEUIL_MOBILE_PX = 1024
/** Même ratio que --volet-ferme (tokens.css) : hauteur du volet fermé, qui masque le bas de la carte. */
const RATIO_VOLET_FERME = 0.38

/** En dessous de 1024 px, le volet fermé couvre le bas de l'écran : le cadrage lui réserve de la place. */
function margeBasse(): L.PointTuple {
  const bas = window.innerWidth < SEUIL_MOBILE_PX ? MARGE_CADRAGE[1] + window.innerHeight * RATIO_VOLET_FERME : MARGE_CADRAGE[1]
  return [MARGE_CADRAGE[0], bas]
}
/** Valeurs de tokens.css (--pastille, --accent) : Leaflet dessine en SVG, sans accès aux variables. */
const COULEUR_LIGNE = '#1f2733'
const COULEUR_LIGNE_VILLE = '#0b5d2a'
const COULEUR_LIEU = '#15803d'
const TAILLE_MARQUEUR = 28
const TAILLE_GRAPPE = 34
const TAILLE_CIBLE = 36
const RAYON_LIEU = 8
/** Rayon (px écran) sous lequel deux marqueurs de personnes différentes fusionnent en une bulle (D3). */
const RAYON_GRAPPE_PX = 26
/** Sous cette largeur de fenêtre, moins d'étiquettes (lisibilité mobile, D3). */
const SEUIL_MOBILE_ETIQUETTES = 600
const MAX_ETIQUETTES = 32
const MAX_ETIQUETTES_MOBILE = 16

export interface Carte {
  /** `misEnAvant` : identifiant d'une personne dont le marqueur reçoit une brève pulsation (ajout/édition). */
  amis(liste: Ami[], selection: Set<string>, misEnAvant?: string | null): void
  zones(tranches: Tranche[]): void
  centre(lat: number, lon: number, libelle: string): void
  sansCentre(): void
  /** Cadre la carte sur un point (bouton « Voir sur la carte »). */
  centrerSur(lat: number, lon: number): void
  lignes(depuis: Ami[], vers: Lieu | null): void
  /** Lignes vers la ville choisie (carte de ville ou étiquette cliquée), en vert foncé (D3). */
  lignesVille(depuis: Ami[], vers: Lieu | null): void
  /** Étiquettes de villes façon Chronotrains ; recalculées ici même sur zoomend/moveend. */
  etiquettes(candidats: EtiquetteVille[], choisir: (v: VilleClassee) => void): void
  recalculer(): void
  surClic(action: (lat: number, lon: number) => void): void
  /** Empêche un élément posé sur la carte (légende) de déclencher un clic ou un glisser. */
  isoler(el: HTMLElement): void
}

const icone = (html: string, taille: number): L.DivIcon =>
  L.divIcon({ className: '', html, iconSize: [taille, taille] })

const ControlePleinEcran = L.Control.extend({
  options: { position: 'topleft' },
  onAdd(carte: L.Map) {
    const conteneur = L.DomUtil.create('div', 'leaflet-bar controle-plein-ecran')
    const bouton = L.DomUtil.create('button', '', conteneur) as HTMLButtonElement
    bouton.type = 'button'
    bouton.setAttribute('aria-label', 'Plein écran')
    bouton.title = 'Plein écran'
    bouton.innerHTML = ICONE_PLEIN_ECRAN
    L.DomEvent.disableClickPropagation(conteneur)
    bouton.addEventListener('click', () => {
      const cible = carte.getContainer()
      if (document.fullscreenElement) void document.exitFullscreen()
      else void cible.requestFullscreen()
    })
    // La taille du conteneur change en plein écran : Leaflet doit recalculer ses tuiles.
    document.addEventListener('fullscreenchange', () => window.setTimeout(() => carte.invalidateSize(), 50))
    return conteneur
  },
})

export function creerCarte(element: HTMLElement): Carte {
  const carte = L.map(element).setView(CENTRE_FRANCE, ZOOM_FRANCE)
  L.tileLayer(TUILES, { attribution: ATTRIBUTION, maxZoom: 19 }).addTo(carte)
  new ControlePleinEcran().addTo(carte)
  const coucheZones = L.layerGroup().addTo(carte)
  const coucheLignes = L.layerGroup().addTo(carte)
  const coucheLignesVille = L.layerGroup().addTo(carte)
  const coucheAmis = L.layerGroup().addTo(carte)
  const paneEtiquettes = carte.createPane('etiquettes')
  // Sous markerPane (600) et le repère (zIndexOffset négatif y compris), au-dessus des zones (overlayPane 400).
  paneEtiquettes.style.zIndex = '550'
  paneEtiquettes.style.pointerEvents = 'none'
  const iconeCible = icone('<span class="cible"></span>', TAILLE_CIBLE)
  let marqueurCentre: L.Marker | null = null
  let dejaCadre = false

  let dernierRendu: { liste: Ami[]; selection: Set<string>; misEnAvant: string | null } | null = null
  let dernieresEtiquettes: { candidats: EtiquetteVille[]; choisir: (v: VilleClassee) => void } | null = null

  function dessinerAmis(): void {
    if (!dernierRendu) return
    const { liste, selection, misEnAvant } = dernierRendu
    coucheAmis.clearLayers()
    const points = grouperParPosition(liste)
    const ecran: { id: string; x: number; y: number }[] = points.map((p, i) => {
      const pt = carte.latLngToContainerPoint([p.lat, p.lon])
      return { id: String(i), x: pt.x, y: pt.y }
    })
    for (const g of grouperEcran(ecran, RAYON_GRAPPE_PX)) {
      const indices = g.membres.map(Number)
      const membres: Point[] = indices.map((i) => points[i]!)
      const amis = membres.flatMap((p) => p.amis)
      const actif = amis.some((a) => selection.has(a.id))
      const pulse = misEnAvant ? amis.some((a) => a.id === misEnAvant) : false
      const grappe = membres.length > 1
      const latlng = carte.containerPointToLatLng([g.x, g.y])
      const classe = `marqueur-personne${actif ? '' : ' inactif'}${pulse ? ' pulse' : ''}${grappe ? ' grappe' : ''}`
      const html = `<span class="${classe}">${echapper(grappe ? String(amis.length) : etiquette(membres[0]!))}</span>`
      L.marker(latlng, {
        icon: icone(html, grappe ? TAILLE_GRAPPE : TAILLE_MARQUEUR),
        title: amis.map((a) => a.nom).join(', '),
        zIndexOffset: actif ? 100 : 0,
      })
        .bindTooltip(grappe ? echapper(listeNoms(amis)) : infobulleMarqueur(membres[0]!))
        .addTo(coucheAmis)
    }
  }

  function dessinerEtiquettes(): void {
    paneEtiquettes.innerHTML = ''
    if (!dernieresEtiquettes) return
    const { candidats, choisir } = dernieresEtiquettes
    const limite = window.innerWidth < SEUIL_MOBILE_ETIQUETTES ? MAX_ETIQUETTES_MOBILE : MAX_ETIQUETTES
    const boites: { id: number; x: number; y: number; largeur: number; hauteur: number }[] = []
    const placees: { id: number; x: number; y: number; c: EtiquetteVille }[] = []
    for (const [i, c] of candidats.slice(0, limite).entries()) {
      const pt = carte.latLngToLayerPoint([c.ville.ville.lat, c.ville.ville.lon])
      const hauteur = c.prix ? 56 : 40
      const largeur = Math.max(72, c.ville.ville.nom.length * 7 + 24)
      const boite = { id: i, x: pt.x - largeur / 2, y: pt.y - hauteur - 10, largeur, hauteur }
      if (boites.some((b) => boite.x < b.x + b.largeur && boite.x + boite.largeur > b.x && boite.y < b.y + b.hauteur && boite.y + boite.hauteur > b.y)) continue
      boites.push(boite)
      placees.push({ id: i, x: pt.x, y: pt.y, c })
    }
    for (const p of placees) {
      const el = document.createElement('button')
      el.type = 'button'
      el.className = `etiquette-ville${p.c.meilleure ? ' meilleure' : ''}`
      el.setAttribute('aria-hidden', 'true')
      el.tabIndex = -1
      el.style.left = `${p.x}px`
      el.style.top = `${p.y}px`
      el.innerHTML = `<span class="nom">${echapper(p.c.ville.ville.nom)}</span><span class="valeur">${echapper(p.c.valeurAffichee ?? '')}</span>${p.c.prix ? `<span class="prix">${echapper(p.c.prix)}</span>` : ''}`
      el.addEventListener('click', () => choisir(p.c.ville))
      paneEtiquettes.append(el)
    }
  }

  carte.on('zoomend', () => { dessinerAmis(); dessinerEtiquettes() })
  carte.on('moveend', () => dessinerEtiquettes())

  return {
    amis(liste, selection, misEnAvant = null) {
      dernierRendu = { liste, selection, misEnAvant }
      dessinerAmis()
      if (!dejaCadre && liste.length > 0) {
        carte.fitBounds(L.latLngBounds(liste.map((a) => [a.lat, a.lon])), {
          paddingTopLeft: MARGE_CADRAGE,
          paddingBottomRight: margeBasse(),
          maxZoom: ZOOM_MAX_CADRAGE,
        })
        dejaCadre = true
      }
    },
    zones(tranches) {
      coucheZones.clearLayers()
      for (const t of tranches) {
        const forme: GeoJSON.MultiPolygon = { type: 'MultiPolygon', coordinates: t.coordonnees }
        L.geoJSON(forme, {
          style: {
            color: COULEUR_CONTOUR_ZONE, weight: EPAISSEUR_CONTOUR_ZONE, opacity: OPACITE_CONTOUR_ZONE,
            fillColor: t.couleur, fillOpacity: OPACITE_ZONE,
          },
          interactive: false,
        }).addTo(coucheZones)
      }
    },
    centre(lat, lon, libelle) {
      marqueurCentre?.remove()
      // Sous les personnes : le centre tombe souvent sur une adresse, l'anneau entoure alors sa pastille.
      marqueurCentre = L.marker([lat, lon], { icon: iconeCible, title: libelle, zIndexOffset: -100 })
        .bindTooltip(echapper(libelle))
        .addTo(carte)
    },
    sansCentre() {
      marqueurCentre?.remove()
      marqueurCentre = null
    },
    centrerSur(lat, lon) {
      // Un point unique en guise de bornes : fitBounds cadre alors sur ce point, en réservant la
      // place du volet fermé, sans code séparé pour le cas plein écran (marge basse nulle).
      carte.fitBounds(L.latLngBounds([[lat, lon], [lat, lon]]), {
        paddingTopLeft: MARGE_CADRAGE,
        paddingBottomRight: margeBasse(),
        maxZoom: ZOOM_REPAIRE,
      })
    },
    lignes(depuis, vers) {
      coucheLignes.clearLayers()
      if (!vers) return
      for (const a of depuis) {
        L.polyline([[a.lat, a.lon], [vers.lat, vers.lon]], { color: COULEUR_LIGNE, weight: 1.5, opacity: 0.6, interactive: false }).addTo(coucheLignes)
      }
      L.circleMarker([vers.lat, vers.lon], { radius: RAYON_LIEU, color: COULEUR_LIEU, fillOpacity: 1 })
        .bindTooltip(echapper(vers.label))
        .addTo(coucheLignes)
    },
    lignesVille(depuis, vers) {
      coucheLignesVille.clearLayers()
      if (!vers) return
      for (const a of depuis) {
        L.polyline([[a.lat, a.lon], [vers.lat, vers.lon]], { color: COULEUR_LIGNE_VILLE, weight: 2, opacity: 0.8, interactive: false }).addTo(coucheLignesVille)
      }
      L.circleMarker([vers.lat, vers.lon], { radius: RAYON_LIEU, color: COULEUR_LIGNE_VILLE, fillOpacity: 1 })
        .bindTooltip(echapper(vers.label))
        .addTo(coucheLignesVille)
    },
    etiquettes(candidats, choisir) {
      dernieresEtiquettes = { candidats, choisir }
      dessinerEtiquettes()
    },
    recalculer() {
      carte.invalidateSize()
    },
    surClic(action) {
      carte.on('click', (e) => action(e.latlng.lat, e.latlng.lng))
    },
    isoler(el) {
      L.DomEvent.disableClickPropagation(el)
      L.DomEvent.disableScrollPropagation(el)
    },
  }
}
