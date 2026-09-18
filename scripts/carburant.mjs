import { writeFile } from 'node:fs/promises'

const SOURCE =
  'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/records' +
  '?select=avg(gazole_prix)%20as%20gazole,avg(sp95_prix)%20as%20sp95,avg(e10_prix)%20as%20e10&limit=1'
const SORTIE = 'public/data/carburant.json'

const reponse = await fetch(SOURCE)
if (!reponse.ok) throw new Error(`prix des carburants : HTTP ${reponse.status}`)
const corps = await reponse.json()
const ligne = corps.results?.[0]
if (!ligne || typeof ligne.gazole !== 'number' || typeof ligne.sp95 !== 'number' || typeof ligne.e10 !== 'number') {
  throw new Error('prix des carburants : réponse inattendue.')
}

const arrondir = (x) => Math.round(x * 1000) / 1000

const sortie = {
  gazole: arrondir(ligne.gazole),
  sp95: arrondir(ligne.sp95),
  e10: arrondir(ligne.e10),
  date: new Date().toISOString().slice(0, 10),
}
await writeFile(SORTIE, JSON.stringify(sortie))
console.log(`carburant : gazole ${sortie.gazole} €, sp95 ${sortie.sp95} €, e10 ${sortie.e10} € (${sortie.date})`)
