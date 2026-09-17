# Plan 1 : socle de l'appli et mode vol d'oiseau

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Une appli déployée sur GitHub Pages, protégée par mot de passe, où le groupe gère ses adresses (avec le moyen de transport de chacun), choisit qui entre dans le calcul, voit la France colorée par distance à vol d'oiseau, le classement des villes et le détail d'un lieu testé.

**Architecture:** Front statique Vite + TypeScript sans framework, Leaflet pour la carte, d3-contour pour les zones. Supabase porte la base (`amis`, `groupes`), la connexion par compte partagé et la sécurité par lignes (RLS). Toute agrégation se fait dans le navigateur sur une grille de 2 km pré-calculée.

**Tech Stack:** Node 25, Vite 8, TypeScript, Vitest 5, Playwright 1.63, Leaflet 1.9, d3-contour 4, @supabase/supabase-js 2, @fontsource/jost 5, GitHub Actions + Pages, Supabase (Postgres).

Spécification : `docs/superpowers/specs/2026-09-17-point-de-rencontre-design.md`.

## Suite des plans

| Plan | Contenu | Dépend de |
|---|---|---|
| 1 (ce plan) | socle, auth, amis (avec moyen de transport), groupes, vol d'oiseau, déploiement | rien |
| 2 | transports France : Action hebdo gare vers gare, calcul d'ami dans le navigateur, prix train, mode « Tous en transports » | 1 |
| 3 | voiture : Edge Function OpenRouteService, table `temps`, prix carburant et péage, modes « Tous en voiture » et « Chacun son moyen » | 1, 2 |
| 4 | Île-de-France : essai r5py, Action à la demande, combinaison avec le plan 2 | 2 |

## Écarts assumés par rapport à la spécification

- Le critère « total » est affiché en **moyenne** pour colorer la carte et
  appliquer le maximum : le classement est identique à celui de la somme et
  l'échelle reste celle d'un trajet. Les cartes de ville affichent le total.
- En vol d'oiseau, la grandeur est la distance (km). Les pastilles
  « Chacun son moyen », « Tous en voiture » et « Tous en transports » sont
  affichées mais désactivées (« bientôt ») jusqu'aux plans 2 et 3.
- Le moyen de transport de chaque ami est saisi et stocké dès ce plan ; il
  ne change le calcul qu'à partir du plan 3.
- Les tables `temps` et `parametres` arrivent avec les plans 2 et 3.

## Structure des fichiers

```
point-de-rencontre/
├── index.html
├── package.json, tsconfig.json, vite.config.ts, playwright.config.ts
├── .env.example, .env.e2e
├── public/data/grille-2km.json      généré (T3)
├── public/data/villes.json          généré (T3)
├── scripts/
│   ├── generer-grille.mjs           contour France vers masque de grille
│   └── generer-villes.mjs           communes de 20000 hab. et plus
├── supabase/migrations/20260917000000_amis_groupes.sql
├── src/
│   ├── main.ts                      assemblage
│   ├── types.ts                     types partagés
│   ├── calcul/
│   │   ├── geo.ts                   haversine
│   │   ├── grille.ts                grille, indices, coordonnées
│   │   ├── agregat.ts               distances, moyenne / pire, meilleur point
│   │   ├── zones.ts                 tranches et contours GeoJSON
│   │   └── villes.ts                classement des villes
│   ├── etat/url.ts                  état et URL
│   ├── donnees/
│   │   ├── supabase.ts              client
│   │   ├── auth.ts                  connexion par mot de passe
│   │   ├── amis.ts                  CRUD amis + validation
│   │   ├── groupes.ts               CRUD groupes
│   │   ├── geocodage.ts             IGN Géoplateforme
│   │   └── statiques.ts             chargement grille et villes
│   ├── ui/
│   │   ├── format.ts                km, titre, échappement
│   │   ├── connexion.ts             écran mot de passe
│   │   ├── amis.ts                  pastilles, cases, groupes
│   │   ├── fiche-ami.ts             feuille ajout / modification
│   │   ├── filtres.ts               pastilles de filtres + titre
│   │   ├── liste-villes.ts          cartes de villes
│   │   ├── lieu.ts                  test d'un lieu
│   │   └── carte.ts                 Leaflet
│   └── styles/{tokens.css, app.css}
├── tests/unit/*.test.ts             Vitest
├── tests/e2e/parcours.spec.ts       Playwright
└── .github/workflows/pages.yml
```

---

### Task 1 : squelette Vite + Vitest

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.ts`, `tests/unit/sanity.test.ts`, `.env.example`
- Modify: `.gitignore`

- [ ] **Step 1 : créer le projet**

`package.json` :

```json
{
  "name": "point-de-rencontre",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "test": "vitest run",
    "e2e": "playwright test",
    "donnees": "node scripts/generer-grille.mjs && node scripts/generer-villes.mjs"
  }
}
```

```bash
cd ~/personnel/point-de-rencontre
npm install leaflet@1.9 d3-contour@4 @supabase/supabase-js@2 @fontsource/jost@5
npm install -D vite@8 typescript vitest@5 jsdom @playwright/test@1.63 @types/leaflet @types/d3-contour @types/geojson @turf/boolean-point-in-polygon
```

`tsconfig.json` :

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "types": ["vite/client"],
    "skipLibCheck": true
  },
  "include": ["src", "tests"]
}
```

`vite.config.ts` :

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  base: '/point-de-rencontre/',
  test: { environment: 'jsdom', include: ['tests/unit/**/*.test.ts'] },
})
```

`index.html` :

```html
<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, nofollow" />
    <title>Point de rencontre</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

`src/main.ts` (provisoire, remplacé en Task 14) :

```ts
document.querySelector('#app')!.textContent = 'Point de rencontre'
```

`.env.example` :

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=cle-publique-anon
VITE_COMPTE_EMAIL=groupe@exemple.fr
```

Ajouter à la fin de `.gitignore` :

```
!.env.example
!.env.e2e
test-results/
playwright-report/
```

- [ ] **Step 2 : test de fumée**

`tests/unit/sanity.test.ts` :

```ts
import { expect, test } from 'vitest'

test('la suite de tests tourne', () => {
  expect(1 + 1).toBe(2)
})
```

Run: `npm test` puis `npm run build`
Expected: 1 test PASS ; build OK, `dist/index.html` présent.

- [ ] **Step 3 : commit**

```bash
git add -A && git commit -m "chore: squelette Vite, TypeScript et Vitest"
```

---

### Task 2 : types, distance et grille

**Files:**
- Create: `src/types.ts`, `src/calcul/geo.ts`, `src/calcul/grille.ts`
- Test: `tests/unit/geo.test.ts`, `tests/unit/grille.test.ts`

- [ ] **Step 1 : types partagés**

`src/types.ts` :

```ts
/** Moyen de transport propre à un ami. */
export type Transport = 'voiture' | 'tc'

export interface Ami {
  id: string
  nom: string
  adresse: string
  lat: number
  lon: number
  transport: Transport
  navigo: boolean
}

export type NouvelAmi = Omit<Ami, 'id'>

export interface Groupe {
  id: string
  nom: string
  amis: string[]
}

/** mixte = chacun son moyen ; voiture / tc = tout le monde pareil. */
export type Mode = 'mixte' | 'voiture' | 'tc' | 'oiseau'
export type Critere = 'moyenne' | 'pire'

export interface Lieu {
  lat: number
  lon: number
  label: string
}

export interface Etat {
  mode: Mode
  critere: Critere
  /** Valeur maximale (km en vol d'oiseau), null = sans limite. */
  max: number | null
  /** Identifiants cochés, null = tout le monde. */
  selection: string[] | null
  lieu: Lieu | null
}

export interface Ville {
  nom: string
  dep: string
  lat: number
  lon: number
  population: number
}
```

- [ ] **Step 2 : tests qui échouent**

`tests/unit/geo.test.ts` :

```ts
import { expect, test } from 'vitest'
import { haversineKm } from '../../src/calcul/geo'

test('Paris vers Marseille fait environ 660 km', () => {
  const d = haversineKm(48.8566, 2.3522, 43.2965, 5.3698)
  expect(d).toBeGreaterThan(655)
  expect(d).toBeLessThan(665)
})

test('un point est à 0 km de lui-même', () => {
  expect(haversineKm(45, 3, 45, 3)).toBe(0)
})
```

`tests/unit/grille.test.ts` :

```ts
import { expect, test } from 'vitest'
import { coordonnees, indiceProche, type Grille } from '../../src/calcul/grille'

const g: Grille = {
  lon0: 0, lat0: 40, pasLon: 1, pasLat: 1, nx: 3, ny: 2,
  dedans: new Uint8Array([1, 1, 0, 1, 1, 1]),
}

test('coordonnees lit ligne puis colonne depuis le sud-ouest', () => {
  expect(coordonnees(g, 0)).toEqual([0, 40])
  expect(coordonnees(g, 5)).toEqual([2, 41])
})

test('indiceProche arrondit au point de grille le plus proche', () => {
  expect(indiceProche(g, 1.4, 40.6)).toBe(4)
})

test('indiceProche rend -1 hors de la grille', () => {
  expect(indiceProche(g, 10, 40)).toBe(-1)
})
```

Run: `npm test`
Expected: FAIL, modules introuvables.

- [ ] **Step 3 : implémentation**

`src/calcul/geo.ts` :

```ts
const RAYON_TERRE_KM = 6371.0088

const rad = (deg: number): number => (deg * Math.PI) / 180

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = rad(lat2 - lat1)
  const dLon = rad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * RAYON_TERRE_KM * Math.asin(Math.min(1, Math.sqrt(a)))
}
```

`src/calcul/grille.ts` :

```ts
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
  const colonne = Math.round((lon - g.lon0) / g.pasLon)
  const ligne = Math.round((lat - g.lat0) / g.pasLat)
  if (colonne < 0 || ligne < 0 || colonne >= g.nx || ligne >= g.ny) return -1
  return ligne * g.nx + colonne
}
```

- [ ] **Step 4 : vérifier**

Run: `npm test`
Expected: 6 tests PASS.

- [ ] **Step 5 : commit**

```bash
git add -A && git commit -m "feat: types, distance haversine et grille"
```

---

### Task 3 : données statiques (grille 2 km, villes)

**Files:**
- Create: `scripts/generer-grille.mjs`, `scripts/generer-villes.mjs`, `src/donnees/statiques.ts`
- Generate: `public/data/grille-2km.json`, `public/data/villes.json`
- Test: `tests/unit/statiques.test.ts`

Sources vérifiées le 2026-09-17 : le contour simplifié de gregoiredavid
répond en 200 ; geo.api.gouv.fr rend 34969 communes dont 492 de 20000
habitants et plus (outre-mer compris).

- [ ] **Step 1 : script de grille**

`scripts/generer-grille.mjs` :

```js
import { writeFile, mkdir } from 'node:fs/promises'
import booleanPointInPolygon from '@turf/boolean-point-in-polygon'

const SOURCE = 'https://raw.githubusercontent.com/gregoiredavid/france-geojson/master/metropole-version-simplifiee.geojson'
const PAS_KM = 2
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
await writeFile('public/data/grille-2km.json', JSON.stringify(sortie))
console.log(`grille ${nx}x${ny}, ${dedans.reduce((a, b) => a + b, 0)} points en France`)
```

Run: `node scripts/generer-grille.mjs`
Expected: `grille 5xxx5xx, 13xxxx points en France` (environ 550000 km² divisés par 4 km²). La génération prend une à deux minutes.

- [ ] **Step 2 : script de villes**

`scripts/generer-villes.mjs` :

```js
import { writeFile, mkdir } from 'node:fs/promises'

const SOURCE = 'https://geo.api.gouv.fr/communes?fields=nom,centre,population,codeDepartement&format=json'
const POPULATION_MIN = 20000

/** Corse (2A, 2B) et départements 01 à 95 ; l'outre-mer (971+) est exclu. */
const estMetropole = (dep) => dep === '2A' || dep === '2B' || Number(dep) < 97

const reponse = await fetch(SOURCE)
if (!reponse.ok) throw new Error(`communes : HTTP ${reponse.status}`)
const communes = await reponse.json()

const villes = communes
  .filter((c) => (c.population ?? 0) >= POPULATION_MIN && c.centre && estMetropole(c.codeDepartement))
  .map((c) => ({
    nom: c.nom,
    dep: c.codeDepartement,
    lon: c.centre.coordinates[0],
    lat: c.centre.coordinates[1],
    population: c.population,
  }))
  .sort((a, b) => b.population - a.population)

await mkdir('public/data', { recursive: true })
await writeFile('public/data/villes.json', JSON.stringify(villes))
console.log(`${villes.length} villes`)
```

Run: `node scripts/generer-villes.mjs && grep -c Ajaccio public/data/villes.json`
Expected: environ 470 villes ; `1` (la Corse est bien incluse).

- [ ] **Step 3 : test du chargeur (échoue)**

`tests/unit/statiques.test.ts` :

```ts
import { expect, test } from 'vitest'
import { decoderGrille } from '../../src/donnees/statiques'

const base64 = (octets: number[]): string => btoa(String.fromCharCode(...octets))

