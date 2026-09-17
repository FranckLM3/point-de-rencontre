import { writeFile, mkdir } from 'node:fs/promises'
import booleanPointInPolygon from '@turf/boolean-point-in-polygon'

const SOURCE = 'https://raw.githubusercontent.com/gregoiredavid/france-geojson/master/metropole-version-simplifiee.geojson'
const PAS_KM = 4
const LAT_MOY = 46.5
const BBOX = { lonMin: -5.3, lonMax: 9.7, latMin: 41.2, latMax: 51.2 }

const reponse = await fetch(SOURCE)
if (!reponse.ok) throw new Error(`contour France : HTTP ${reponse.status}`)
const france = await reponse.json()

const pasLat = PAS_KM / 111.32
const pasLon = PAS_KM / (111.32 * Math.cos((LAT_MOY * Math.PI) / 180))
const nx = Math.ceil((BBOX.lonMax - BBOX.lonMin) / pasLon) + 1
const ny = Math.ceil((BBOX.latMax - BBOX.latMin) / pasLat) + 1
const dedans = new Uint8Array(nx * ny)

for (let ligne = 0; ligne < ny; ligne++) {
  for (let colonne = 0; colonne < nx; colonne++) {
    const point = [BBOX.lonMin + colonne * pasLon, BBOX.latMin + ligne * pasLat]
    dedans[ligne * nx + colonne] = booleanPointInPolygon(point, france) ? 1 : 0
  }
}

await mkdir('public/data', { recursive: true })
const sortie = {
  lon0: BBOX.lonMin, lat0: BBOX.latMin, pasLon, pasLat, nx, ny,
  dedans: Buffer.from(dedans).toString('base64'),
}
await writeFile('public/data/grille-4km.json', JSON.stringify(sortie))
console.log(`grille ${nx}x${ny}, ${dedans.reduce((a, b) => a + b, 0)} points en France`)
