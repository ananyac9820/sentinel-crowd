import { chromium } from 'playwright-core'
const OUT = process.argv[2]
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1500 }, deviceScaleFactor: 2 })
await page.goto('http://localhost:5173/#dashboard')
await page.waitForTimeout(1500)
const click = (name) => page.getByRole('button', { name, exact: false }).first().click()
const tab = (name) => page.getByRole('tab', { name, exact: true }).click()

// Monitor before the emergency (normal flow)
await page.locator('main').screenshot({ path: `${OUT}/monitor-normal.png` })
await tab('DAA Engine'); await page.waitForTimeout(500)
const graphPanel = page.locator('section.panel:visible', { has: page.locator('svg[aria-label^="Crowd graph"]') })
await graphPanel.screenshot({ path: `${OUT}/graph-live.png` })

await click('Load Emergency Crowd Surge'); await page.waitForTimeout(600)
await click('Run DAA Analysis'); await page.waitForTimeout(1200)
await page.locator('section[aria-live="polite"]').screenshot({ path: `${OUT}/header.png` })
// Scenario bar + summary
const summary = page.locator('main section.panel:visible', { hasText: 'DAA analysis complete' })
await summary.screenshot({ path: `${OUT}/summary.png` })
const aside = page.locator('main aside.panel:visible')
const steps = ['Crowd state', 'Graph', 'BFS', 'DFS', 'Dijkstra', 'Max flow', 'Greedy plan', 'Recommendation']
for (const [i, s] of steps.entries()) {
  await page.locator('nav[aria-label="Analysis steps"] button', { hasText: s }).click()
  await page.waitForTimeout(400)
  await graphPanel.screenshot({ path: `${OUT}/step${i + 1}-graph.png` })
  await aside.screenshot({ path: `${OUT}/step${i + 1}-panel.png` })
}
// Max-flow mid-replay: iteration 3 highlighted
await page.locator('nav[aria-label="Analysis steps"] button', { hasText: 'Max flow' }).click()
await page.waitForTimeout(300)
await page.getByRole('button', { name: 'Prev' }).click(); await page.waitForTimeout(300)
await graphPanel.screenshot({ path: `${OUT}/flow-iteration3.png` })

const beforeAfter = page.locator('main section.panel:visible', { hasText: 'Before / after optimisation' })
await beforeAfter.screenshot({ path: `${OUT}/before-after.png` })
await page.getByRole('button', { name: 'Apply recommended plan' }).first().click()
await page.waitForTimeout(9000)
await beforeAfter.screenshot({ path: `${OUT}/after-applied.png` })
await page.locator('section[aria-live="polite"]').screenshot({ path: `${OUT}/header-after.png` })

await tab('Algorithm Analysis'); await page.waitForTimeout(400)
await page.getByRole('button', { name: 'Run benchmark' }).click(); await page.waitForTimeout(4000)
await page.locator('main section.panel:visible', { hasText: 'Observed runtime' }).first().screenshot({ path: `${OUT}/complexity-table.png` })
await page.locator('main section.panel:visible', { hasText: 'Benchmark mode' }).screenshot({ path: `${OUT}/benchmark.png` })

// Emergency monitor view
await tab('DAA Engine'); await click('Load Emergency Crowd Surge'); await page.waitForTimeout(600)
await page.setViewportSize({ width: 1440, height: 1000 }) // normal screen proportions for the camera view
await tab('Monitor'); await page.waitForTimeout(800)
await page.locator('main').screenshot({ path: `${OUT}/monitor-critical.png` })
await tab('Station'); await page.waitForTimeout(500)
await page.locator('main').screenshot({ path: `${OUT}/station-critical.png` })
await browser.close()
console.log('done')