test('decoderGrille remet le masque base64 en octets', () => {
  const g = decoderGrille({ lon0: 0, lat0: 40, pasLon: 1, pasLat: 1, nx: 2, ny: 1, dedans: base64([1, 0]) })
  expect(Array.from(g.dedans)).toEqual([1, 0])
  expect(g.nx).toBe(2)
})

test('decoderGrille refuse un masque de mauvaise taille', () => {
  const brut = { lon0: 0, lat0: 40, pasLon: 1, pasLat: 1, nx: 3, ny: 1, dedans: base64([1]) }
  expect(() => decoderGrille(brut)).toThrow('grille')
})
```

Run: `npm test` : FAIL.

- [ ] **Step 4 : chargeur**

`src/donnees/statiques.ts` :

```ts
import type { Grille } from '../calcul/grille'
import type { Ville } from '../types'

interface GrilleBrute extends Omit<Grille, 'dedans'> {
  dedans: string
}

export function decoderGrille(brut: GrilleBrute): Grille {
  const octets = Uint8Array.from(atob(brut.dedans), (c) => c.charCodeAt(0))
  if (octets.length !== brut.nx * brut.ny) {
    throw new Error(`grille invalide : ${octets.length} points pour ${brut.nx}x${brut.ny}`)
  }
  return { ...brut, dedans: octets }
}

async function lireJson<T>(chemin: string): Promise<T> {
  const reponse = await fetch(`${import.meta.env.BASE_URL}${chemin}`)
  if (!reponse.ok) throw new Error(`${chemin} : HTTP ${reponse.status}`)
  return (await reponse.json()) as T
}

export async function chargerGrille(): Promise<Grille> {
  return decoderGrille(await lireJson<GrilleBrute>('data/grille-2km.json'))
}

export function chargerVilles(): Promise<Ville[]> {
  return lireJson<Ville[]>('data/villes.json')
}
```

Run: `npm test` : PASS.

- [ ] **Step 5 : commit**

```bash
git add -A && git commit -m "feat: grille 2 km de la France et liste des villes"
```

---

### Task 4 : agrégation

**Files:**
- Create: `src/calcul/agregat.ts`
- Test: `tests/unit/agregat.test.ts`

Convention : une « couche » est un `Float32Array` aligné sur la grille ;
`NaN` signifie « pas de valeur » (hors France ou injoignable). Un point où
un seul ami est sans valeur n'a pas de valeur agrégée.

- [ ] **Step 1 : tests qui échouent**

`tests/unit/agregat.test.ts` :

```ts
import { expect, test } from 'vitest'
import { agreger, distancesOiseau, meilleurIndice } from '../../src/calcul/agregat'
import type { Grille } from '../../src/calcul/grille'

const a = Float32Array.from([1, 5, NaN])
const b = Float32Array.from([3, 1, 2])

test('moyenne par point', () => {
  expect(Array.from(agreger([a, b], 'moyenne'))).toEqual([2, 3, NaN])
})

test('pire trajet par point', () => {
  expect(Array.from(agreger([a, b], 'pire'))).toEqual([3, 5, NaN])
})

test('aucune couche : tout est NaN', () => {
  expect(Array.from(agreger([], 'pire', 2))).toEqual([NaN, NaN])
})

test('meilleurIndice ignore les NaN et rend -1 si tout est vide', () => {
  expect(meilleurIndice(Float32Array.from([NaN, 4, 2]))).toBe(2)
  expect(meilleurIndice(Float32Array.from([NaN]))).toBe(-1)
})

test('distancesOiseau met NaN hors de France', () => {
  const g: Grille = { lon0: 2, lat0: 48, pasLon: 1, pasLat: 1, nx: 2, ny: 1, dedans: new Uint8Array([1, 0]) }
  const d = distancesOiseau(g, 48, 2)
  expect(d[0]).toBe(0)
  expect(Number.isNaN(d[1])).toBe(true)
})
```

Run: `npm test` : FAIL.

- [ ] **Step 2 : implémentation**

`src/calcul/agregat.ts` :

```ts
import type { Critere } from '../types'
import { haversineKm } from './geo'
import { coordonnees, type Grille } from './grille'

export function distancesOiseau(g: Grille, lat: number, lon: number): Float32Array {
  const sortie = new Float32Array(g.nx * g.ny).fill(Number.NaN)
  for (let i = 0; i < sortie.length; i++) {
    if (g.dedans[i] !== 1) continue
    const [plon, plat] = coordonnees(g, i)
    sortie[i] = haversineKm(lat, lon, plat, plon)
  }
  return sortie
}

function agregerPoint(couches: Float32Array[], i: number, critere: Critere): number {
  let somme = 0
  let pire = -Infinity
  for (const couche of couches) {
    const v = couche[i]!
    if (Number.isNaN(v)) return Number.NaN
    somme += v
    if (v > pire) pire = v
  }
  return critere === 'moyenne' ? somme / couches.length : pire
}

/** Agrège des couches alignées ; `taille` sert quand la liste est vide. */
export function agreger(couches: Float32Array[], critere: Critere, taille = couches[0]?.length ?? 0): Float32Array {
  const sortie = new Float32Array(taille).fill(Number.NaN)
  if (couches.length === 0) return sortie
  for (let i = 0; i < taille; i++) sortie[i] = agregerPoint(couches, i, critere)
  return sortie
}

export function meilleurIndice(valeurs: Float32Array): number {
  let meilleur = -1
  let min = Infinity
  for (let i = 0; i < valeurs.length; i++) {
    const v = valeurs[i]!
    if (v < min) {
      min = v
      meilleur = i
    }
  }
  return meilleur
}
```

`v < min` est faux pour `NaN`, donc les points sans valeur sont ignorés.

Run: `npm test` : PASS.

- [ ] **Step 3 : commit**

```bash
git add -A && git commit -m "feat: agrégation moyenne et pire trajet"
```

---

### Task 5 : zones colorées

**Files:**
- Create: `src/calcul/zones.ts`
- Test: `tests/unit/zones.test.ts`

d3-contour trace les régions où la valeur est **supérieure ou égale** à un
seuil, en coordonnées de pixels : le point d'indice `x` a son centre en
`x + 0.5`. On veut les régions **inférieures ou égales** au seuil : on
contourne l'opposé des valeurs. Les points sans valeur reçoivent une valeur
très basse après négation, donc sont exclus, sans dépendre de la façon dont
la bibliothèque traite `NaN`.

- [ ] **Step 1 : tests qui échouent**

`tests/unit/zones.test.ts` :

```ts
import { expect, test } from 'vitest'
import { COULEURS_TRANCHES, seuils, zones } from '../../src/calcul/zones'
import type { Grille } from '../../src/calcul/grille'

test('seuils par pas jusqu’au maximum inclus', () => {
  expect(seuils(100, 350)).toEqual([100, 200, 300, 350])
})

test('sans maximum, seuils jusqu’à la plus grande valeur, bornés au nombre de couleurs', () => {
  expect(seuils(100, null, 250)).toEqual([100, 200, 250])
  expect(seuils(100, null, 5000).length).toBe(COULEURS_TRANCHES.length)
})

test('zones rend une tranche par seuil, en lon/lat, de la plus large à la plus étroite', () => {
  const g: Grille = { lon0: 0, lat0: 40, pasLon: 1, pasLat: 1, nx: 3, ny: 3, dedans: new Uint8Array(9).fill(1) }
  const v = Float32Array.from([9, 9, 9, 9, 1, 9, 9, 9, 9])
  const t = zones(g, v, [5, 10])
  expect(t.map((z) => z.seuil)).toEqual([10, 5])
  const anneau = t[1]!.coordonnees[0]![0]!
  for (const [lon, lat] of anneau) {
    expect(lon).toBeGreaterThanOrEqual(0)
    expect(lon).toBeLessThanOrEqual(2)
    expect(lat).toBeGreaterThanOrEqual(40)
    expect(lat).toBeLessThanOrEqual(42)
  }
})
```

Run: `npm test` : FAIL.

- [ ] **Step 2 : implémentation**

`src/calcul/zones.ts` :

```ts
import { contours } from 'd3-contour'
import type { Grille } from './grille'

/** Du plus proche (vert) au plus loin (rouge). */
export const COULEURS_TRANCHES = ['#1a9850', '#66bd63', '#a6d96a', '#d9ef8b', '#fee08b', '#fdae61', '#f46d43', '#d73027'] as const

const HORS_ZONE = 1e9

export interface Tranche {
  seuil: number
  couleur: string
  /** MultiPolygon GeoJSON en [lon, lat]. */
  coordonnees: number[][][][]
}

/** pas, 2 pas, ... jusqu'au plafond (max, sinon la plus grande valeur), plafond inclus. */
export function seuils(pas: number, max: number | null, plusGrande = 0): number[] {
  const grande = Number.isFinite(plusGrande) ? plusGrande : 0
  const plafond = max ?? Math.min(grande, pas * COULEURS_TRANCHES.length)
  const liste: number[] = []
  for (let s = pas; s < plafond && liste.length < COULEURS_TRANCHES.length - 1; s += pas) liste.push(s)
  liste.push(plafond)
  return liste
}

export function zones(g: Grille, valeurs: Float32Array, listeSeuils: number[]): Tranche[] {
  const opposees = Array.from(valeurs, (v, i) => (g.dedans[i] === 1 && Number.isFinite(v) ? -v : -HORS_ZONE))
  const generateur = contours().size([g.nx, g.ny]).thresholds(listeSeuils.map((s) => -s))
  const versLonLat = ([x, y]: number[]): number[] => [g.lon0 + (x! - 0.5) * g.pasLon, g.lat0 + (y! - 0.5) * g.pasLat]
  // d3-contour trie toujours ses seuils par ordre croissant avant de générer les contours
  // (contours.js:44), quel que soit l'ordre passé à .thresholds() : on ne peut donc pas
  // déduire le seuil d'origine du rang de sortie. On relit le seuil directement sur chaque
  // contour rendu (`-c.value`), et la couleur vient de son rang dans une copie croissante de
  // `listeSeuils` (le plus petit seuil = le plus proche = vert, COULEURS_TRANCHES[0]).
  const listeAscendante = [...listeSeuils].sort((a, b) => a - b)
  return generateur(opposees)
    .map((c) => {
      const seuil = -c.value
      const position = listeAscendante.indexOf(seuil)
      return {
        seuil,
        couleur: COULEURS_TRANCHES[Math.min(position, COULEURS_TRANCHES.length - 1)]!,
        coordonnees: c.coordinates.map((poly) => poly.map((anneau) => anneau.map(versLonLat))),
      }
    })
    .sort((a, b) => b.seuil - a.seuil)
}
```

d3 trie toujours les seuils par ordre croissant (contours.js:44) : le seuil
est donc relu sur chaque contour (`-c.value`), jamais déduit du rang.

Run: `npm test` : PASS. Si le test des bornes échoue d'un demi-pas, la
cause est la conversion `x - 0.5`, pas le test.

- [ ] **Step 3 : commit**

```bash
git add -A && git commit -m "feat: zones colorées par tranches"
```

---

### Task 6 : classement des villes

**Files:**
- Create: `src/calcul/villes.ts`
- Test: `tests/unit/villes.test.ts`

- [ ] **Step 1 : tests qui échouent**

`tests/unit/villes.test.ts` :

```ts
import { expect, test } from 'vitest'
import { classerVilles } from '../../src/calcul/villes'
import type { Ville } from '../../src/types'

const v = (nom: string, lat: number, lon: number): Ville => ({ nom, dep: '00', lat, lon, population: 1 })

test('classe par critère, filtre au maximum', () => {
  const amis = [{ lat: 48, lon: 2 }, { lat: 48, lon: 4 }]
  const villes = [v('Loin', 48, 10), v('Milieu', 48, 3), v('Bord', 48, 2)]
  const r = classerVilles(villes, amis, 'pire', 200, 10)
  expect(r.map((x) => x.ville.nom)).toEqual(['Milieu', 'Bord'])
  expect(r[0]!.parAmi).toHaveLength(2)
  expect(r[0]!.total).toBeCloseTo(r[0]!.parAmi[0]! + r[0]!.parAmi[1]!)
})

test('sans ami, aucune ville', () => {
  expect(classerVilles([v('A', 48, 2)], [], 'moyenne', null, 10)).toEqual([])
})
```

Run: `npm test` : FAIL.

- [ ] **Step 2 : implémentation**

`src/calcul/villes.ts` :

```ts
import type { Critere, Ville } from '../types'
import { haversineKm } from './geo'

export interface VilleClassee {
  ville: Ville
  parAmi: number[]
  total: number
  moyenne: number
  pire: number
}

/** Vol d'oiseau : calcul exact au centre de chaque ville. */
export function classerVilles(
  villes: Ville[],
  amis: { lat: number; lon: number }[],
  critere: Critere,
  max: number | null,
  limite: number,
): VilleClassee[] {
  if (amis.length === 0) return []
  return villes
    .map((ville) => {
      const parAmi = amis.map((a) => haversineKm(a.lat, a.lon, ville.lat, ville.lon))
      const total = parAmi.reduce((s, d) => s + d, 0)
      return { ville, parAmi, total, moyenne: total / parAmi.length, pire: Math.max(...parAmi) }
    })
    .filter((c) => max === null || c[critere] <= max)
    .sort((x, y) => x[critere] - y[critere] || x.moyenne - y.moyenne)
    .slice(0, limite)
}
```

Run: `npm test` : PASS.

- [ ] **Step 3 : commit**

```bash
git add -A && git commit -m "feat: classement des villes candidates"
```

---

### Task 7 : état dans l'URL

**Files:**
- Create: `src/etat/url.ts`
- Test: `tests/unit/url.test.ts`

- [ ] **Step 1 : tests qui échouent**

`tests/unit/url.test.ts` :

```ts
import { expect, test } from 'vitest'
import { ETAT_DEFAUT, ecrireEtat, lireEtat } from '../../src/etat/url'
import type { Etat } from '../../src/types'

