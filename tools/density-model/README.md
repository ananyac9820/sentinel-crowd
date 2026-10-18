# Crowd density model (DM-Count → ONNX)

Live mode counts people with a **crowd density model**, not just a person detector.

| | People detector (COCO-SSD) | Crowd density model (DM-Count) |
|---|---|---|
| Output | One box per visible person | A density map: each cell holds "how many people are here"; the sum is the count |
| Packed crowds | Misses people who overlap | Designed for them: it looks for heads, not whole bodies |
| Movement | Yes (boxes are tracked between frames) | No |
| Used for | Turbulence, counter-flow, flow arrows | Zone counts and risk levels |

Sentinel runs both: the density model gives the counts, and the detector's tracked people give the movement.

## The model

- **DM-Count**: *Distribution Matching for Crowd Counting*, Wang et al., NeurIPS 2020. Code: github.com/cvlab-stonybrook/DM-Count (MIT).
- **Weights**: `DM-Count_SHB.pth` from the LWCC release v0.1 (github.com/tersekmatija/lwcc_weights, MIT), trained on **ShanghaiTech Part B**, a dataset of fixed street cameras.
- **Network**: VGG-19 convolutional layers, then a small regression head. The output density map is 1/8 of the input size.
- **We did not train it.** Training needs thousands of images with every head marked and days of GPU time. Fine-tuning on annotated Indian station footage is the natural next step.

## Converting it

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python convert_and_eval.py <dir with DM-Count_SHB.pth> <dir with .mp4 clips> <out dir>
cp <out dir>/dm-count-shb.onnx ../../public/models/
```

The script rebuilds the network, loads the weights, exports ONNX (opset 17, dynamic height and width), and checks that ONNX Runtime matches PyTorch on every test frame. The largest difference is 3.4 × 10⁻⁶. It also writes heatmap previews and prints counts at three input sizes.

## How it was checked

Three frames from each demo clip (`~/Desktop/sentinel-demo-videos`). The input keeps the video's aspect ratio, long side shown:

| Clip | 1024 px | **768 px (used)** | 640 px | Visual check |
|---|---|---|---|---|
| Crowded Indian railway platform | 50–64 | **53–64** | 55–57 | Hotspots on almost every head in the queue |
| Busy Indian station platform | 18–20 | **18–20** | 17–18 | About 17–18 people visible |
| High-angle crowd (portrait) | 102–110 | **97–112** | 91–98 | Dense crowd, partly cut off at the frame edges; the detector boxes about 24 |
| Drone view of stairs (very high, top-down) | 0–1 | **0–1** | 0–1 | About 6 tiny people: **fails**, far outside its training data |
| Close-up of stairs | 0–1 | **0–1** | 0–1 | 1–2 people: correct |

The same weights trained on ShanghaiTech Part A (very dense crowds) were also tested. They were less stable at smaller inputs (crowded platform: 69 at 1024 px but 46 at 640 px), so Part B was kept.

These are visual checks on a handful of frames, not a formal benchmark. A proper accuracy figure (MAE against hand-counted heads) needs labelled Indian footage.

## Speed (in the browser)

ONNX Runtime Web with **WebGPU**, measured in Chrome on an Apple Silicon Mac:

- **160–270 ms per frame** at a 768 px long side, i.e. 4–6 counts per second.
- Without WebGPU it falls back to WebAssembly on the CPU, which is several times slower; counts update less often.

## Size and hosting

`public/models/dm-count-shb.onnx` is **82 MB** (32-bit weights).

- After the first download the browser keeps it in Cache Storage, so it works offline.
- It is under GitHub's 100 MB file limit. For a deployed site, hosting it as a release asset or on a model hub is better: set `VITE_DENSITY_MODEL_URL` to that URL when building.

## Limitations

- **Training data:** trained on Shanghai street cameras, not Indian stations. Counts are estimates.
- **Camera angle:** very high top-down drone views (people only a few pixels tall) are undercounted.
- **Zone counts, not true density:** the zones are fractions of the frame, not measured floor areas, so a zone near the camera covers less floor than one far away. True people per m² needs camera calibration, which is not built yet.
- **Thresholds:** the "Live, crowd density model" thresholds in Setup are starting points; tune them per camera.
