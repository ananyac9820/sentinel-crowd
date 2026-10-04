// Incident report (printable, save as PDF from the browser) and CSV exports.
import { LEVELS } from './risk.js'
import { INTERVENTIONS } from './simulation.js'

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const time = (ms) => (ms ? new Date(ms).toLocaleTimeString('en-GB', { hour12: false }) : '-')
const dateTime = (ms) => (ms ? new Date(ms).toLocaleString('en-GB', { hour12: false }) : '-')
const sevLabel = (a) => (a.severity < 0 ? 'ACTION' : LEVELS[a.severity].label)
const fmtSecs = (s) => `${Math.floor(s / 60)}m ${String(Math.round(s % 60)).padStart(2, '0')}s`

export function download(filename, text, type = 'text/csv') {
  const blob = new Blob([text], { type: `${type};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const csvCell = (v) => {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function alertsCsv(alerts) {
  const rows = [['time', 'severity', 'type', 'zone', 'title', 'message', 'reason']]
  for (const a of [...alerts].reverse()) rows.push([dateTime(a.time), sevLabel(a), a.kind ?? '', a.zone, a.title, a.message, a.why])
  return rows.map((r) => r.map(csvCell).join(',')).join('\n')
}

export function timelineCsv(timeline) {
  const rows = [['time', 'people', 'risk_score', 'max_turbulence', 'overall_level']]
  for (const p of timeline) rows.push([dateTime(p.wall), p.people, p.risk, p.turb ?? '', LEVELS[p.level ?? 0].label])
  return rows.map((r) => r.map(csvCell).join(',')).join('\n')
}

export function openReport({ site, camera, modeLabel, snap, plan = [], sms = [] }) {
  const st = snap.stats
  const highest = st.levelSeconds.reduce((hi, s, i) => (s > 0 ? i : hi), snap.overall)
  const chrono = [...snap.alerts].reverse()
  const counts = chrono.reduce((acc, a) => ((acc[a.kind ?? 'other'] = (acc[a.kind ?? 'other'] ?? 0) + 1), acc), {})
  const actions = chrono.filter((a) => a.kind === 'action')
  const lead = snap.leadTimes.length
    ? snap.leadTimes.map((l) => `${esc(l.zone)}: first early warning ${l.lead}s before it reached CRITICAL`).join('<br/>')
    : 'No zone reached CRITICAL after an early warning in this period.'

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Sentinel Crowd incident report</title>
<style>
  body{font:13px/1.5 "IBM Plex Sans",Arial,sans-serif;color:#111;margin:32px;background:#fff}
  h1{font-size:22px;margin:0 0 2px}h2{font-size:14px;margin:22px 0 6px;text-transform:uppercase;letter-spacing:.06em}
  .sub{color:#555;margin:0 0 14px}.rule{border:0;border-top:3px solid #111;margin:10px 0 16px}
  table{border-collapse:collapse;width:100%}th,td{border:1px solid #bbb;padding:5px 7px;text-align:left;vertical-align:top}
  th{background:#111;color:#fff;font-weight:600}tr:nth-child(even) td{background:#f4f3ef}
  .kv td:first-child{width:220px;font-weight:600}.mono{font-family:"IBM Plex Mono",Consolas,monospace}
  .note{color:#555;font-size:11px;margin-top:24px}
  @media print{body{margin:14mm}.noprint{display:none}}
</style></head><body>
<p class="noprint"><button onclick="print()">Print or save as PDF</button></p>
<h1>Sentinel Crowd incident report</h1>
<p class="sub">${esc(site)} &middot; ${esc(camera)} &middot; ${esc(modeLabel)}</p>
<hr class="rule"/>
<h2>Summary</h2>
<table class="kv"><tbody>
<tr><td>Period</td><td class="mono">${dateTime(st.startWall)} to ${dateTime(st.endWall)}</td></tr>
<tr><td>Highest overall risk</td><td><b style="color:${LEVELS[highest].color}">${LEVELS[highest].label}</b></td></tr>
<tr><td>Time at each level</td><td class="mono">${LEVELS.map((l, i) => `${l.label} ${fmtSecs(st.levelSeconds[i])}`).join(' &nbsp; ')}</td></tr>
<tr><td>Peak people in view</td><td class="mono">${st.peakPeople}</td></tr>
<tr><td>Peak risk score</td><td class="mono">${st.peakScore} / 100</td></tr>
<tr><td>Early-warning lead time</td><td>${lead}</td></tr>
<tr><td>Alerts raised</td><td class="mono">${Object.entries(counts).map(([k, v]) => `${esc(k)} ${v}`).join(', ') || 'none'}</td></tr>
<tr><td>Actions taken</td><td>${actions.length ? actions.map((a) => `${time(a.time)} ${esc(a.title)}`).join('<br/>') : 'None recorded'}</td></tr>
</tbody></table>
<h2>Alert log (oldest first)</h2>
<table><thead><tr><th>Time</th><th>Severity</th><th>Zone</th><th>Alert</th><th>Reason</th></tr></thead><tbody>
${chrono.map((a) => `<tr><td class="mono">${time(a.time)}</td><td><b style="color:${a.severity < 0 ? '#111' : LEVELS[a.severity].color}">${sevLabel(a)}</b></td><td class="mono">${esc(a.zone)}</td><td><b>${esc(a.title)}</b><br/>${esc(a.message)}</td><td>${esc(a.why)}</td></tr>`).join('\n')}
</tbody></table>
${
  sms.length
    ? `<h2>Notifications sent (simulated SMS)</h2><table><thead><tr><th>Time</th><th>To</th><th>Message</th></tr></thead><tbody>
${[...sms].reverse().map((m) => `<tr><td class="mono">${time(m.time)}</td><td>${esc(m.to)}</td><td>${esc(m.text)}</td></tr>`).join('\n')}</tbody></table>`
    : ''
}
<p class="note">Generated ${dateTime(Date.now())} by Sentinel Crowd, a prototype. Counts come from a general person detection model or a scripted simulation and may be inaccurate. Decisions remain the responsibility of trained staff.${plan.some((p) => p.auto) ? ' This run used the scripted demo scenario.' : ''}</p>
</body></html>`

  const w = window.open('', '_blank')
  if (!w) return false
  w.document.open()
  w.document.write(html)
  w.document.close()
  return true
}

export const interventionLabel = (type) => INTERVENTIONS[type]?.label ?? type