test('URL vide : état par défaut', () => {
  expect(lireEtat('')).toEqual(ETAT_DEFAUT)
})

test('aller-retour complet', () => {
  const e: Etat = {
    mode: 'oiseau', critere: 'moyenne', max: 300,
    selection: ['a1', 'b2'], lieu: { lat: 45.75, lon: 4.85, label: 'Lyon, Rhône' },
  }
  expect(lireEtat(ecrireEtat(e))).toEqual(e)
})

test('sélection vide conservée', () => {
  expect(lireEtat(ecrireEtat({ ...ETAT_DEFAUT, selection: [] })).selection).toEqual([])
})

test('valeurs invalides ignorées', () => {
  expect(lireEtat('?mode=avion&critere=x&max=-3&lieu=abc')).toEqual(ETAT_DEFAUT)
})
```

Run: `npm test` : FAIL.

- [ ] **Step 2 : implémentation**

`src/etat/url.ts` :

```ts
import type { Critere, Etat, Lieu, Mode } from '../types'

/** Plan 1 : seul le vol d'oiseau est calculé, d'où ce mode par défaut. */
export const ETAT_DEFAUT: Etat = { mode: 'oiseau', critere: 'pire', max: null, selection: null, lieu: null }

const MODES: Mode[] = ['mixte', 'voiture', 'tc', 'oiseau']
const CRITERES: Critere[] = ['moyenne', 'pire']

function lireLieu(brut: string | null): Lieu | null {
  if (!brut) return null
  const [lat, lon, ...reste] = brut.split(',')
  const la = Number(lat)
  const lo = Number(lon)
  if (!Number.isFinite(la) || !Number.isFinite(lo) || reste.length === 0) return null
  return { lat: la, lon: lo, label: reste.join(',') }
}

export function lireEtat(recherche: string): Etat {
  const p = new URLSearchParams(recherche)
  const mode = p.get('mode') as Mode
  const critere = p.get('critere') as Critere
  const max = Number(p.get('max'))
  const sel = p.get('sel')
  return {
    mode: MODES.includes(mode) ? mode : ETAT_DEFAUT.mode,
    critere: CRITERES.includes(critere) ? critere : ETAT_DEFAUT.critere,
    max: p.has('max') && Number.isFinite(max) && max > 0 ? max : null,
    selection: sel === null ? null : sel.split(',').filter(Boolean),
    lieu: lireLieu(p.get('lieu')),
  }
}

export function ecrireEtat(e: Etat): string {
  const p = new URLSearchParams()
  p.set('mode', e.mode)
  p.set('critere', e.critere)
  if (e.max !== null) p.set('max', String(e.max))
  if (e.selection !== null) p.set('sel', e.selection.join(','))
  if (e.lieu) p.set('lieu', `${e.lieu.lat.toFixed(5)},${e.lieu.lon.toFixed(5)},${e.lieu.label}`)
  return `?${p.toString()}`
}
```

Run: `npm test` : PASS.

- [ ] **Step 3 : commit**

```bash
git add -A && git commit -m "feat: état de la vue dans l'URL"
```

---

### Task 8 : base Supabase et accès aux données

**Files:**
- Create: `supabase/migrations/20260917000000_amis_groupes.sql`, `src/donnees/supabase.ts`, `src/donnees/auth.ts`, `src/donnees/amis.ts`, `src/donnees/groupes.ts`
- Test: `tests/unit/amis.test.ts`

- [ ] **Step 1 : migration**

`supabase/migrations/20260917000000_amis_groupes.sql` :

```sql
create table public.amis (
  id uuid primary key default gen_random_uuid(),
  nom text not null check (char_length(nom) between 1 and 60),
  adresse text not null check (char_length(adresse) between 3 and 200),
  lat double precision not null check (lat between 41 and 51.5),
  lon double precision not null check (lon between -5.5 and 10),
  transport text not null default 'tc' check (transport in ('voiture', 'tc')),
  navigo boolean not null default false,
  maj_le timestamptz not null default now()
);

create table public.groupes (
  id uuid primary key default gen_random_uuid(),
  nom text not null unique check (char_length(nom) between 1 and 40),
  amis uuid[] not null default '{}'
);

alter table public.amis enable row level security;
alter table public.groupes enable row level security;

create policy "groupe connecté : amis" on public.amis
  for all to authenticated using (true) with check (true);
create policy "groupe connecté : groupes" on public.groupes
  for all to authenticated using (true) with check (true);

create or replace function public.toucher_maj_le() returns trigger
language plpgsql as $$ begin new.maj_le := now(); return new; end $$;

create trigger amis_maj_le before update on public.amis
  for each row execute function public.toucher_maj_le();
```

Aucune politique pour le rôle `anon` : sans connexion, les deux tables
rendent zéro ligne.

- [ ] **Step 2 : test de validation (échoue)**

La validation côté client double les contraintes SQL pour afficher un
message clair.

`tests/unit/amis.test.ts` :

```ts
import { expect, test } from 'vitest'
import { validerAmi } from '../../src/donnees/amis'
import type { NouvelAmi } from '../../src/types'

const ok: NouvelAmi = { nom: 'Léa', adresse: '10 Rue de Rivoli 75004 Paris', lat: 48.8555, lon: 2.36041, transport: 'tc', navigo: true }

test('un ami valide passe', () => {
  expect(validerAmi(ok)).toEqual(ok)
})

test('le nom est nettoyé des espaces', () => {
  expect(validerAmi({ ...ok, nom: '  Léa ' }).nom).toBe('Léa')
})

test('nom vide refusé', () => {
  expect(() => validerAmi({ ...ok, nom: '  ' })).toThrow('nom')
})

test('adresse hors France métropolitaine refusée', () => {
  expect(() => validerAmi({ ...ok, lat: 16.2 })).toThrow('France')
})

test('moyen de transport inconnu refusé', () => {
  expect(() => validerAmi({ ...ok, transport: 'avion' as NouvelAmi['transport'] })).toThrow('transport')
})
```

Run: `npm test` : FAIL.

- [ ] **Step 3 : client, auth, amis, groupes**

`src/donnees/supabase.ts` :

```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null

export function supabase(): SupabaseClient {
  if (client) return client
  const url = import.meta.env.VITE_SUPABASE_URL
  const cle = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!url || !cle) throw new Error('Configuration Supabase absente (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY).')
  client = createClient(url, cle)
  return client
}
```

`src/donnees/auth.ts` :

```ts
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
```

`src/donnees/amis.ts` :

```ts
import type { Ami, NouvelAmi } from '../types'
import { supabase } from './supabase'

const COLONNES = 'id, nom, adresse, lat, lon, transport, navigo'
const TRANSPORTS = ['voiture', 'tc']

export function validerAmi(a: NouvelAmi): NouvelAmi {
  const nom = a.nom.trim()
  if (nom.length < 1 || nom.length > 60) throw new Error('Le nom doit faire entre 1 et 60 caractères.')
  if (a.lat < 41 || a.lat > 51.5 || a.lon < -5.5 || a.lon > 10) {
    throw new Error('L’adresse doit être en France métropolitaine.')
  }
  if (!TRANSPORTS.includes(a.transport)) throw new Error('Choisis un moyen de transport : voiture ou transports en commun.')
  return { ...a, nom, adresse: a.adresse.trim() }
}

function verifier<T>(data: T | null, error: { message: string } | null, action: string): T {
  if (error || data === null) throw new Error(`Impossible de ${action} : ${error?.message ?? 'réponse vide'}`)
  return data
}

export async function listerAmis(): Promise<Ami[]> {
  const { data, error } = await supabase().from('amis').select(COLONNES).order('nom')
  return verifier(data, error, 'charger les amis')
}

export async function ajouterAmi(a: NouvelAmi): Promise<Ami> {
  const { data, error } = await supabase().from('amis').insert(validerAmi(a)).select(COLONNES).single()
  return verifier(data, error, 'ajouter l’ami')
}

export async function modifierAmi(id: string, a: NouvelAmi): Promise<Ami> {
  const { data, error } = await supabase().from('amis').update(validerAmi(a)).eq('id', id).select(COLONNES).single()
  return verifier(data, error, 'modifier l’ami')
}

export async function supprimerAmi(id: string): Promise<void> {
  const { error } = await supabase().from('amis').delete().eq('id', id)
  if (error) throw new Error(`Impossible de supprimer l’ami : ${error.message}`)
}
```

`src/donnees/groupes.ts` :

```ts
import type { Groupe } from '../types'
import { supabase } from './supabase'

export async function listerGroupes(): Promise<Groupe[]> {
  const { data, error } = await supabase().from('groupes').select('id, nom, amis').order('nom')
  if (error) throw new Error(`Impossible de charger les groupes : ${error.message}`)
  return data ?? []
}

export async function enregistrerGroupe(nom: string, amis: string[]): Promise<Groupe> {
  const propre = nom.trim()
  if (propre.length < 1 || propre.length > 40) throw new Error('Le nom du groupe doit faire entre 1 et 40 caractères.')
  const { data, error } = await supabase()
    .from('groupes')
    .upsert({ nom: propre, amis }, { onConflict: 'nom' })
    .select('id, nom, amis')
    .single()
  if (error || !data) throw new Error(`Impossible d’enregistrer le groupe : ${error?.message ?? 'réponse vide'}`)
  return data
}
```

- [ ] **Step 4 : vérifier**

Run: `npm test && npx tsc --noEmit`
Expected: PASS, aucune erreur de type.

- [ ] **Step 5 : commit**

```bash
git add -A && git commit -m "feat: schéma Supabase, connexion et accès aux amis et groupes"
```

---

### Task 9 : géocodage IGN

**Files:**
- Create: `src/donnees/geocodage.ts`
- Test: `tests/unit/geocodage.test.ts`

Réponse réelle vérifiée le 2026-09-17 :
`GET https://data.geopf.fr/geocodage/search?q=...&limit=5` rend un
FeatureCollection ; `geometry.coordinates = [lon, lat]`,
`properties.label = "10 Rue de Rivoli 75004 Paris"`.

- [ ] **Step 1 : tests qui échouent**

`tests/unit/geocodage.test.ts` :

```ts
import { expect, test, vi } from 'vitest'
import { chercherAdresses } from '../../src/donnees/geocodage'

const reponse = {
  type: 'FeatureCollection',
  features: [{ geometry: { coordinates: [2.36041, 48.8555] }, properties: { label: '10 Rue de Rivoli 75004 Paris' } }],
}

test('convertit la réponse IGN', async () => {
  const f = vi.fn().mockResolvedValue({ ok: true, json: async () => reponse })
  const r = await chercherAdresses('10 rue de rivoli', f)
  expect(r).toEqual([{ label: '10 Rue de Rivoli 75004 Paris', lat: 48.8555, lon: 2.36041 }])
  expect(f.mock.calls[0]![0]).toContain('q=10+rue+de+rivoli')
})

test('moins de 3 caractères : aucun appel', async () => {
  const f = vi.fn()
  expect(await chercherAdresses('ab', f)).toEqual([])
  expect(f).not.toHaveBeenCalled()
})

test('erreur HTTP : message clair', async () => {
  const f = vi.fn().mockResolvedValue({ ok: false, status: 503 })
  await expect(chercherAdresses('paris', f)).rejects.toThrow('recherche d’adresse')
})
```

Run: `npm test` : FAIL.

- [ ] **Step 2 : implémentation**

`src/donnees/geocodage.ts` :

```ts
import type { Lieu } from '../types'

const URL_IGN = 'https://data.geopf.fr/geocodage/search'
const LONGUEUR_MIN = 3
const NB_PROPOSITIONS = '5'

interface ReponseIgn {
  features: { geometry: { coordinates: [number, number] }; properties: { label: string } }[]
}

export async function chercherAdresses(texte: string, f: typeof fetch = fetch): Promise<Lieu[]> {
  const q = texte.trim()
  if (q.length < LONGUEUR_MIN) return []
  const params = new URLSearchParams({ q, limit: NB_PROPOSITIONS })
  const reponse = await f(`${URL_IGN}?${params}`)
  if (!reponse.ok) throw new Error(`La recherche d’adresse a échoué (HTTP ${reponse.status}).`)
  const corps = (await reponse.json()) as ReponseIgn
  return corps.features.map((x) => ({
    label: x.properties.label,
    lon: x.geometry.coordinates[0],
    lat: x.geometry.coordinates[1],
  }))
}
```

Run: `npm test` : PASS.

- [ ] **Step 3 : commit**

```bash
git add -A && git commit -m "feat: recherche d'adresse IGN"
```

---

### Décisions d'architecture (revue du 2026-09-17)

