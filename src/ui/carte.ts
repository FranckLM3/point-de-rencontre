import L from 'leaflet'
import type { CoordGare, PersonneTrajetCarte } from '../calcul/trace'
import type { VilleClassee } from '../calcul/villes'
import type { Tranche } from '../calcul/zones'
import type { Ami, Lieu } from '../types'
import { COULEUR_CONTOUR_ZONE, EPAISSEUR_CONTOUR_ZONE, OPACITE_CONTOUR_ZONE, OPACITE_ZONE } from './rendu-zones'
import 'leaflet/dist/leaflet.css'
import { echapper, nomCourt } from './format'
import { placerEtiquette, type BoiteEtiquette, type CercleEcran, type EtiquetteVille, type PlacementEtiquette } from './etiquettes'
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
const COULEUR_LIGNE_VILLE = '#0b5d2a'
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
/** Étiquettes de gares (nom court) : au plus 6 à la fois, pour ne pas encombrer la carte. */
const MAX_ETIQUETTES_GARES = 6
const RAYON_GARE = 4
const STYLE_TRAIN: L.PolylineOptions = {
  color: COULEUR_LIGNE_VILLE, weight: 3, opacity: 0.9, lineJoin: 'round', interactive: false, className: 'trace-train',
}
/** Accès/sortie de gare, et trajet direct sans train : ligne fine et pointillée. */
const STYLE_POINTILLE: L.PolylineOptions = { color: COULEUR_LIGNE_VILLE, weight: 1.5, opacity: 0.7, dashArray: '2 6', interactive: false }
/** Hors mode transports (vol d'oiseau, ou mixte en repli transports sans horaires) : ligne droite pleine. */
const STYLE_DROITE: L.PolylineOptions = { color: COULEUR_LIGNE_VILLE, weight: 2, opacity: 0.8, interactive: false }
/** En voiture (mode voiture, ou mixte avec la couche prête) : ligne droite pointillée, pas de tracé de route (décision 7). */
const STYLE_VOITURE: L.PolylineOptions = { color: COULEUR_LIGNE_VILLE, weight: 2, opacity: 0.85, dashArray: '5 7', interactive: false }

export interface Carte {
  /** `misEnAvant` : identifiant d'une personne dont le marqueur reçoit une brève pulsation (ajout/édition). */
  amis(liste: Ami[], selection: Set<string>, misEnAvant?: string | null): void
  zones(tranches: Tranche[]): void
  centre(lat: number, lon: number, libelle: string): void
  sansCentre(): void
  /** Cadre la carte sur un point (bouton « Voir sur la carte »). */
  centrerSur(lat: number, lon: number): void
  /** Redemande le cadrage sur l'ensemble des personnes au prochain appel à `amis` (bouton
   * « Réinitialiser ») : sans cela, `amis` ne recadre qu'une fois, au tout premier rendu. */
  recadrerSurTous(): void
  /**
   * Trajets vers la cible choisie (carte de ville, étiquette cliquée ou lieu testé) : une seule
   * couche, effacée puis redessinée à chaque appel, quel que soit le déclencheur (D8).
   */
  trajets(personnes: PersonneTrajetCarte[], cible: Lieu | null): void
  /** Étiquettes de villes façon Chronotrains ; recalculées ici même sur zoomend/moveend. */
  etiquettes(candidats: EtiquetteVille[], choisir: (v: VilleClassee) => void): void
  recalculer(): void
  surClic(action: (lat: number, lon: number) => void): void
  /** Empêche un élément posé sur la carte (légende) de déclencher un clic ou un glisser. */
  isoler(el: HTMLElement): void
}

const icone = (html: string, taille: number): L.DivIcon =>
  L.divIcon({ className: '', html, iconSize: [taille, taille] })

