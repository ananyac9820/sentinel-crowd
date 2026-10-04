# Sentinel Crowd

AI early warning for crowd crushes using existing CCTV cameras.

Sentinel Crowd splits a camera view into zones, counts people in each zone, and watches how they move. It raises plain-language alerts when a zone becomes too dense, fills up too quickly, or when the crowd starts pushing in different directions. It forecasts how many seconds remain before a filling zone reaches crush density, and suggests what to do, such as which exit gate to open. It was built for CuriousPARC 2026, Theme 3: Computer Vision, Behaviour Analysis and Scene Understanding.

A full project guide for the team is in `docs/Sentinel-Crowd-Project-Guide.pdf`.

## Run locally

You need Node.js 18 or newer.

```bash
npm install
npm run dev
```

Then open http://localhost:5173 in Chrome or Edge.

## What it does

The dashboard has five tabs:

- **Monitor**: the camera view with the zone grid, flow arrows, alerts, a small chart and, in Simulation mode, what-if buttons.
- **Station**: a map of four cameras (concourse, footbridge, two platforms), each coloured by its own risk. Arrows show where an action sends the crowd.
- **Zones**: every zone's count, level, trend, forecast, turbulence, counter-flow and direction of movement.
- **Timeline**: the full chart, alert history with filters, early-warning lead time, an incident report and CSV exports, and the simulated SMS log.
- **Setup**: alert thresholds, notifications, and a zone editor to draw named zones such as "Staircase".

## How risk is decided

1. **Density**: people per zone compared with WATCH, WARNING and CRITICAL limits (scaled to each zone's size).
2. **Surge**: a zone rising by a set percentage and number of people within 20 seconds.
3. **Forecast**: the zone's growth over the last 10 seconds, projected to when it would reach CRITICAL.
4. **Turbulence**: crowd pressure, meaning density multiplied by how unevenly people move (Helbing et al., 2007).
5. **Counter-flow**: two streams of people moving opposite ways along the same line.

Overall risk is the worst zone's level, raised by one level while any zone has a surge, turbulence or counter-flow. Every alert explains which rule fired.

## Modes

Simulation mode is the default. It plays a scripted 90 second scenario on a station platform: a crowd builds near a staircase, a train arrives and passengers push up the stairs against the crowd, and alerts escalate to CRITICAL. By default Gate 2 opens at 1:06; you can turn that off and try your own actions. It needs no camera and no internet.

Live Detection mode runs a person detection model on an uploaded video or a webcam, twice per second. People are followed for a few seconds, anonymously, to measure movement. The first time it is opened, the browser downloads the model (about 67 MB) and stores it locally, so later loads work offline.

Keyboard shortcuts: Space pauses or plays, R restarts the scenario, F toggles fullscreen, 1 to 5 switch tabs.

## Tech stack

- Vite and React
- Tailwind CSS
- Recharts for charts
- TensorFlow.js with the COCO-SSD model for in-browser person detection
- Web Audio API for the alarm

Everything runs in the browser. There is no backend, no API key, and video never leaves the device.

## Deploy

The app builds to a static site in `dist/` with relative paths and hash-based routes, so it works on any static host without rewrite rules.

```bash
npm run build
```

On Vercel, import the GitHub repository and keep the detected Vite settings (build command `npm run build`, output directory `dist`). On Netlify, the included `netlify.toml` sets the same values.

The AI model is loaded from Google's CDN at runtime. Webcam access only works on HTTPS or localhost, which Vercel and Netlify provide by default.

## Limitations

This is a prototype. Person detection uses a general model and may undercount in very dense crowds. A production version would use a crowd density model. Movement is estimated from detections twice per second, so motion readings are approximate. The SMS notifications are simulated.