**E1. Grille de 4 km (choix de Franck).** La grille de 2 km (321408 points,
1,3 Mo par personne) coûterait environ 50 Mo pour 40 personnes sur un
téléphone et retracerait les contours sur tous ces points à chaque case
cochée. Passer à 4 km (environ 80000 points, 320 Ko par personne) :
- `scripts/generer-grille.mjs` : `PAS_KM = 4`, sortie
  `public/data/grille-4km.json` ; supprimer `public/data/grille-2km.json`.
- `src/donnees/statiques.ts` : `chargerGrille` lit `data/grille-4km.json`.
- Script `donnees` de `package.json` inchangé.
- Réaliser cette décision en **premier** dans le lot des Tasks 10 et
  suivantes, avec son propre commit `perf: grille de 4 km`.

**E2. Réveil automatique de Supabase (choix de Franck).** Un projet gratuit
se met en pause après 7 jours sans activité. Task 16 ajoute
`.github/workflows/reveil.yml` :

```yaml
name: reveil
on:
  schedule:
    - cron: '17 6 * * 1,4'
  workflow_dispatch:
permissions: {}
jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - name: Interroger la base
        env:
          URL: ${{ vars.SUPABASE_URL }}
          CLE: ${{ vars.SUPABASE_ANON_KEY }}
        run: |
          code=$(curl -s -o /dev/null -w '%{http_code}' "$URL/rest/v1/amis?select=id&limit=1" -H "apikey: $CLE")
          echo "HTTP $code"
          test "$code" = 200
```

La requête anonyme rend `[]` (aucune politique pour `anon`) : elle réveille
la base sans lire aucune donnée.

**E3. Rafraîchir sans perdre le focus.** `rafraichir` reconstruit le
panneau à chaque changement ; une personne au clavier perdrait sa place.
Dans `main.ts`, avant de reconstruire, mémoriser
`document.activeElement?.getAttribute('data-id') ?? document.activeElement?.id`
et, après, redonner le focus à l'élément équivalent s'il existe. Test
Playwright : cocher une case au clavier (`Space`) laisse le focus sur
cette case.

**E4. Ne retracer les zones que si nécessaire.** Tester un lieu ou ouvrir
une ville ne change pas les zones. `rendreCarte` garde en mémoire la clé
`${mode}|${critere}|${max}|${ids triés}|${version des amis}` du dernier
tracé et ne recalcule agrégat, contours et légende que si elle change.
Test unitaire sur une fonction pure `cleZones(etat, ids, version)`.

**E5. Vérifier que l'inscription est fermée.** Task 16, étape de
vérification en ligne, ajoute :

```bash
curl -s -X POST "https://<projet>.supabase.co/auth/v1/signup" -H "apikey: <clé anon>" -H "Content-Type: application/json" -d '{"email":"essai@exemple.fr","password":"essai-123456"}'
```

Expected : une erreur « Signups not allowed ». Sinon, n'importe qui
possédant l'adresse de la page pourrait créer un compte et lire les
adresses.

**Flux des données (plan 1).**

```
 connexion ──> Supabase Auth (compte partagé)
                    │ session
                    v
 listerAmis / listerGroupes ──> Session { amis, groupes, etat }
 grille-4km.json + villes.json ─┘            │
                                             v
 changement (case, filtre, lieu) ──> changer() ──> rafraichir()
        ├─ URL (ecrireEtat)
        ├─ panneau : amis, filtres, lieu, villes (classerVilles)
        └─ carte : si cleZones change
              distancesOiseau (cache par ami) ─> agreger ─> seuils ─> zones ─> légende
```

### Décisions de design (revue du 2026-09-17, s'appliquent aux Tasks 10 à 15)

Ces décisions **priment** sur le code des Tasks 10 à 15 là où ils divergent.
L'implémenteur applique le code des tâches puis ces ajustements, avec
tests.

**D1. Palette des zones : dégradé de vert (choix de Franck).** Une distance
est une grandeur qui croît, pas un écart autour d'un centre : pas de vert,
jaune, rouge. Dans `src/calcul/zones.ts`, remplacer `COULEURS_TRANCHES` par :

```ts
/** Du plus proche (vert profond) au plus loin (presque transparent). */
export const COULEURS_TRANCHES = ['#0b5d2a', '#1a7f3c', '#2f9e52', '#55b86f', '#86cf95', '#b5e2bd', '#d6efd9', '#ecf8ee'] as const
```

Rendu retenu après essai (Franck, 2026-09-17 : « trop opaque ») : une seule
teinte `#1a7f3c` à 9 % d'opacité par tranche, empilée ; le dégradé vient
du cumul (`src/ui/rendu-zones.ts`, `opaciteCumulee`). La légende montre
l'opacité cumulée de chaque tranche. Fond de carte OpenStreetMap en gris
(CARTO exige désormais une clé).

**D2. Légende obligatoire.** Nouveau module `src/ui/legende.ts`, test
`tests/unit/legende.test.ts` :

```ts
import type { Tranche } from '../calcul/zones'
import { km } from './format'

/** Réglette horizontale : une case par tranche, bornes sous les cases. */
export function rendreLegende(el: HTMLElement, tranches: Tranche[]): void {
  const croissantes = [...tranches].sort((a, b) => a.seuil - b.seuil)
  el.hidden = croissantes.length === 0
  el.setAttribute('role', 'img')
  el.setAttribute('aria-label', `Légende : ${croissantes.map((t) => `jusqu’à ${km(t.seuil)}`).join(', ')}`)
  el.innerHTML = croissantes
    .map((t) => `<span class="case"><span class="nuance" style="background:${t.couleur}"></span>${km(t.seuil)}</span>`)
    .join('')
}
```

Test : trois tranches données dans le désordre donnent trois cases dans
l'ordre croissant et un `aria-label` qui contient « jusqu’à 100 km » ; une
liste vide cache la légende. La légende est un `<div id="legende"
class="legende">` posé sur la carte (en bas à gauche, au-dessus des
tuiles, `z-index: 500`), rendue dans `rendreCarte`.

**D3. Marqueurs.** Nouveau module pur `src/ui/marqueurs.ts`, test
`tests/unit/marqueurs.test.ts` :

```ts
import type { Ami } from '../types'

export function initiales(nom: string): string {
  const mots = nom.trim().split(/\s+/).filter(Boolean)
  const lettres = mots.length > 1 ? mots[0]![0]! + mots[mots.length - 1]![0]! : (mots[0] ?? '?').slice(0, 2)
  return lettres.toUpperCase()
}

export interface Point {
  lat: number
  lon: number
  amis: Ami[]
}

/** Regroupe les personnes à la même adresse (coordonnées identiques à 5 décimales). */
export function grouperParPosition(amis: Ami[]): Point[] {
  const points = new Map<string, Point>()
  for (const a of amis) {
    const cle = `${a.lat.toFixed(5)},${a.lon.toFixed(5)}`
    const point = points.get(cle) ?? { lat: a.lat, lon: a.lon, amis: [] }
    points.set(cle, { ...point, amis: [...point.amis, a] })
  }
  return [...points.values()]
}

export const etiquette = (p: Point): string => (p.amis.length > 1 ? String(p.amis.length) : initiales(p.amis[0]!.nom))
```

Tests : `initiales('Franck') === 'FR'`, `initiales('Jean Dupont') ===
'JD'`, `initiales('  ') === '?'` ; deux amis au même endroit donnent un
point d'étiquette `'2'`. Dans `carte.ts`, `amis()` dessine un marqueur par
point : pastille ronde de 28 px, fond `--pastille` si au moins une personne
du point est cochée, sinon `--texte-doux`, texte blanc 12 px gras ;
infobulle = noms et moyens de transport de toutes les personnes du point.

Le centre n'utilise plus le marqueur bleu de Leaflet : `L.divIcon` avec
`<span class="cible"></span>` (36 px, anneau extérieur vert `--accent` de
4 px, point central `--pastille` de 10 px). Infobulle : « Meilleur point,
310 km au pire » ou « Meilleur point, 220 km en moyenne ».

**D4. Aucune boîte de dialogue du navigateur.** Pas de `window.prompt` ni
de `window.confirm`.
- Groupe : le bouton « Enregistrer la sélection » affiche sous la rangée un
  petit formulaire en ligne (champ « Nom du groupe » avec libellé visible,
  bouton « Enregistrer le groupe », bouton « Annuler »).
- Suppression dans la fiche : premier clic sur « Supprimer » change le
  bouton en « Confirmer la suppression » (fond `--danger`, texte blanc) ; le
  second clic supprime. Annuler ou fermer la fiche réarme le bouton.
- Tests : le formulaire de groupe appelle `enregistrerGroupe` avec le nom
  saisi et la sélection ; un seul clic sur Supprimer n'appelle pas
  `supprimer`, deux clics l'appellent.

**D5. Mobile : la carte d'abord, avec un volet (choix de Franck).** Sous
1024 px :
- La carte occupe tout l'écran (`position: fixed; inset: 0`).
- Le panneau devient un volet fixé en bas, fond `--surface`, coins
  supérieurs arrondis 18 px, ombre vers le haut. Fermé : hauteur `38dvh`.
  Ouvert (classe `volet-ouvert` sur `.app`) : `88dvh`. La transition porte
  sur `transform` uniquement (`translateY`), 200 ms ; aucune transition si
  `prefers-reduced-motion`.
- En haut du volet, une poignée : `<button id="poignee"
  aria-expanded="false" aria-controls="panneau">Voir la liste</button>`
  (barre de 36 x 4 px au-dessus du texte). Ouvert, le texte devient
  « Réduire ».
- Ordre dans le volet sous 1024 px (propriété CSS `order`) : poignée,
  filtres et titre, première ville du classement, puis amis, lieu testé,
  reste des villes. Sur ordinateur, l'ordre reste celui de la Task 14.
- Le bouton flottant `#bascule` et la classe `voir-carte` sont supprimés.
- Test Playwright mobile : la carte est visible dès l'arrivée ; toucher
  « Voir la liste » passe `aria-expanded` à `true` et le bouton affiche
  « Réduire ».

**D6. États de l'interface.**

| Situation | Ce que voit la personne |
|---|---|
| Chargement initial | Dans le volet ou le panneau : « Chargement de la carte… » (`role="status"`, pas en rouge). |
| Aucune personne en base | À la place des villes : « Ajoute la première personne pour commencer. » et le bouton « Ajouter une personne ». |
| Personne n'est cochée | À la place des villes : « Coche au moins une personne pour voir la carte. » Ni zones, ni centre, légende cachée. |
| Aucune ville sous le maximum | « Aucune ville à moins de 300 km pour tout le monde. Choisis une distance plus grande. » (valeur réelle). |
| Erreur de chargement | Bandeau rouge avec le message et un bouton « Réessayer » qui relance le chargement. |
| Recherche d'adresse sans résultat | Sous le champ : « Aucune adresse trouvée. Ajoute le code postal. » |
| Enregistrement en cours | Bouton désactivé, texte « Enregistrement… » ; il reprend son texte en cas d'erreur. |
| Lieu testé | Carte « lieu » en tête du panneau avec un bouton « Retirer le lieu » qui vide la sélection et l'URL. |

Chaque ligne a un test unitaire dans le module qui l'affiche.

**D7. Accessibilité et surfaces du navigateur.**
- Repères : `<aside id="panneau" aria-label="Recherche et résultats">`,
  carte `role="region" aria-label="Carte des zones"`.
- Le champ « Où se retrouver ? » a un libellé visible « Tester un lieu »
  (le texte indicatif ne sert pas de libellé).
- Sous 1024 px, toute cible tactile fait au moins 44 px de haut
  (`.pastille`, cases à cocher agrandies à 22 px dans une pastille de
  44 px).
- Texte : 16 px minimum pour le corps, 14 px (`.875rem`) pour les
  pastilles ; chiffres en `font-variant-numeric: tabular-nums`.
- Pas de `aria-pressed` sur un `<select>`.
- Surfaces thémées dans `app.css` : `::selection { background:
  var(--accent-fond); color: var(--texte) }`, `caret-color: var(--accent)`,
  `accent-color: var(--accent)` sur `:root`.
- Test Playwright à 375 px : `document.documentElement.scrollWidth <=
  window.innerWidth`.

**D8. Textes.**

| Avant | Après |
|---|---|
| Entrer | Ouvrir la carte |
| + | Ajouter une personne |
| Personne (tout décocher) | Aucune |
| Ajouter un ami / Modifier un ami | Ajouter une personne / Modifier une personne |
| Inclure X | Inclure X (inchangé) |

Les tests unitaires et Playwright sont ajustés à ces libellés.

**Hors périmètre (décidé) :** maquettes générées (la direction Chronotrains
est imposée), mode sombre (usage en journée sur téléphone, à réévaluer),
animation d'arrivée des zones.

---

### Task 10 : styles et formatage

**Files:**
- Create: `src/styles/tokens.css`, `src/styles/app.css`, `src/ui/format.ts`
- Test: `tests/unit/format.test.ts`

Direction : l'interface de Chronotrains. Fond gris-bleu, cartes blanches,
pastilles sombres, accent vert sur les valeurs clés, police Jost
auto-hébergée, titres très gras. Nombres sans espace des milliers.

