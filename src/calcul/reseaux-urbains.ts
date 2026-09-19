/**
 * Zones où l'on rejoint et quitte les gares en transports urbains (métro, RER, tram) et non en
 * voiture : Île-de-France aujourd'hui ; Lyon et Marseille s'ajouteront avec leurs réseaux (plan 4).
 * Ailleurs, au-delà de la marche, l'accès à la gare et le dernier kilomètre se font en voiture.
 */
const ZONES_RESEAU_URBAIN = [{ nom: 'Île-de-France', latMin: 48.12, latMax: 49.24, lonMin: 1.44, lonMax: 3.56 }] as const

export function enReseauUrbain(lat: number, lon: number): boolean {
  return ZONES_RESEAU_URBAIN.some((z) => lat >= z.latMin && lat <= z.latMax && lon >= z.lonMin && lon <= z.lonMax)
}
