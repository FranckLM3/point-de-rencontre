import { afterEach, expect, test, vi } from 'vitest'
import { creerChargeurRails, creerRails } from '../../src/donnees/rails'

afterEach(() => vi.unstubAllGlobals())

const E5 = 100_000

/** Un seul tracé de 0 vers 1 : (45.0, 2.0) -> (45.001, 2.002) -> (45.002, 2.004). */
function railsBinaire(): ArrayBuffer {
  const points: [number, number][] = [[2.0, 45.0], [2.002, 45.001], [2.004, 45.002]] // [lon, lat]
  const octets = new Uint8Array(8 + 6 + 8 + (points.length - 1) * 8)
  const v = new DataView(octets.buffer)
  octets.set([0x52, 0x41, 0x42, 0x31], 0) // "RAB1"
  v.setUint32(4, 1, true)
  v.setUint16(8, 0, true)
  v.setUint16(10, 1, true)
  v.setUint16(12, points.length, true)
  let o = 14
  let plon = Math.round(points[0]![0] * E5)
  let plat = Math.round(points[0]![1] * E5)
  v.setInt32(o, plon, true)
  v.setInt32(o + 4, plat, true)
  o += 8
  for (let i = 1; i < points.length; i++) {
    const clon = Math.round(points[i]![0] * E5)
    const clat = Math.round(points[i]![1] * E5)
    v.setInt32(o, clon - plon, true)
    v.setInt32(o + 4, clat - plat, true)
    o += 8
    plon = clon
    plat = clat
  }
  return octets.buffer
}

test('decode un tracé et le rend dans le sens demandé', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(railsBinaire())))
  const rails = await creerRails()
  const direct = rails.segment(0, 1)
  expect(direct).toEqual([[45.0, 2.0], [45.001, 2.002], [45.002, 2.004]])
})

test('rend le tracé à l’envers quand il est stocké dans l’autre sens', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(railsBinaire())))
  const rails = await creerRails()
  const inverse = rails.segment(1, 0)
  expect(inverse).toEqual([[45.002, 2.004], [45.001, 2.002], [45.0, 2.0]])
})

test('rend null pour une paire sans tracé', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(railsBinaire())))
  const rails = await creerRails()
  expect(rails.segment(5, 6)).toBeNull()
})

test('en-tête invalide : erreur explicite', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([1, 2, 3, 4, 0, 0, 0, 0]).buffer)))
  await expect(creerRails()).rejects.toThrow('Fichier de rails invalide')
})

test('rails absents : erreur claire', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })))
  await expect(creerRails()).rejects.toThrow('Tracé des voies ferrées indisponible')
})

test('creerChargeurRails : un seul chargement, réessayé après échec', async () => {
  let appels = 0
  const creer = vi.fn(async () => {
    appels++
    if (appels === 1) throw new Error('échec réseau')
    return { segment: () => null }
  })
  const chargeur = creerChargeurRails(creer)
  expect(chargeur.pret()).toBeNull()
  await expect(chargeur.obtenir()).rejects.toThrow('échec réseau')
  expect(chargeur.pret()).toBeNull()
  await chargeur.obtenir()
  expect(chargeur.pret()).not.toBeNull()
  expect(appels).toBe(2)
})

test('creerChargeurRails : les appels concurrents ne déclenchent qu’un chargement', async () => {
  const creer = vi.fn(async () => ({ segment: () => null }))
  const chargeur = creerChargeurRails(creer)
  await Promise.all([chargeur.obtenir(), chargeur.obtenir()])
  expect(creer).toHaveBeenCalledTimes(1)
})