- [ ] **Step 1 : tests de format (échouent)**

`tests/unit/format.test.ts` :

```ts
import { expect, test } from 'vitest'
import { echapper, km, libelleTransport, titre } from '../../src/ui/format'

test('km sans espace des milliers, arrondi', () => {
  expect(km(1234.4)).toBe('1234 km')
  expect(km(8.26)).toBe('8 km')
})

test('titre selon critère et maximum', () => {
  expect(titre(12, 'pire', 300)).toBe('Où se retrouver à 12, à vol d’oiseau, sans dépasser 300 km')
  expect(titre(1, 'moyenne', null)).toBe('Où se retrouver à 1, à vol d’oiseau, au plus court en moyenne')
})

test('libellés de transport', () => {
  expect(libelleTransport('voiture')).toBe('voiture')
  expect(libelleTransport('tc')).toBe('transports')
})

test('echapper neutralise le HTML', () => {
  expect(echapper('<b>"x"</b>')).toBe('&#60;b&#62;&#34;x&#34;&#60;/b&#62;')
})
```

Run: `npm test` : FAIL.

- [ ] **Step 2 : format**

`src/ui/format.ts` :

```ts
import type { Critere, Transport } from '../types'

export const km = (valeur: number): string => `${Math.round(valeur)} km`

export const libelleTransport = (t: Transport): string => (t === 'voiture' ? 'voiture' : 'transports')

export function titre(nombre: number, critere: Critere, max: number | null): string {
  const debut = `Où se retrouver à ${nombre}, à vol d’oiseau`
  if (max !== null) return `${debut}, sans dépasser ${km(max)}`
  return critere === 'pire' ? `${debut}, au pire trajet le plus court` : `${debut}, au plus court en moyenne`
}

/** Échappe le texte avant insertion dans le HTML. */
export function echapper(texte: string): string {
  return texte.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}
```

Run: `npm test` : PASS.

- [ ] **Step 3 : jetons et styles**

`src/styles/tokens.css` :

```css
:root {
  --fond: #eef1f5;
  --surface: #ffffff;
  --texte: #1c1f24;
  --texte-doux: #5b6472;
  --pastille: #1f2733;
  --pastille-texte: #ffffff;
  --accent: #15803d;
  --accent-fond: #dcfce7;
  --bord: #d9dee6;
  --danger: #b42318;
  --avertissement-fond: #fff4e5;
  --rayon-carte: 14px;
  --rayon-pastille: 10px;
  --ombre: 0 1px 2px rgb(16 24 40 / 6%), 0 4px 12px rgb(16 24 40 / 6%);
  --police: 'Jost', system-ui, sans-serif;
  --titre: clamp(1.6rem, 1.1rem + 2vw, 2.4rem);
  --panneau: 460px;
  --duree: 150ms;
}
```

`src/styles/app.css` :

```css
@import './tokens.css';

* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; }
body { font-family: var(--police); color: var(--texte); background: var(--fond); }
button, input, select { font: inherit; }

.app { display: grid; grid-template-columns: var(--panneau) 1fr; height: 100dvh; }
.panneau { overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 14px; }
.carte { margin: 8px; border-radius: var(--rayon-carte); overflow: hidden; border: 1px solid var(--bord); }

h1 { font-size: var(--titre); font-weight: 800; line-height: 1.1; margin: 4px 0; }

.rang { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.defile { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; }
.villes { display: grid; gap: 12px; }

.pastille {
  border: 0; border-radius: var(--rayon-pastille); padding: 7px 11px;
  background: var(--pastille); color: var(--pastille-texte); font-size: .85rem; font-weight: 500;
  cursor: pointer; white-space: nowrap; transition: transform var(--duree), opacity var(--duree);
}
.pastille:hover { transform: translateY(-1px); }
.pastille:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
.pastille[aria-pressed='false'] { background: var(--surface); color: var(--texte); border: 1px solid var(--bord); }
.pastille:disabled { opacity: .45; cursor: not-allowed; transform: none; }
.pastille.verte { background: var(--accent-fond); color: var(--accent); border: 1px solid var(--accent); }
.pousse { margin-left: auto; }

.ami { display: inline-flex; align-items: center; gap: 6px; background: var(--surface); color: var(--texte); border: 1px solid var(--bord); }
.ami input { accent-color: var(--accent); }
.ami .editer { all: unset; cursor: pointer; }
.ami .editer:focus-visible { outline: 2px solid var(--accent); }
.ami .ville, .ami .moyen { color: var(--texte-doux); }
.ami .moyen { font-size: .75rem; border: 1px solid var(--bord); border-radius: 6px; padding: 0 5px; }

.champ {
  width: 100%; border: 1px solid var(--bord); border-radius: 999px;
  padding: 11px 16px; background: var(--surface);
}
.champ:focus { outline: 3px solid var(--accent-fond); border-color: var(--accent); }
.propositions { list-style: none; margin: 4px 0 0; padding: 0; background: var(--surface); border-radius: 12px; box-shadow: var(--ombre); }
.propositions:empty { display: none; }
.propositions button { width: 100%; text-align: left; border: 0; background: none; padding: 10px 14px; cursor: pointer; }
.propositions button:hover, .propositions button:focus-visible { background: var(--fond); }

.ville-carte {
  display: block; background: var(--surface); border: 1px solid var(--bord); border-radius: var(--rayon-carte);
  padding: 14px 16px; box-shadow: var(--ombre); cursor: pointer; text-align: left; width: 100%;
  transition: transform var(--duree);
}
.ville-carte:hover { transform: translateY(-2px); }
.ville-carte h2 { margin: 0; font-size: 1.25rem; font-weight: 600; }
.ville-carte .dep { color: var(--texte-doux); font-size: .85rem; }
.ville-carte .ligne { margin-top: 8px; display: flex; gap: 8px; align-items: center; font-weight: 500; }
.valeur { background: var(--accent-fond); color: var(--accent); border-radius: 6px; padding: 2px 8px; }

.detail { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: .9rem; }
.detail td { padding: 4px 0; border-top: 1px solid var(--bord); }
.detail td:last-child { text-align: right; font-variant-numeric: tabular-nums; }

.erreur { color: var(--danger); margin: 0; }
.erreur:empty { display: none; }
.bandeau { background: var(--avertissement-fond); border-radius: 10px; padding: 10px 12px; }

.feuille { position: fixed; inset: 0; background: rgb(0 0 0 / 35%); display: grid; place-items: end center; z-index: 1000; }
.feuille form { background: var(--surface); width: min(520px, 100%); border-radius: 18px 18px 0 0; padding: 20px; display: grid; gap: 12px; }
.feuille label { display: grid; gap: 4px; font-weight: 500; }
.feuille fieldset { border: 1px solid var(--bord); border-radius: 12px; display: flex; gap: 16px; }

.connexion { min-height: 100dvh; display: grid; place-items: center; padding: 16px; }
.connexion form { background: var(--surface); border-radius: 18px; padding: 28px; width: min(380px, 100%); display: grid; gap: 14px; box-shadow: var(--ombre); }

.bascule { display: none; }

@media (max-width: 1023px) {
  .app { grid-template-columns: 1fr; }
  .app .carte { display: none; margin: 0; border-radius: 0; border: 0; }
  .app.voir-carte .carte { display: block; }
  .app.voir-carte .panneau { display: none; }
  .bascule {
    display: block; position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
    z-index: 900; box-shadow: var(--ombre); padding: 12px 22px; border-radius: 999px;
  }
  .rang.amis { flex-wrap: nowrap; overflow-x: auto; }
  .feuille { place-items: end stretch; }
}

@media (prefers-reduced-motion: reduce) {
  * { transition: none !important; }
}
```

- [ ] **Step 4 : commit**

```bash
git add -A && git commit -m "feat: jetons de design, styles et formatage"
```

---

### Task 11 : écran de connexion et fiche d'ami

**Files:**
- Create: `src/ui/connexion.ts`, `src/ui/fiche-ami.ts`
- Test: `tests/unit/connexion.test.ts`, `tests/unit/fiche-ami.test.ts`

- [ ] **Step 1 : tests qui échouent**

`tests/unit/connexion.test.ts` :

```ts
import { expect, test, vi } from 'vitest'
import { afficherConnexion } from '../../src/ui/connexion'

test('affiche l’erreur puis appelle succes quand le mot de passe est bon', async () => {
  const racine = document.createElement('div')
  const connecter = vi.fn().mockResolvedValueOnce('Mot de passe incorrect.').mockResolvedValueOnce(null)
  const succes = vi.fn()
  afficherConnexion(racine, connecter, succes)

  const champ = racine.querySelector('input')!
  const form = racine.querySelector('form')!
  champ.value = 'faux'
  form.dispatchEvent(new Event('submit'))
  await vi.waitFor(() => expect(racine.textContent).toContain('Mot de passe incorrect.'))

  champ.value = 'bon'
  form.dispatchEvent(new Event('submit'))
  await vi.waitFor(() => expect(succes).toHaveBeenCalledOnce())
})
```

`tests/unit/fiche-ami.test.ts` :

```ts
import { afterEach, expect, test, vi } from 'vitest'
import { ouvrirFicheAmi } from '../../src/ui/fiche-ami'
import type { Ami } from '../../src/types'

afterEach(() => { document.body.innerHTML = '' })

const lea: Ami = { id: 'a', nom: 'Léa', adresse: '10 Rue de Rivoli 75004 Paris', lat: 48.8555, lon: 2.36041, transport: 'voiture', navigo: false }

test('modifier garde l’adresse et envoie le moyen de transport choisi', async () => {
  const enregistrer = vi.fn().mockResolvedValue(undefined)
  ouvrirFicheAmi(lea, { enregistrer })
  document.querySelector<HTMLInputElement>('input[name="transport"][value="tc"]')!.checked = true
  document.querySelector('form')!.dispatchEvent(new Event('submit'))
  await vi.waitFor(() => expect(enregistrer).toHaveBeenCalledOnce())
  expect(enregistrer.mock.calls[0]![0]).toMatchObject({ nom: 'Léa', transport: 'tc', lat: 48.8555 })
  expect(document.querySelector('.feuille')).toBeNull()
})

test('nouvel ami sans adresse choisie : refus avec message', async () => {
  const enregistrer = vi.fn()
  ouvrirFicheAmi(null, { enregistrer })
  document.querySelector<HTMLInputElement>('input[name="nom"]')!.value = 'Tom'
  document.querySelector('form')!.dispatchEvent(new Event('submit'))
  expect(enregistrer).not.toHaveBeenCalled()
  expect(document.querySelector('.feuille .erreur')!.textContent).toContain('adresse')
})
```

Run: `npm test` : FAIL.

- [ ] **Step 2 : connexion**

`src/ui/connexion.ts` :

```ts
export function afficherConnexion(
  racine: HTMLElement,
  connecter: (mdp: string) => Promise<string | null>,
  succes: () => void,
): void {
  racine.innerHTML = `
    <main class="connexion">
      <form>
        <h1>Point de rencontre</h1>
        <label for="mdp">Mot de passe du groupe</label>
        <input id="mdp" class="champ" type="password" autocomplete="current-password" required />
        <p class="erreur" role="alert"></p>
        <button class="pastille" type="submit">Entrer</button>
      </form>
    </main>`
  const form = racine.querySelector('form')!
  const champ = racine.querySelector<HTMLInputElement>('#mdp')!
  const erreur = racine.querySelector<HTMLParagraphElement>('.erreur')!
  form.addEventListener('submit', async (evt) => {
    evt.preventDefault()
    erreur.textContent = ''
    const message = await connecter(champ.value)
    if (message) {
      erreur.textContent = message
      champ.select()
      return
    }
    succes()
  })
}
```

- [ ] **Step 3 : fiche d'ami**

`src/ui/fiche-ami.ts` :

