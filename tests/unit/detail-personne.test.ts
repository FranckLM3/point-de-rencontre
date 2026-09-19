import { expect, test } from 'vitest'
import type { TrajetDetaille } from '../../src/calcul/detail'
import type { TrajetTc } from '../../src/calcul/tc'
import { detailPersonnes } from '../../src/ui/detail-personne'
import type { Ami, Lieu } from '../../src/types'

const franck: Ami = { id: 'f', nom: 'Franck', adresse: '89 bd Chave, Marseille', lat: 43.3, lon: 5.39, transport: 'tc', navigo: false }
const mo: Ami = { ...franck, id: 'm', nom: 'Mo', transport: 'voiture' }
const lyon: Lieu = { lat: 45.76, lon: 4.83, label: 'Lyon' }

const trajetTc: TrajetTc = {
  minutes: 192, euros: 45, depart: 'Marseille Saint-Charles', arrivee: 'Paris Gare de Lyon Hall 1 - 2',
  departIndice: 0, arriveeIndice: 2, acces: { minutes: 12, mode: 'transports' }, sortie: { minutes: 8, mode: 'voiture' }, correspondances: 1,
}

const rendre = (trajet: (a: Ami) => TrajetDetaille | null, cible: Lieu | null = lyon, choisis = ['f', 'm']): HTMLElement => {
  const el = document.createElement('div')
  el.innerHTML = detailPersonnes({ amis: [franck, mo], cible, choisis: new Set(choisis), trajet, parametres: null })
  return el
}

test('transports : étapes accès, train avec gare de correspondance, sortie, et total', () => {
  const el = rendre((a) => (a.id === 'f' ? { moyen: 'tc', trajet: trajetTc, via: ['Lyon Part-Dieu'] } : null))
  const fiche = el.querySelectorAll('.detail-personne')[0]!
  expect(fiche.querySelector('h3')!.textContent).toContain('Franck')
  expect(fiche.querySelector('.total')!.textContent).toBe('Vers Lyon : 3 h 12 · ≈ 45 €')
  expect([...fiche.querySelectorAll('.etapes li')].map((li) => li.textContent)).toEqual([
    "12 min en transports jusqu'à Marseille Saint-Charles",
    'Train Marseille Saint-Charles → Paris Gare de Lyon, via Lyon Part-Dieu · 1 correspondance',
    "8 min de voiture jusqu'à Lyon",
  ])
})

test('sans trajet, hors calcul ou sans lieu choisi : une phrase qui dit quoi faire', () => {
  expect(rendre(() => null).querySelectorAll('.note')[1]!.textContent).toBe('Pas de trajet trouvé vers Lyon.')
  expect(rendre(() => null, null).querySelector('.note')!.textContent).toContain('Choisis une ville')
  expect(rendre(() => null, lyon, ['m']).querySelector('.note')!.textContent).toContain('coche ce Croco')
})

test('voiture et vol d’oiseau', () => {
  const el = rendre((a) => (a.id === 'm' ? { moyen: 'voiture', valeur: { minutes: 190, km: 310 } } : { moyen: 'oiseau', km: 277.4 }))
  const [f, m] = el.querySelectorAll('.detail-personne')
  expect(f!.querySelector('.total')!.textContent).toBe('Vers Lyon : 277 km à vol d’oiseau')
  expect(m!.querySelector('.etapes li')!.textContent).toBe('3 h 10 de route · 310 km')
})

test('les noms et adresses sont échappés', () => {
  const el = document.createElement('div')
  const pirate = { ...franck, nom: '<img src=x onerror=alert(1)>' }
  el.innerHTML = detailPersonnes({ amis: [pirate], cible: null, choisis: new Set(), trajet: () => null, parametres: null })
  expect(el.querySelector('img')).toBeNull()
})

test('métro : stations de montée et de descente dans les étapes', () => {
  const reseau = { id: 'idf', nom: 'IDF', gares: [], minutes: new Uint8Array(4), stations: [{ nom: 'Porte de Bagnolet', lat: 0, lon: 0 }, { nom: 'Gare de Lyon', lat: 0, lon: 0 }] }
  const urbain = { reseau, de: 0, vers: 1 }
  const avecMetro: TrajetTc = { ...trajetTc, acces: { minutes: 23, mode: 'transports', urbain }, sortie: { minutes: 8, mode: 'transports', urbain: { reseau, de: 1, vers: 0 } } }
  const el = rendre((a) => (a.id === 'f' ? { moyen: 'tc', trajet: avecMetro, via: [] } : null))
  const etapes = [...el.querySelectorAll('.detail-personne')[0]!.querySelectorAll('.etapes li')].map((li) => li.textContent)
  expect(etapes[0]).toBe("23 min en transports jusqu'à Marseille Saint-Charles, montée à Porte de Bagnolet")
  expect(etapes[2]).toBe("8 min en transports jusqu'à Lyon, descente à Porte de Bagnolet")
  const direct: TrajetTc = { ...trajetTc, depart: null, arrivee: null, departIndice: null, arriveeIndice: null, sortie: null, acces: { minutes: 25, mode: 'transports', urbain } }
  const el2 = rendre((a) => (a.id === 'f' ? { moyen: 'tc', trajet: direct, via: [] } : null))
  expect(el2.querySelector('.etapes li')!.textContent).toBe('25 min en transports, de Porte de Bagnolet à Gare de Lyon')
})