const chevauchent = (a: BoiteEtiquette, b: BoiteEtiquette): boolean =>
  a.x < b.x + b.largeur && a.x + a.largeur > b.x && a.y < b.y + b.hauteur && a.y + a.hauteur > b.y

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
  const coucheTrajets = L.layerGroup().addTo(carte)
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
  /** Marqueurs de personnes/grappes en espace écran (layerPoint), pour que les étiquettes de ville les évitent. */
  let dernierEcranAmis: CercleEcran[] = []

  function dessinerAmis(): void {
    if (!dernierRendu) return
    const { liste, selection, misEnAvant } = dernierRendu
    coucheAmis.clearLayers()
    const ecranAmis: CercleEcran[] = []
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
      const taille = grappe ? TAILLE_GRAPPE : TAILLE_MARQUEUR
      const classe = `marqueur-personne${actif ? '' : ' inactif'}${pulse ? ' pulse' : ''}${grappe ? ' grappe' : ''}`
      const html = `<span class="${classe}">${echapper(grappe ? String(amis.length) : etiquette(membres[0]!))}</span>`
      L.marker(latlng, {
        icon: icone(html, taille),
        title: amis.map((a) => a.nom).join(', '),
        zIndexOffset: actif ? 100 : 0,
      })
        .bindTooltip(grappe ? echapper(listeNoms(amis)) : infobulleMarqueur(membres[0]!))
        .addTo(coucheAmis)
      const pt = carte.latLngToLayerPoint(latlng)
      ecranAmis.push({ x: pt.x, y: pt.y, rayon: taille / 2 })
    }
    dernierEcranAmis = ecranAmis
  }

  function dessinerEtiquettes(): void {
    paneEtiquettes.innerHTML = ''
    if (!dernieresEtiquettes) return
    const { candidats, choisir } = dernieresEtiquettes
    const limite = window.innerWidth < SEUIL_MOBILE_ETIQUETTES ? MAX_ETIQUETTES_MOBILE : MAX_ETIQUETTES
    const boites: BoiteEtiquette[] = []
    const placees: { placement: PlacementEtiquette; c: EtiquetteVille }[] = []
    for (const [i, c] of candidats.slice(0, limite).entries()) {
      const pt = carte.latLngToLayerPoint([c.ville.ville.lat, c.ville.ville.lon])
      const hauteur = c.prix ? 56 : 40
      const largeur = Math.max(72, c.ville.ville.nom.length * 7 + 24)
      // La pointe s'appuie sur le point visé, décalée vers le haut si un marqueur de personne
      // ou une grappe gêne (D9) ; l'étiquette est omise plutôt que dessinée cachée derrière lui.
      const placement = placerEtiquette(String(i), pt.x, pt.y, largeur, hauteur, dernierEcranAmis)
      if (!placement || boites.some((b) => chevauchent(b, placement.boite))) continue
      boites.push(placement.boite)
      placees.push({ placement, c })
    }
    for (const p of placees) {
      const el = document.createElement('button')
      el.type = 'button'
      el.className = `etiquette-ville${p.c.meilleure ? ' meilleure' : ''}`
      el.setAttribute('aria-hidden', 'true')
      el.tabIndex = -1
      el.style.left = `${p.placement.x}px`
      el.style.top = `${p.placement.y}px`
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
    recadrerSurTous() {
      dejaCadre = false
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
    trajets(personnes, cible) {
      coucheTrajets.clearLayers()
      if (!cible) return
      // Au plus 6 étiquettes de gares : l'arrivée (la ville visée) d'abord, puis les départs.
      const gardees = new Set<number>()
      const retenirEtiquette = (i: number): void => {
        if (gardees.size < MAX_ETIQUETTES_GARES) gardees.add(i)
      }
      for (const p of personnes) if (p.gareArrivee !== null) retenirEtiquette(p.gareArrivee)
      for (const p of personnes) if (p.gareDepart !== null) retenirEtiquette(p.gareDepart)

      const dessinees = new Set<number>()
      const dessinerGare = (i: number, g: CoordGare): void => {
        if (dessinees.has(i)) return
        dessinees.add(i)
        const marqueur = L.circleMarker([g.lat, g.lon], {
          radius: RAYON_GARE, weight: 2, color: COULEUR_LIGNE_VILLE, fillColor: '#fff', fillOpacity: 1, interactive: false,
        }).addTo(coucheTrajets)
        if (gardees.has(i)) {
          marqueur.bindTooltip(echapper(nomCourt(g.nom)), { permanent: true, direction: 'top', offset: [0, -6], className: 'etiquette-gare' })
        }
      }

      for (const p of personnes) {
        const infobulle = echapper(p.noms.join(', '))
        if (p.chemin && p.chemin.length > 0 && p.gareDepart !== null && p.gareArrivee !== null) {
          const depart = p.chemin[0]!
          const arrivee = p.chemin[p.chemin.length - 1]!
          L.polyline([[p.lat, p.lon], [depart.lat, depart.lon]], STYLE_POINTILLE).bindTooltip(infobulle).addTo(coucheTrajets)
          L.polyline(p.trace ?? p.chemin.map((g): L.LatLngTuple => [g.lat, g.lon]), STYLE_TRAIN).addTo(coucheTrajets)
          L.polyline([[arrivee.lat, arrivee.lon], [cible.lat, cible.lon]], STYLE_POINTILLE).addTo(coucheTrajets)
          dessinerGare(p.gareDepart, depart)
          dessinerGare(p.gareArrivee, arrivee)
        } else {
          const style = p.enVoiture ? STYLE_VOITURE : p.directSansTrain ? STYLE_POINTILLE : STYLE_DROITE
          L.polyline([[p.lat, p.lon], [cible.lat, cible.lon]], style).bindTooltip(infobulle).addTo(coucheTrajets)
        }
      }
      L.circleMarker([cible.lat, cible.lon], { radius: RAYON_LIEU, color: COULEUR_LIGNE_VILLE, fillOpacity: 1 })
        .bindTooltip(echapper(cible.label))
        .addTo(coucheTrajets)
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