```ts
import { chercherAdresses } from '../donnees/geocodage'
import type { Ami, Lieu, NouvelAmi, Transport } from '../types'
import { echapper } from './format'

const DELAI_FRAPPE_MS = 250

export interface ActionsFiche {
  enregistrer: (a: NouvelAmi) => Promise<void>
  supprimer?: () => Promise<void>
}

const gabarit = (titre: string, modifiable: boolean): string => `
  <form aria-label="${titre}">
    <h2>${titre}</h2>
    <label>Nom <input class="champ" name="nom" required maxlength="60" /></label>
    <label>Adresse <input class="champ" name="adresse" required autocomplete="off" /></label>
    <ul class="propositions"></ul>
    <fieldset>
      <legend>Se déplace en</legend>
      <label><span><input type="radio" name="transport" value="voiture" /> Voiture</span></label>
      <label><span><input type="radio" name="transport" value="tc" /> Transports en commun</span></label>
    </fieldset>
    <label><span><input type="checkbox" name="navigo" /> Abonné Navigo</span></label>
    <p class="erreur" role="alert"></p>
    <div class="rang">
      <button class="pastille" type="submit">Enregistrer</button>
      <button class="pastille" type="button" data-action="annuler" aria-pressed="false">Annuler</button>
      ${modifiable ? '<button class="pastille" type="button" data-action="supprimer" aria-pressed="false">Supprimer</button>' : ''}
    </div>
  </form>`

function brancherAutocompletion(champ: HTMLInputElement, liste: HTMLUListElement, erreur: HTMLElement, choisir: (l: Lieu | null) => void): void {
  let minuterie = 0
  champ.addEventListener('input', () => {
    choisir(null)
    window.clearTimeout(minuterie)
    minuterie = window.setTimeout(async () => {
      try {
        const lieux = await chercherAdresses(champ.value)
        liste.innerHTML = lieux.map((l, i) => `<li><button type="button" data-i="${i}">${echapper(l.label)}</button></li>`).join('')
        liste.querySelectorAll<HTMLButtonElement>('button').forEach((b) =>
          b.addEventListener('click', () => {
            const lieu = lieux[Number(b.dataset.i)]!
            champ.value = lieu.label
            liste.innerHTML = ''
            choisir(lieu)
          }),
        )
      } catch (e) {
        erreur.textContent = (e as Error).message
      }
    }, DELAI_FRAPPE_MS)
  })
}

export function ouvrirFicheAmi(ami: Ami | null, actions: ActionsFiche): void {
  const fond = document.createElement('div')
  fond.className = 'feuille'
  fond.innerHTML = gabarit(ami ? 'Modifier un ami' : 'Ajouter un ami', ami !== null)
  document.body.append(fond)

  const form = fond.querySelector('form')!
  const champ = (n: string) => form.querySelector<HTMLInputElement>(`[name="${n}"]`)!
  const erreur = form.querySelector<HTMLParagraphElement>('.erreur')!
  let choisi: Lieu | null = ami ? { lat: ami.lat, lon: ami.lon, label: ami.adresse } : null

  champ('nom').value = ami?.nom ?? ''
  champ('adresse').value = ami?.adresse ?? ''
  champ('navigo').checked = ami?.navigo ?? false
  form.querySelector<HTMLInputElement>(`input[name="transport"][value="${ami?.transport ?? 'tc'}"]`)!.checked = true
  brancherAutocompletion(champ('adresse'), form.querySelector('.propositions')!, erreur, (l) => { choisi = l })

  const fermer = () => fond.remove()
  const tenter = async (action: () => Promise<void>) => {
    erreur.textContent = ''
    try {
      await action()
      fermer()
    } catch (e) {
      erreur.textContent = (e as Error).message
    }
  }

  form.querySelector('[data-action="annuler"]')!.addEventListener('click', fermer)
  form.querySelector('[data-action="supprimer"]')?.addEventListener('click', () => {
    if (actions.supprimer && window.confirm(`Supprimer ${ami?.nom} ?`)) void tenter(actions.supprimer)
  })
  form.addEventListener('submit', (evt) => {
    evt.preventDefault()
    if (!choisi) {
      erreur.textContent = 'Choisis une adresse dans la liste proposée.'
      return
    }
    const lieu = choisi
    const transport = form.querySelector<HTMLInputElement>('input[name="transport"]:checked')!.value as Transport
    void tenter(() =>
      actions.enregistrer({
        nom: champ('nom').value,
        adresse: lieu.label,
        lat: lieu.lat,
        lon: lieu.lon,
        transport,
        navigo: champ('navigo').checked,
      }),
    )
  })
  champ('nom').focus()
}
```

Run: `npm test` : PASS.

- [ ] **Step 4 : commit**

```bash
git add -A && git commit -m "feat: écran de connexion et fiche d'ami avec moyen de transport"
```

---

### Task 12 : carte Leaflet

**Files:**
- Create: `src/ui/carte.ts`

Pas de test unitaire : Leaflet a besoin d'un vrai navigateur. Le parcours
Playwright de la Task 15 le couvre.

- [ ] **Step 1 : module carte**

`src/ui/carte.ts` :

```ts
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Tranche } from '../calcul/zones'
import type { Ami, Lieu } from '../types'
import { echapper, libelleTransport } from './format'

const TUILES = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
const ATTRIBUTION = '&copy; OpenStreetMap, &copy; CARTO'
const CENTRE_FRANCE: L.LatLngTuple = [46.6, 2.4]
const ZOOM_FRANCE = 6
const ZOOM_MAX_CADRAGE = 9
const OPACITE_ZONES = 0.35
const COULEUR_ACTIF = '#1f2733'
const COULEUR_INACTIF = '#9aa3af'
const COULEUR_LIEU = '#15803d'

export interface Carte {
  amis(liste: Ami[], selection: Set<string>): void
  zones(tranches: Tranche[]): void
  centre(lat: number, lon: number, libelle: string): void
  sansCentre(): void
  lignes(depuis: Ami[], vers: Lieu | null): void
  recalculer(): void
  surClic(action: (lat: number, lon: number) => void): void
}

const pastilleAmi = (actif: boolean): L.DivIcon =>
  L.divIcon({
    className: '',
    html: `<span style="display:block;width:14px;height:14px;border-radius:50%;border:2px solid #fff;background:${actif ? COULEUR_ACTIF : COULEUR_INACTIF};box-shadow:0 1px 3px #0005"></span>`,
    iconSize: [14, 14],
  })

export function creerCarte(element: HTMLElement): Carte {
  const carte = L.map(element).setView(CENTRE_FRANCE, ZOOM_FRANCE)
  L.tileLayer(TUILES, { attribution: ATTRIBUTION, subdomains: 'abcd', maxZoom: 18 }).addTo(carte)
  const coucheZones = L.layerGroup().addTo(carte)
  const coucheLignes = L.layerGroup().addTo(carte)
  const coucheAmis = L.layerGroup().addTo(carte)
  let marqueurCentre: L.Marker | null = null
  let dejaCadre = false

  return {
    amis(liste, selection) {
      coucheAmis.clearLayers()
      for (const a of liste) {
        L.marker([a.lat, a.lon], { icon: pastilleAmi(selection.has(a.id)), title: a.nom })
          .bindTooltip(`${echapper(a.nom)} (${libelleTransport(a.transport)})`)
          .addTo(coucheAmis)
      }
      if (!dejaCadre && liste.length > 0) {
        carte.fitBounds(L.latLngBounds(liste.map((a) => [a.lat, a.lon])), { padding: [40, 40], maxZoom: ZOOM_MAX_CADRAGE })
        dejaCadre = true
      }
    },
    zones(tranches) {
      coucheZones.clearLayers()
      for (const t of tranches) {
        const forme: GeoJSON.MultiPolygon = { type: 'MultiPolygon', coordinates: t.coordonnees }
        L.geoJSON(forme, { style: { stroke: false, fillColor: t.couleur, fillOpacity: OPACITE_ZONES }, interactive: false }).addTo(coucheZones)
      }
    },
    centre(lat, lon, libelle) {
      marqueurCentre?.remove()
      marqueurCentre = L.marker([lat, lon], { title: libelle }).bindTooltip(echapper(libelle)).addTo(carte)
    },
    sansCentre() {
      marqueurCentre?.remove()
      marqueurCentre = null
    },
    lignes(depuis, vers) {
      coucheLignes.clearLayers()
      if (!vers) return
      for (const a of depuis) {
        L.polyline([[a.lat, a.lon], [vers.lat, vers.lon]], { color: COULEUR_ACTIF, weight: 1.5, opacity: 0.6 }).addTo(coucheLignes)
      }
      L.circleMarker([vers.lat, vers.lon], { radius: 8, color: COULEUR_LIEU, fillOpacity: 1 }).addTo(coucheLignes)
    },
    recalculer() {
      carte.invalidateSize()
    },
    surClic(action) {
      carte.on('click', (e) => action(e.latlng.lat, e.latlng.lng))
    },
  }
}
```

- [ ] **Step 2 : vérifier les types**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 3 : commit**

```bash
git add -A && git commit -m "feat: carte Leaflet avec amis, zones, centre et lignes"
```

---

### Task 13 : panneau (amis, groupes, filtres, villes, lieu)

**Files:**
- Create: `src/ui/amis.ts`, `src/ui/filtres.ts`, `src/ui/liste-villes.ts`, `src/ui/lieu.ts`
- Test: `tests/unit/panneau.test.ts`

- [ ] **Step 1 : tests qui échouent**

`tests/unit/panneau.test.ts` :

```ts
import { expect, test, vi } from 'vitest'
import { rendreAmis, type ActionsAmis } from '../../src/ui/amis'
import { rendreFiltres } from '../../src/ui/filtres'
import { rendreResultatLieu } from '../../src/ui/lieu'
import { rendreVilles } from '../../src/ui/liste-villes'
import { ETAT_DEFAUT } from '../../src/etat/url'
import type { Ami } from '../../src/types'

const amis: Ami[] = [
  { id: 'a', nom: 'Léa', adresse: '1 rue X 75004 Paris', lat: 48.85, lon: 2.36, transport: 'tc', navigo: true },
  { id: 'b', nom: '<b>Tom</b>', adresse: '2 rue Y 69001 Lyon', lat: 45.76, lon: 4.83, transport: 'voiture', navigo: false },
]

const actions = (): ActionsAmis => ({ changerSelection: vi.fn(), editer: vi.fn(), ajouter: vi.fn(), enregistrerGroupe: vi.fn() })

test('décocher un ami rend la sélection sans lui', () => {
  const el = document.createElement('div')
  const a = actions()
  rendreAmis(el, { amis, groupes: [], selection: new Set(['a', 'b']) }, a)
  const caseLea = el.querySelector<HTMLInputElement>('input[data-id="a"]')!
  caseLea.checked = false
  caseLea.dispatchEvent(new Event('change'))
  expect(a.changerSelection).toHaveBeenCalledWith(['b'])
})

test('choisir un groupe coche ses membres encore présents', () => {
  const el = document.createElement('div')
  const a = actions()
  rendreAmis(el, { amis, groupes: [{ id: 'g', nom: 'Sud', amis: ['b', 'disparu'] }], selection: new Set() }, a)
  const select = el.querySelector('select')!
  select.value = 'g'
  select.dispatchEvent(new Event('change'))
  expect(a.changerSelection).toHaveBeenCalledWith(['b'])
})

test('pastille : nom échappé, ville et moyen de transport visibles', () => {
  const el = document.createElement('div')
  rendreAmis(el, { amis, groupes: [], selection: new Set() }, actions())
  expect(el.querySelector('b')).toBeNull()
  expect(el.textContent).toContain('<b>Tom</b>')
  expect(el.textContent).toContain('Lyon')
  expect(el.textContent).toContain('voiture')
})

test('les modes pas encore livrés sont désactivés', () => {
  const el = document.createElement('div')
  rendreFiltres(el, ETAT_DEFAUT, 2, vi.fn())
  for (const m of ['mixte', 'voiture', 'tc']) {
    expect(el.querySelector<HTMLButtonElement>(`[data-mode="${m}"]`)!.disabled).toBe(true)
  }
  expect(el.querySelector('h1')!.textContent).toContain('à 2')
})

test('une carte de ville affiche pire trajet et total', () => {
  const el = document.createElement('div')
  const ville = { nom: 'Dijon', dep: '21', lat: 47.3, lon: 5.04, population: 1 }
  rendreVilles(el, [{ ville, parAmi: [270, 170], total: 440, moyenne: 220, pire: 270 }], amis, vi.fn())
  expect(el.textContent).toContain('Pire trajet 270 km')
  expect(el.textContent).toContain('Total 440 km')
})

test('le lieu testé liste chaque ami', () => {
  const el = document.createElement('div')
  rendreResultatLieu(el, { lat: 47.3, lon: 5.04, label: 'Dijon' }, amis)
  expect(el.querySelectorAll('.detail tr')).toHaveLength(2)
})
```

Run: `npm test` : FAIL.

- [ ] **Step 2 : amis et groupes**

`src/ui/amis.ts` :

