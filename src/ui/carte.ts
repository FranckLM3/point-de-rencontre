import L from 'leaflet'
import { OPACITE_TRANCHE, TEINTE_ZONES } from './rendu-zones'
import 'leaflet/dist/leaflet.css'
import type { Tranche } from '../calcul/zones'
import type { Ami, Lieu } from '../types'
import { echapper } from './format'
import { etiquette, grouperParPosition, infobulleMarqueur } from './marqueurs'

/** Tuiles OpenStreetMap (sans clé), adoucies en gris par la feuille de style. */
const TUILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const ATTRIBUTION = '&copy; OpenStreetMap'
const CENTRE_FRANCE: L.LatLngTuple = [46.6, 2.4]
const ZOOM_FRANCE = 6
const ZOOM_MAX_CADRAGE = 9
const MARGE_CADRAGE: L.PointTuple = [40, 40]
/** D1 : même valeur que l'opacité des nuances de la légende (app.css). */
/** Valeurs de tokens.css (--pastille, --accent) : Leaflet dessine en SVG, sans accès aux variables. */
const COULEUR_LIGNE = '#1f2733'
const COULEUR_LIEU = '#15803d'
const TAILLE_MARQUEUR = 28
const TAILLE_CIBLE = 36
const RAYON_LIEU = 8

export interface Carte {
  amis(liste: Ami[], selection: Set<string>): void
  zones(tranches: Tranche[]): void
  centre(lat: number, lon: number, libelle: string): void
  sansCentre(): void
  lignes(depuis: Ami[], vers: Lieu | null): void
  recalculer(): void
  surClic(action: (lat: number, lon: number) => void): void
  /** Empêche un élément posé sur la carte (légende) de déclencher un clic ou un glisser. */
  isoler(el: HTMLElement): void
}

const icone = (html: string, taille: number): L.DivIcon =>
  L.divIcon({ className: '', html, iconSize: [taille, taille] })

export function creerCarte(element: HTMLElement): Carte {
  const carte = L.map(element).setView(CENTRE_FRANCE, ZOOM_FRANCE)
  L.tileLayer(TUILES, { attribution: ATTRIBUTION, maxZoom: 19 }).addTo(carte)
  const coucheZones = L.layerGroup().addTo(carte)
  const coucheLignes = L.layerGroup().addTo(carte)
  const coucheAmis = L.layerGroup().addTo(carte)
  const iconeCible = icone('<span class="cible"></span>', TAILLE_CIBLE)
  let marqueurCentre: L.Marker | null = null
  let dejaCadre = false

  return {
    amis(liste, selection) {
      coucheAmis.clearLayers()
      for (const p of grouperParPosition(liste)) {
        const actif = p.amis.some((a) => selection.has(a.id))
        const html = `<span class="marqueur-personne${actif ? '' : ' inactif'}">${echapper(etiquette(p))}</span>`
        L.marker([p.lat, p.lon], {
          icon: icone(html, TAILLE_MARQUEUR),
          title: p.amis.map((a) => a.nom).join(', '),
          zIndexOffset: actif ? 100 : 0,
        })
          .bindTooltip(infobulleMarqueur(p))
          .addTo(coucheAmis)
      }
      if (!dejaCadre && liste.length > 0) {
        carte.fitBounds(L.latLngBounds(liste.map((a) => [a.lat, a.lon])), { padding: MARGE_CADRAGE, maxZoom: ZOOM_MAX_CADRAGE })
        dejaCadre = true
      }
    },
    zones(tranches) {
      coucheZones.clearLayers()
      for (const t of tranches) {
        const forme: GeoJSON.MultiPolygon = { type: 'MultiPolygon', coordinates: t.coordonnees }
        L.geoJSON(forme, { style: { stroke: false, fillColor: TEINTE_ZONES, fillOpacity: OPACITE_TRANCHE }, interactive: false }).addTo(coucheZones)
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
