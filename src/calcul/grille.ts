/** Grille régulière en degrés ; l'indice i = ligne * nx + colonne, ligne 0 au sud. */
export interface Grille {
  lon0: number
  lat0: number
  pasLon: number
  pasLat: number
  nx: number
  ny: number
  /** 1 si le point est en France métropolitaine. */
  dedans: Uint8Array
}

export function coordonnees(g: Grille, i: number): [number, number] {
  const colonne = i % g.nx
  const ligne = Math.floor(i / g.nx)
  return [g.lon0 + colonne * g.pasLon, g.lat0 + ligne * g.pasLat]
}

export function indiceProche(g: Grille, lon: number, lat: number): number {
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return -1
  const colonne = Math.round((lon - g.lon0) / g.pasLon)
  const ligne = Math.round((lat - g.lat0) / g.pasLat)
  if (colonne < 0 || ligne < 0 || colonne >= g.nx || ligne >= g.ny) return -1
  return ligne * g.nx + colonne
}