```ts
import type { Ami, Groupe } from '../types'
import { echapper, libelleTransport } from './format'

export interface DonneesAmis {
  amis: Ami[]
  groupes: Groupe[]
  selection: Set<string>
}

export interface ActionsAmis {
  changerSelection: (ids: string[]) => void
  editer: (ami: Ami) => void
  ajouter: () => void
  enregistrerGroupe: (nom: string, ids: string[]) => void
}

/** "10 Rue de Rivoli 75004 Paris" donne "Paris". */
const ville = (adresse: string): string => adresse.replace(/^.*\d{5}\s*/, '') || adresse

const pastille = (x: Ami, coche: boolean): string => `
  <span class="pastille ami">
    <input type="checkbox" data-id="${x.id}" aria-label="Inclure ${echapper(x.nom)}" ${coche ? 'checked' : ''} />
    <button type="button" class="editer" data-edit="${x.id}" aria-label="Modifier ${echapper(x.nom)}">
      ${echapper(x.nom)} <span class="ville">${echapper(ville(x.adresse))}</span>
      <span class="moyen">${libelleTransport(x.transport)}</span>
    </button>
  </span>`

export function rendreAmis(el: HTMLElement, d: DonneesAmis, a: ActionsAmis): void {
  el.innerHTML = `
    <div class="rang">
      <button class="pastille" data-action="tous">Tout le monde</button>
      <button class="pastille" data-action="aucun" aria-pressed="false">Personne</button>
      <select class="pastille" aria-label="Groupe enregistré" aria-pressed="false">
        <option value="">Groupes</option>
        ${d.groupes.map((g) => `<option value="${g.id}">${echapper(g.nom)}</option>`).join('')}
      </select>
      <button class="pastille" data-action="groupe" aria-pressed="false">Enregistrer la sélection</button>
    </div>
    <div class="rang amis">
      ${d.amis.map((x) => pastille(x, d.selection.has(x.id))).join('')}
      <button class="pastille" data-action="ajouter" aria-label="Ajouter un ami">+</button>
    </div>`

  const coches = () => [...el.querySelectorAll<HTMLInputElement>('input[data-id]')].filter((c) => c.checked).map((c) => c.dataset.id!)
  el.querySelectorAll<HTMLInputElement>('input[data-id]').forEach((c) => c.addEventListener('change', () => a.changerSelection(coches())))
  el.querySelectorAll<HTMLButtonElement>('[data-edit]').forEach((b) =>
    b.addEventListener('click', () => a.editer(d.amis.find((x) => x.id === b.dataset.edit)!)),
  )
  el.querySelector('[data-action="tous"]')!.addEventListener('click', () => a.changerSelection(d.amis.map((x) => x.id)))
  el.querySelector('[data-action="aucun"]')!.addEventListener('click', () => a.changerSelection([]))
  el.querySelector('[data-action="ajouter"]')!.addEventListener('click', a.ajouter)
  el.querySelector('select')!.addEventListener('change', (evt) => {
    const g = d.groupes.find((x) => x.id === (evt.target as HTMLSelectElement).value)
    if (g) a.changerSelection(g.amis.filter((id) => d.amis.some((x) => x.id === id)))
  })
  el.querySelector('[data-action="groupe"]')!.addEventListener('click', () => {
    const nom = window.prompt('Nom du groupe')
    if (nom) a.enregistrerGroupe(nom, coches())
  })
}
```

- [ ] **Step 3 : filtres et titre**

`src/ui/filtres.ts` :

```ts
import type { Etat } from '../types'
import { titre } from './format'

const MAX_KM = [100, 200, 300, 400, 500, 700]

export function rendreFiltres(el: HTMLElement, e: Etat, nombre: number, changer: (p: Partial<Etat>) => void): void {
  const presse = (vrai: boolean) => `aria-pressed="${vrai}"`
  el.innerHTML = `
    <div class="rang defile">
      <button class="pastille" data-mode="mixte" disabled title="Bientôt" ${presse(false)}>Chacun son moyen</button>
      <button class="pastille" data-mode="voiture" disabled title="Bientôt" ${presse(false)}>Tous en voiture</button>
      <button class="pastille" data-mode="tc" disabled title="Bientôt" ${presse(false)}>Tous en transports</button>
      <button class="pastille" data-mode="oiseau" ${presse(e.mode === 'oiseau')}>Vol d’oiseau</button>
    </div>
    <div class="rang defile">
      <button class="pastille" data-critere="pire" ${presse(e.critere === 'pire')}>Pire trajet</button>
      <button class="pastille" data-critere="moyenne" ${presse(e.critere === 'moyenne')}>Moyenne</button>
      <select class="pastille verte" aria-label="Distance maximum">
        <option value="">Distance maximum</option>
        ${MAX_KM.map((m) => `<option value="${m}" ${e.max === m ? 'selected' : ''}>${m} km max</option>`).join('')}
      </select>
    </div>
    <h1>${titre(nombre, e.critere, e.max)}</h1>`
  el.querySelectorAll<HTMLButtonElement>('[data-critere]').forEach((b) =>
    b.addEventListener('click', () => changer({ critere: b.dataset.critere as Etat['critere'] })),
  )
  el.querySelector('select')!.addEventListener('change', (evt) => {
    const v = (evt.target as HTMLSelectElement).value
    changer({ max: v ? Number(v) : null })
  })
}
```

- [ ] **Step 4 : liste de villes**

`src/ui/liste-villes.ts` :

```ts
import type { VilleClassee } from '../calcul/villes'
import type { Ami } from '../types'
import { echapper, km } from './format'

export function detailParAmi(amis: Ami[], valeurs: number[]): string {
  const lignes = amis
    .map((a, i) => ({ nom: a.nom, v: valeurs[i]! }))
    .sort((x, y) => y.v - x.v)
    .map((l) => `<tr><td>${echapper(l.nom)}</td><td>${km(l.v)}</td></tr>`)
    .join('')
  return `<table class="detail"><tbody>${lignes}</tbody></table>`
}

export function rendreVilles(el: HTMLElement, villes: VilleClassee[], amis: Ami[], choisir: (v: VilleClassee) => void): void {
  if (villes.length === 0) {
    el.innerHTML = '<p>Aucune ville ne respecte ces critères. Élargis la distance maximum ou coche plus d’amis.</p>'
    return
  }
  el.innerHTML = villes
    .map(
      (c, i) => `
      <button class="ville-carte" data-i="${i}" aria-expanded="false">
        <h2>${echapper(c.ville.nom)}</h2>
        <span class="dep">${echapper(c.ville.dep)}</span>
        <span class="ligne">Pire trajet ${km(c.pire)} · <span class="valeur">Total ${km(c.total)}</span></span>
        <span class="zone-detail" hidden>${detailParAmi(amis, c.parAmi)}</span>
      </button>`,
    )
    .join('')
  el.querySelectorAll<HTMLButtonElement>('.ville-carte').forEach((b) =>
    b.addEventListener('click', () => {
      const ouvert = b.getAttribute('aria-expanded') === 'true'
      b.setAttribute('aria-expanded', String(!ouvert))
      b.querySelector<HTMLElement>('.zone-detail')!.hidden = ouvert
      choisir(villes[Number(b.dataset.i)]!)
    }),
  )
}
```

- [ ] **Step 5 : tester un lieu**

`src/ui/lieu.ts` :

```ts
import { haversineKm } from '../calcul/geo'
import { chercherAdresses } from '../donnees/geocodage'
import type { Ami, Lieu } from '../types'
import { echapper, km } from './format'
import { detailParAmi } from './liste-villes'

const DELAI_FRAPPE_MS = 250

export function rendreRechercheLieu(el: HTMLElement, lieu: Lieu | null, choisir: (l: Lieu | null) => void): void {
  el.innerHTML = `
    <input class="champ" type="search" placeholder="Où se retrouver ? Tape une adresse ou touche la carte" aria-label="Tester un lieu" />
    <ul class="propositions"></ul>
    <p class="erreur" role="alert"></p>`
  const champ = el.querySelector('input')!
  const liste = el.querySelector('ul')!
  const erreur = el.querySelector<HTMLParagraphElement>('.erreur')!
  champ.value = lieu?.label ?? ''
  let minuterie = 0
  champ.addEventListener('input', () => {
    window.clearTimeout(minuterie)
    if (champ.value === '') {
      choisir(null)
      return
    }
    minuterie = window.setTimeout(async () => {
      try {
        const lieux = await chercherAdresses(champ.value)
        liste.innerHTML = lieux.map((l, i) => `<li><button type="button" data-i="${i}">${echapper(l.label)}</button></li>`).join('')
        liste.querySelectorAll<HTMLButtonElement>('button').forEach((b) =>
          b.addEventListener('click', () => {
            liste.innerHTML = ''
            choisir(lieux[Number(b.dataset.i)]!)
          }),
        )
      } catch (e) {
        erreur.textContent = (e as Error).message
      }
    }, DELAI_FRAPPE_MS)
  })
}

export function rendreResultatLieu(el: HTMLElement, lieu: Lieu | null, amis: Ami[]): void {
  if (!lieu || amis.length === 0) {
    el.innerHTML = ''
    return
  }
  const valeurs = amis.map((a) => haversineKm(a.lat, a.lon, lieu.lat, lieu.lon))
  const total = valeurs.reduce((s, v) => s + v, 0)
  el.innerHTML = `
    <article class="ville-carte">
      <h2>${echapper(lieu.label)}</h2>
      <span class="ligne">Pire trajet ${km(Math.max(...valeurs))} · <span class="valeur">Total ${km(total)}</span></span>
      ${detailParAmi(amis, valeurs)}
    </article>`
}
```

Note : `rendreRechercheLieu` n'est appelé qu'une fois au démarrage, pour ne
pas effacer la saisie en cours à chaque rafraîchissement.

- [ ] **Step 6 : vérifier**

Run: `npm test && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7 : commit**

```bash
git add -A && git commit -m "feat: panneau amis, groupes, filtres, villes et lieu testé"
```

---

### Task 14 : assemblage

**Files:**
- Modify: `src/main.ts` (remplacement complet)

- [ ] **Step 1 : main.ts**

```ts
import '@fontsource/jost/400.css'
import '@fontsource/jost/500.css'
import '@fontsource/jost/800.css'
import './styles/app.css'
import { agreger, distancesOiseau, meilleurIndice } from './calcul/agregat'
import { coordonnees, type Grille } from './calcul/grille'
import { classerVilles } from './calcul/villes'
import { seuils, zones } from './calcul/zones'
import { ajouterAmi, listerAmis, modifierAmi, supprimerAmi } from './donnees/amis'
import { connecter, deconnecter, estConnecte } from './donnees/auth'
import { enregistrerGroupe, listerGroupes } from './donnees/groupes'
import { chargerGrille, chargerVilles } from './donnees/statiques'
import { ecrireEtat, lireEtat } from './etat/url'
import type { Ami, Etat, Groupe, Ville } from './types'
import { rendreAmis } from './ui/amis'
import { creerCarte, type Carte } from './ui/carte'
import { afficherConnexion } from './ui/connexion'
import { ouvrirFicheAmi } from './ui/fiche-ami'
import { rendreFiltres } from './ui/filtres'
import { km } from './ui/format'
import { rendreRechercheLieu, rendreResultatLieu } from './ui/lieu'
import { rendreVilles } from './ui/liste-villes'

const PAS_KM = 100
const NB_VILLES = 20
const racine = document.querySelector<HTMLElement>('#app')!

interface Session {
  grille: Grille
  villes: Ville[]
  amis: Ami[]
  groupes: Groupe[]
  etat: Etat
  carte: Carte
  /** Distances par ami, recalculées seulement si l'ami a bougé. */
  couches: Map<string, { cle: string; valeurs: Float32Array }>
}

const $ = <T extends HTMLElement>(sel: string): T => document.querySelector<T>(sel)!

function signaler(message: string): void {
  $('#message').textContent = message
}

function amisChoisis(s: Session): Ami[] {
  const sel = s.etat.selection
  return sel === null ? s.amis : s.amis.filter((a) => sel.includes(a.id))
}

function couche(s: Session, a: Ami): Float32Array {
  const cle = `${a.lat},${a.lon}`
  const connue = s.couches.get(a.id)
  if (connue?.cle === cle) return connue.valeurs
  const valeurs = distancesOiseau(s.grille, a.lat, a.lon)
  s.couches.set(a.id, { cle, valeurs })
  return valeurs
}

async function recharger(s: Session): Promise<void> {
  const [amis, groupes] = await Promise.all([listerAmis(), listerGroupes()])
  s.amis = amis
  s.groupes = groupes
  rafraichir(s)
}

function changer(s: Session, p: Partial<Etat>): void {
  s.etat = { ...s.etat, ...p }
  rafraichir(s)
}

function rendrePanneau(s: Session, choisis: Ami[]): void {
  rendreAmis($('#amis'), { amis: s.amis, groupes: s.groupes, selection: new Set(choisis.map((a) => a.id)) }, {
    changerSelection: (ids) => changer(s, { selection: ids }),
    editer: (ami) =>
      ouvrirFicheAmi(ami, {
        enregistrer: async (x) => { await modifierAmi(ami.id, x); await recharger(s) },
        supprimer: async () => { await supprimerAmi(ami.id); await recharger(s) },
      }),
    ajouter: () => ouvrirFicheAmi(null, { enregistrer: async (x) => { await ajouterAmi(x); await recharger(s) } }),
    enregistrerGroupe: (nom, ids) => {
      enregistrerGroupe(nom, ids).then(() => recharger(s)).catch((e: Error) => signaler(e.message))
    },
  })
  rendreFiltres($('#filtres'), s.etat, choisis.length, (p) => changer(s, p))
  rendreResultatLieu($('#resultat-lieu'), s.etat.lieu, choisis)
  const classees = classerVilles(s.villes, choisis, s.etat.critere, s.etat.max, NB_VILLES)
  rendreVilles($('#villes'), classees, choisis, (c) =>
    s.carte.lignes(choisis, { lat: c.ville.lat, lon: c.ville.lon, label: c.ville.nom }),
  )
}

function rendreCarte(s: Session, choisis: Ami[]): void {
  const valeurs = agreger(choisis.map((a) => couche(s, a)), s.etat.critere, s.grille.nx * s.grille.ny)
  let plusGrande = 0
  for (const v of valeurs) if (v > plusGrande) plusGrande = v
  s.carte.zones(choisis.length > 0 ? zones(s.grille, valeurs, seuils(PAS_KM, s.etat.max, plusGrande)) : [])
  s.carte.amis(s.amis, new Set(choisis.map((a) => a.id)))
  s.carte.lignes(choisis, s.etat.lieu)
  const meilleur = meilleurIndice(valeurs)
  if (meilleur < 0) {
    s.carte.sansCentre()
    return
  }
  const [lon, lat] = coordonnees(s.grille, meilleur)
  s.carte.centre(lat, lon, `Centre : ${km(valeurs[meilleur]!)} ${s.etat.critere === 'pire' ? 'au pire' : 'en moyenne'}`)
}

