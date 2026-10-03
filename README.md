# Sentinel Crowd

AI early warning for crowd crushes using existing CCTV cameras.

Sentinel Crowd splits a camera view into 12 zones, counts people in each zone, and raises plain-language alerts when a zone becomes too dense or fills up too quickly. It was built for CuriousPARC 2026, Theme 3: Computer Vision, Behaviour Analysis and Scene Understanding.

## Run locally

You need Node.js 18 or newer.

```bash
npm install
npm run dev
```

Then open http://localhost:5173 in Chrome or Edge.

## Modes

Simulation mode is the default. It plays a scripted 90 second scenario on a station platform, where the crowd builds up near a staircase, alerts escalate to CRITICAL, and an intervention brings the risk back to safe. It needs no camera and no internet.

Live Detection mode runs a person detection model on an uploaded video or a webcam, twice per second. The first time it is opened, the browser downloads the model (about 67 MB) and stores it locally, so later loads work offline.

Keyboard shortcuts: Space pauses or plays, R restarts the scenario, F toggles fullscreen.

## Tech stack

- Vite and React
- Tailwind CSS
- Recharts for the density chart
- TensorFlow.js with the COCO-SSD model for in-browser person detection

Everything runs in the browser. There is no backend, no API key, and video never leaves the device.

## Deploy

The app builds to a static site in `dist/` with relative paths and hash-based routes, so it works on any static host without rewrite rules.

```bash
npm run build
```

On Vercel, import the GitHub repository and keep the detected Vite settings (build command `npm run build`, output directory `dist`). On Netlify, the included `netlify.toml` sets the same values.

The AI model is loaded from Google's CDN at runtime. Webcam access only works on HTTPS or localhost, which Vercel and Netlify provide by default.

## Limitations

This is a prototype. Person detection uses a general model and may undercount in very dense crowds. A production version would use a crowd density model.
