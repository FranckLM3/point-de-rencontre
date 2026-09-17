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