function rafraichir(s: Session): void {
  history.replaceState(null, '', ecrireEtat(s.etat))
  signaler('')
  const choisis = amisChoisis(s)
  rendrePanneau(s, choisis)
  rendreCarte(s, choisis)
}

const SQUELETTE = `
  <div class="app">
    <aside class="panneau">
      <div class="rang"><strong>Point de rencontre</strong>
        <button class="pastille pousse" id="sortir" aria-pressed="false">Se déconnecter</button></div>
      <div id="amis"></div>
      <div id="lieu"></div>
      <div id="resultat-lieu"></div>
      <div id="filtres"></div>
      <p id="message" class="bandeau erreur" role="status"></p>
      <div id="villes" class="villes"></div>
    </aside>
    <div class="carte" id="carte"></div>
    <button class="pastille bascule" id="bascule">Carte</button>
  </div>`

async function demarrer(): Promise<void> {
  racine.innerHTML = SQUELETTE
  const app = $('.app')
  const carte = creerCarte($('#carte'))
  $('#sortir').addEventListener('click', async () => {
    await deconnecter()
    location.reload()
  })
  $('#bascule').addEventListener('click', () => {
    const voir = app.classList.toggle('voir-carte')
    $('#bascule').textContent = voir ? 'Liste' : 'Carte'
    carte.recalculer()
  })
  try {
    const [grille, villes, amis, groupes] = await Promise.all([chargerGrille(), chargerVilles(), listerAmis(), listerGroupes()])
    const s: Session = { grille, villes, amis, groupes, etat: lireEtat(location.search), carte, couches: new Map() }
    rendreRechercheLieu($('#lieu'), s.etat.lieu, (lieu) => changer(s, { lieu }))
    carte.surClic((lat, lon) => changer(s, { lieu: { lat, lon, label: `Point ${lat.toFixed(3)}, ${lon.toFixed(3)}` } }))
    rafraichir(s)
  } catch (e) {
    signaler((e as Error).message)
  }
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
```

- [ ] **Step 2 : vérifier**

Run: `npm test && npm run build`
Expected: PASS, build OK.

- [ ] **Step 3 : essai local contre un vrai Supabase (si Task 16 étape 4 déjà faite)**

Sinon, passer : le parcours Playwright de la Task 15 couvre l'assemblage.

- [ ] **Step 4 : commit**

```bash
git add -A && git commit -m "feat: assemblage de l'appli vol d'oiseau"
```

---

### Task 15 : parcours Playwright avec Supabase simulé

**Files:**
- Create: `playwright.config.ts`, `.env.e2e`, `tests/e2e/parcours.spec.ts`

- [ ] **Step 1 : configuration**

`.env.e2e` (aucun secret, adresse fictive) :

```
VITE_SUPABASE_URL=http://supabase.test
VITE_SUPABASE_ANON_KEY=cle-de-test
VITE_COMPTE_EMAIL=groupe@test.local
```

`playwright.config.ts` :

```ts
import { defineConfig, devices } from '@playwright/test'

const URL_LOCALE = 'http://localhost:4173/point-de-rencontre/'

export default defineConfig({
  testDir: 'tests/e2e',
  use: { baseURL: URL_LOCALE },
  webServer: {
    command: 'npx vite build --mode e2e && npx vite preview --port 4173 --strictPort',
    url: URL_LOCALE,
    reuseExistingServer: false,
  },
  projects: [
    { name: 'mobile', use: { ...devices['iPhone 13'], browserName: 'chromium' } },
    { name: 'ordinateur', use: { viewport: { width: 1440, height: 900 } } },
  ],
})
```

- [ ] **Step 2 : scénario**

`tests/e2e/parcours.spec.ts` :

```ts
import { expect, test, type Page } from '@playwright/test'

interface AmiTest { id: string; nom: string; adresse: string; lat: number; lon: number; transport: string; navigo: boolean }

const depart = (): AmiTest[] => [
  { id: 'a', nom: 'Léa', adresse: '10 Rue de Rivoli 75004 Paris', lat: 48.8555, lon: 2.36041, transport: 'tc', navigo: true },
  { id: 'b', nom: 'Tom', adresse: '1 Place Bellecour 69002 Lyon', lat: 45.7578, lon: 4.832, transport: 'voiture', navigo: false },
]

const MARSEILLE = { geometry: { coordinates: [5.3698, 43.2965] }, properties: { label: '1 La Canebière 13001 Marseille' } }

async function simuler(page: Page): Promise<void> {
  const amis = depart()
  await page.route(/basemaps\.cartocdn\.com/, (r) => r.abort())
  await page.route('http://supabase.test/auth/v1/token**', async (r) => {
    const corps = r.request().postDataJSON() as { password: string }
    if (corps.password !== 'secret') {
      return r.fulfill({ status: 400, json: { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' } })
    }
    return r.fulfill({
      json: {
        access_token: 'jeton', token_type: 'bearer', expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r',
        user: { id: 'u', aud: 'authenticated', role: 'authenticated', email: 'groupe@test.local', app_metadata: {}, user_metadata: {}, created_at: '2026-09-17T00:00:00Z' },
      },
    })
  })
  await page.route('http://supabase.test/rest/v1/amis**', async (r) => {
    if (r.request().method() === 'POST') {
      const nouveau = { id: `n${amis.length}`, ...(r.request().postDataJSON() as Omit<AmiTest, 'id'>) }
      amis.push(nouveau)
      return r.fulfill({ status: 201, json: nouveau })
    }
    return r.fulfill({ json: amis })
  })
  await page.route('http://supabase.test/rest/v1/groupes**', (r) => r.fulfill({ json: [] }))
  await page.route('https://data.geopf.fr/**', (r) => r.fulfill({ json: { type: 'FeatureCollection', features: [MARSEILLE] } }))
}

async function entrer(page: Page): Promise<void> {
  await page.getByLabel('Mot de passe du groupe').fill('secret')
  await page.getByRole('button', { name: 'Entrer' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('à 2')
}

test('connexion, sélection, ajout d’un ami, test d’un lieu', async ({ page }) => {
  await simuler(page)
  await page.goto('./')

  await page.getByLabel('Mot de passe du groupe').fill('faux')
  await page.getByRole('button', { name: 'Entrer' }).click()
  await expect(page.getByRole('alert')).toHaveText('Mot de passe incorrect.')
  await entrer(page)

  await page.getByLabel('Inclure Tom').uncheck()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('à 1')
  await expect(page).toHaveURL(/sel=a/)
  await page.getByRole('button', { name: 'Tout le monde' }).click()

  await page.getByRole('button', { name: 'Ajouter un ami' }).click()
  await page.getByLabel('Nom').fill('Zoé')
  await page.getByLabel('Adresse').fill('canebiere')
  await page.getByRole('button', { name: MARSEILLE.properties.label }).click()
  await page.getByLabel('Voiture').check()
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await expect(page.getByLabel('Inclure Zoé')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Modifier Zoé' })).toContainText('voiture')

  await page.getByLabel('Tester un lieu').fill('canebiere')
  await page.getByRole('button', { name: MARSEILLE.properties.label }).click()
  await expect(page.locator('#resultat-lieu')).toContainText('Léa')
  await expect(page.locator('.ville-carte').nth(1)).toBeVisible()

  await page.screenshot({ path: `test-results/vue-${test.info().project.name}.png` })
})

test('sur mobile, le bouton bascule vers la carte', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'mobile seulement')
  await simuler(page)
  await page.goto('./')
  await entrer(page)
  await page.getByRole('button', { name: 'Carte' }).click()
  await expect(page.locator('#carte')).toBeVisible()
  await expect(page.locator('.panneau')).toBeHidden()
})
```

Après « Tout le monde », la sélection contient les deux amis ; le nouvel
ami, absent de la sélection explicite, apparaît décoché. C'est voulu : la
sélection ne change que par une action de l'utilisateur.

- [ ] **Step 3 : lancer**

Run: `npx playwright install chromium && npm run e2e`
Expected: 3 PASS, 1 SKIP (test mobile sur le projet ordinateur).

Si la connexion simulée échoue, journaliser les requêtes avec
`page.on('request', (r) => console.log(r.method(), r.url()))` : la forme
attendue par `@supabase/supabase-js` fait foi, adapter le simulateur, pas
le code de l'appli.

- [ ] **Step 4 : contrôle visuel**

Run: `open test-results/vue-*.png`
Expected: panneau lisible sur les deux tailles, pastilles alignées, zones
colorées visibles sur fond gris (tuiles bloquées), aucun débordement
horizontal sur mobile.

- [ ] **Step 5 : commit**

```bash
git add -A && git commit -m "test: parcours complet avec Supabase simulé, mobile et ordinateur"
```

---

### Task 16 : GitHub, Pages et Supabase réels

Deux actions reviennent à Franck : créer le projet Supabase (création de
compte) et choisir le mot de passe du groupe.

**Files:**
- Create: `.github/workflows/pages.yml`, `README.md`

- [ ] **Step 1 : workflow**

`.github/workflows/pages.yml` :

```yaml
name: pages
on:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: true
jobs:
  construire:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run build
        env:
          VITE_SUPABASE_URL: ${{ vars.SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ vars.SUPABASE_ANON_KEY }}
          VITE_COMPTE_EMAIL: ${{ vars.COMPTE_EMAIL }}
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
  publier:
    needs: construire
    runs-on: ubuntu-latest
    environment: github-pages
    steps:
      - uses: actions/deploy-pages@v4
```

- [ ] **Step 2 : README**

`README.md` :

````markdown
# Point de rencontre

Où se retrouver entre amis : à vol d'oiseau, puis en voiture et en transports.
Spécification : `docs/superpowers/specs/2026-09-17-point-de-rencontre-design.md`.

## Développer

```bash
cp .env.example .env.local   # renseigner les trois valeurs
npm install
npm run donnees              # régénère grille et villes (déjà commitées)
npm run dev
```

Tests : `npm test` (unitaires), `npm run e2e` (parcours, Supabase simulé).

## Mettre en place Supabase (une fois)

1. Créer un projet sur supabase.com, région Europe.
2. SQL Editor : coller `supabase/migrations/20260917000000_amis_groupes.sql`.
3. Authentication, Sign In / Providers, Email : désactiver « Allow new users to sign up ».
4. Authentication, Users, Add user : e-mail du groupe et mot de passe du groupe.
5. Project Settings, API : relever l'URL du projet et la clé publique `anon`.

## Publier

Variables du dépôt GitHub (Settings, Secrets and variables, Actions, Variables) :
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `COMPTE_EMAIL`. Pages : source « GitHub Actions ».
Chaque push sur `main` teste, construit et publie.

Changer le mot de passe du groupe : Authentication, Users, le compte du groupe.
````

- [ ] **Step 3 : commit et dépôt GitHub**

```bash
git add -A && git commit -m "ci: publication GitHub Pages et documentation"
env -u GITHUB_TOKEN gh repo create point-de-rencontre --public --source . --push
env -u GITHUB_TOKEN gh api -X POST "repos/$(env -u GITHUB_TOKEN gh api user -q .login)/point-de-rencontre/pages" -f build_type=workflow
git log origin/main -1 --oneline
```

Expected: dépôt créé, dernière ligne identique à `git log -1 --oneline`.
Si l'appel `pages` échoue, activer Pages à la main : Settings, Pages,
Source « GitHub Actions ».

- [ ] **Step 4 : Franck crée Supabase (README, étapes 1 à 5), puis**

```bash
env -u GITHUB_TOKEN gh variable set SUPABASE_URL --body "https://<projet>.supabase.co"
env -u GITHUB_TOKEN gh variable set SUPABASE_ANON_KEY --body "<clé anon>"
env -u GITHUB_TOKEN gh variable set COMPTE_EMAIL --body "<e-mail du compte groupe>"
env -u GITHUB_TOKEN gh workflow run pages
```

- [ ] **Step 5 : vérification en ligne**

```bash
curl -s "https://<projet>.supabase.co/rest/v1/amis?select=*" -H "apikey: <clé anon>"
```

Expected: `[]` (sans connexion, aucune adresse ne sort).

Puis ouvrir `https://<login>.github.io/point-de-rencontre/` :
- mot de passe faux refusé, bon mot de passe accepté ;
- ajout d'un ami réel depuis un téléphone ;
- zones, centre et villes visibles ;
- fond de carte CARTO affiché sans filigrane. Sinon, remplacer `TUILES` par
  `https://tile.openstreetmap.org/{z}/{x}/{y}.png`, retirer `subdomains`, et
  mettre l'attribution `&copy; OpenStreetMap`.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | not run | |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | not run | |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR (PLAN) | 5 issues, 0 critical gaps : grille 4 km, réveil Supabase, focus, zones en cache, inscription fermée |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | CLEAR (PLAN) | score: 5/10 → 9/10, 8 decisions |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | not run | |

- **VERDICT:** ENG + DESIGN CLEARED, ready to implement Tasks 10 à 16 avec les décisions E1 à E5 et D1 à D8.

NO UNRESOLVED DECISIONS
