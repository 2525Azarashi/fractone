// Browser regression suite; no production dependency is needed.
// Install playwright and @axe-core/playwright into .vercel/testing, then run
// BASE_URL=http://localhost:3002 node scripts/test-ux.mjs (with browser env paths).
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { chromium } from '../.vercel/testing/node_modules/playwright/index.mjs'
import AxeBuilder from '../.vercel/testing/node_modules/@axe-core/playwright/dist/index.mjs'

const base = process.env.BASE_URL || 'http://127.0.0.1:3002'
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-gpu', '--renderer-process-limit=1'], env: { ...process.env, HOME: new URL('../.vercel', import.meta.url).pathname } })
const errors = []
const log = (name) => console.log(`PASS ${name}`)
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', acceptDownloads: true })
const page = await context.newPage()
page.on('pageerror', (e) => { errors.push(e.message); console.error('BROWSER ERROR:', e.stack) })
const saved = async () => {
  await page.waitForFunction(() => document.querySelector('.save-status')?.textContent.includes('保存済み'))
  return page.evaluate(() => JSON.parse(localStorage.getItem('fractone:v1')))
}
const sequence = async () => (await saved()).sequence
const notes = () => page.locator('[data-note-id]')
const main = () => page.locator('.main-compose')
const stop = () => page.getByRole('button', { name: '停止して先頭へ (Enter)', exact: true }).click()
const assertNoOverflow = async (p) => assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no viewport overflow')
async function axe(p, name) {
  if (process.env.SKIP_AXE) return
  const result = await new AxeBuilder({ page: p }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
  assert.deepEqual(result.violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })), [], name)
  log(`accessibility: ${name}`)
}
try {
  await page.goto(base)
  await page.getByRole('button', { name: 'はじめる', exact: true }).focus()
  await page.keyboard.press('Enter')
  await page.waitForFunction(() => !document.querySelector('[aria-label="FracToneへようこそ"]'))
  assert.equal((await sequence()).length, 0)
  assert.equal(await page.locator('.advanced-settings').getAttribute('open'), null)
  assert.equal(await page.locator('.workspace-analysis details').first().getAttribute('open'), null)
  await axe(page, 'empty beginner workspace')
  await page.getByLabel('曲の雰囲気', { exact: true }).selectOption('gentle')
  await page.getByLabel('生成する長さ', { exact: true }).focus()
  await page.keyboard.press('Home')
  await page.keyboard.press('ArrowRight')
  assert.equal((await saved()).params.bars, 4)
  let requests = 0
  page.on('request', (req) => { if (req.url().endsWith('/api/compose')) requests++ })
  await main().click()
  await main().evaluate((el) => el.click())
  assert.equal(await main().isDisabled(), true)
  assert.equal(await page.getByRole('button', { name: '再生 (Space)', exact: true }).isDisabled(), true)
  await page.getByRole('button', { name: '再生して聴く', exact: true }).waitFor()
  assert.equal(requests, 1, 'duplicate compose prevented')
  assert.ok(await notes().count() > 0)
  assert.ok((await sequence()).every((n) => n.source === 'ai'))
  assert.equal(await page.getByRole('button', { name: /続きを作曲（/ }).isDisabled(), true)
  log('initial generation, busy controls, provenance and continue conditions')

  await main().click()
  await page.waitForTimeout(350)
  assert.equal(await main().innerText(), '一時停止')
  await stop()
  assert.equal(await main().innerText(), 'この提案を採用')
  const generated = await sequence()
  await main().click()
  const adopted = await sequence()
  assert.ok(adopted.every((n) => n.source === 'user' && n.accepted))
  await page.getByRole('button', { name: '元に戻す (Ctrl+Z)', exact: true }).click()
  assert.deepEqual(await sequence(), generated)
  await page.getByRole('button', { name: 'やり直す (Ctrl+Shift+Z)', exact: true }).click()
  assert.deepEqual(await sequence(), adopted)
  await main().click()
  await page.getByRole('button', { name: '再生して聴く', exact: true }).waitFor()
  const continued = await sequence()
  assert.deepEqual(continued.filter((n) => n.accepted), adopted)
  assert.ok(continued.some((n) => n.source === 'ai'))
  await page.getByRole('button', { name: '別案を生成', exact: true }).click()
  await page.getByRole('button', { name: '再生して聴く', exact: true }).waitFor()
  const alternate = await sequence()
  assert.deepEqual(alternate.filter((n) => n.accepted), adopted)
  assert.notDeepEqual(alternate.filter((n) => n.source === 'ai'), continued.filter((n) => n.source === 'ai'))
  log('play, stop, adoption, Undo/Redo, continuation and reroll preserve confirmed base')

  await page.getByLabel('編集する音符', { exact: true }).selectOption(alternate[0].id)
  await page.getByLabel('選択音符の高さ').selectOption('72')
  await page.getByLabel('選択音符の開始位置').fill('2')
  await page.getByLabel('選択音符の長さ').fill('1.5')
  await page.getByLabel('選択音符の強さ').fill('65')
  let edited = (await sequence()).find((n) => n.id === alternate[0].id)
  assert.equal(edited.midiNoteNumber, 72)
  assert.equal(edited.startTime, 60 / (await saved()).params.bpm)
  assert.equal(edited.duration, 1.5 * 60 / (await saved()).params.bpm)
  assert.equal(edited.velocity, .65)
  await page.getByRole('button', { name: /カーソル位置に音符を追加/ }).click()
  const withInput = await sequence()
  assert.equal(withInput.length, alternate.length + 1)
  const input = withInput.at(-1)
  assert.equal(input.source, 'user')
  assert.ok(!input.accepted)
  await page.getByRole('button', { name: '選択した音符を削除 (Delete)', exact: true }).click()
  assert.equal((await sequence()).length, alternate.length)
  await page.getByRole('button', { name: '元に戻す (Ctrl+Z)', exact: true }).click()
  assert.equal((await sequence()).length, alternate.length + 1)
  log('note inspector pitch/time/duration/velocity, add/delete and undo')

  await page.getByText('編集ツール・操作ガイド', { exact: false }).first().click()
  await page.getByRole('button', { name: '全音符を選択', exact: true }).click()
  await page.getByRole('button', { name: '選択または全音符をグリッドに揃える', exact: true }).click()
  const quantized = await sequence()
  const bpm = (await saved()).params.bpm
  assert.ok(quantized.every((n) => Math.abs(n.startTime / (60 / bpm) * 4 - Math.round(n.startTime / (60 / bpm) * 4)) < 1e-6))
  await page.getByLabel('音色', { exact: true }).selectOption('bell')
  await page.getByRole('button', { name: 'ループ再生', exact: true }).click()
  assert.equal(await page.getByRole('button', { name: 'ループ再生', exact: true }).getAttribute('aria-pressed'), 'true')
  await page.getByRole('button', { name: 'ループ再生', exact: true }).click()
  log('quantize, instrument and loop controls')

  // Native keyboard controls must not be intercepted by piano shortcuts.
  await page.getByLabel('編集する音符', { exact: true }).selectOption(input.id)
  const addedGroup = page.locator(`[data-note-id="${input.id}"]`)
  await addedGroup.focus()
  await page.keyboard.press('ArrowUp')
  assert.equal((await sequence()).find((n) => n.id === input.id).midiNoteNumber, input.midiNoteNumber + 1)
  await page.keyboard.press('Control+z')
  assert.equal((await sequence()).find((n) => n.id === input.id).midiNoteNumber, input.midiNoteNumber)
  log('piano-roll keyboard editing and shortcut Undo')

  const beforeSwitch = await sequence()
  const beforeParams = (await saved()).params
  await page.getByRole('button', { name: '別案を生成', exact: true }).click()
  await page.getByRole('button', { name: '再生して聴く', exact: true }).waitFor()
  await saved()
  const archive = await page.evaluate((seq) => JSON.parse(localStorage.getItem('fractone:takes')).find((t) => JSON.stringify(t.notes) === JSON.stringify(seq)), beforeSwitch)
  assert.ok(archive, 'edited take retained before replacement')
  await page.getByRole('button', { name: /保存した案を比較/ }).click()
  const dialog = page.getByRole('dialog', { name: 'テイク・ライブラリ', exact: true })
  await dialog.waitFor()
  await page.waitForTimeout(100)
  assert.ok(await page.evaluate(() => !!document.activeElement.closest('[role="dialog"]')))
  await dialog.getByRole('button', { name: `${archive.name}を読み込み`, exact: true }).click()
  assert.deepEqual(await sequence(), beforeSwitch)
  assert.deepEqual((await saved()).params, beforeParams)
  log('comparison library preserves edited notes and restores all generation settings')

  const dl = page.waitForEvent('download')
  await page.getByRole('button', { name: 'MIDI書き出し', exact: true }).click()
  const download = await dl
  await download.saveAs('.vercel/test-export.mid')
  const midi = await readFile('.vercel/test-export.mid')
  assert.equal(midi.subarray(0, 4).toString(), 'MThd')
  assert.ok(midi.includes(Buffer.from('MTrk')))
  assert.ok(midi.includes(0x91), 'accompaniment exported on channel 2')
  log('real MIDI download with melody and accompaniment')

  await page.locator('.advanced-settings > summary').press('Enter')
  const oldDepth = Number(await page.getByLabel('分解深度', { exact: true }).inputValue())
  await page.getByLabel('分解深度', { exact: true }).focus()
  await page.keyboard.press('ArrowRight')
  await page.locator('.advanced-settings > summary').press('Enter')
  await page.locator('.advanced-settings > summary').press('Enter')
  assert.equal(Number(await page.getByLabel('分解深度', { exact: true }).inputValue()), Math.min(7, oldDepth + 1))
  await page.locator('.advanced-settings > summary').press('Enter')
  const beforeReload = await sequence()
  await page.reload()
  assert.deepEqual(await sequence(), beforeReload)
  assert.equal(await page.getByRole('button', { name: '別案を生成', exact: true }).isEnabled(), true)
  log('advanced values retained through disclosure and saved proposals restored after reload')

  await page.locator('.workspace-analysis > details > summary').click()
  await page.getByText('音の動き', { exact: true }).waitFor()
  const text = await page.locator('.analysis-observations').innerText()
  const ordered = [...await sequence()].sort((a, b) => a.startTime - b.startTime)
  const leaps = ordered.slice(1).filter((n, i) => Math.abs(n.midiNoteNumber - ordered[i].midiNoteNumber) >= 5).length
  assert.ok(text.includes(`跳躍が${leaps}回`))
  await axe(page, 'generated workspace and explained analysis')
  await page.locator('.workspace-analysis > details > summary').click()

  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    await assertNoOverflow(page)
    assert.ok((await page.locator('.roll-viewport').boundingBox()).width > width * (width >= 1024 ? .5 : .75))
  }
  await page.screenshot({ path: '.vercel/test-mobile.png', fullPage: true })
  log('1440/1024/768/390/320px layouts with usable roll width and no horizontal overflow')

  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.getByRole('button', { name: 'ショートカット', exact: true }).click()
  await page.waitForTimeout(100)
  await page.keyboard.press('Tab')
  assert.ok(await page.evaluate(() => !!document.activeElement.closest('[role="dialog"]')))
  await page.keyboard.press('Escape')
  await page.waitForTimeout(100)
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'ショートカット')
  await page.getByRole('button', { name: 'コマンドを検索', exact: true }).filter({ visible: true }).click()
  await page.getByRole('combobox', { name: 'コマンドを検索', exact: true }).fill('bpm 128')
  await page.keyboard.press('Enter')
  assert.equal((await saved()).params.bpm, 128)
  log('dialog keyboard focus trap/restore and command palette')

  await page.route('**/api/compose', (route) => route.abort())
  await page.getByRole('button', { name: '別案を生成', exact: true }).click()
  await page.getByRole('button', { name: '再生して聴く', exact: true }).waitFor()
  assert.ok((await sequence()).some((n) => n.source === 'ai'))
  await page.unroute('**/api/compose')
  log('offline API failure uses existing client-side composer')

  await page.evaluate(() => {
    window.__setItem = Storage.prototype.setItem
    Storage.prototype.setItem = function () { throw new DOMException('Test quota', 'QuotaExceededError') }
  })
  await page.getByRole('button', { name: /カーソル位置に音符を追加/ }).click()
  await page.waitForFunction(() => document.querySelector('.save-status')?.textContent.includes('保存に失敗'))
  assert.equal(await page.getByRole('button', { name: '保存を再試行', exact: true }).isVisible(), true)
  await page.evaluate(() => { Storage.prototype.setItem = window.__setItem })
  await page.getByRole('button', { name: '保存を再試行', exact: true }).click()
  await saved()
  log('storage quota failure is visible and retry restores saved status')

  assert.deepEqual(errors, [], 'no uncaught browser errors')
  console.log('All UI/UX browser regression checks passed.')
} catch (error) {
  await page.screenshot({ path: '.vercel/test-failure.png', fullPage: true }).catch(() => {})
  console.error('Browser errors:', errors)
  throw error
} finally {
  await browser.close()
}
