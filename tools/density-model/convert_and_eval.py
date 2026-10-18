"""Convert the pretrained DM-Count crowd-counting model (PyTorch) to ONNX for the browser,
and check it on frames from real Indian station clips.

DM-Count (Wang et al., NeurIPS 2020, MIT licence) predicts a density map; its sum is the head count.
Weights: LWCC release v0.1 (github.com/tersekmatija/lwcc_weights, MIT), trained on ShanghaiTech.

Usage: python convert_and_eval.py <weights dir> <videos dir> <out dir>
Writes: <out>/dm-count-<set>.onnx, heatmap previews, and a counts table on stdout.
"""
import glob
import os
import sys
import time

import cv2
import numpy as np
import onnxruntime as ort
import torch
import torch.nn as nn

WEIGHTS, VIDEOS, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(OUT, exist_ok=True)

# ---- DM-Count network (VGG19 features + regression head), same as the original code ----
CFG = [64, 64, 'M', 128, 128, 'M', 256, 256, 256, 256, 'M', 512, 512, 512, 512, 'M', 512, 512, 512, 512]


def make_layers():
    layers, c = [], 3
    for v in CFG:
        if v == 'M':
            layers.append(nn.MaxPool2d(2, 2))
        else:
            layers += [nn.Conv2d(c, v, 3, padding=1), nn.ReLU(inplace=True)]
            c = v
    return nn.Sequential(*layers)


class DMCount(nn.Module):
    def __init__(self):
        super().__init__()
        self.features = make_layers()
        self.reg_layer = nn.Sequential(nn.Conv2d(512, 256, 3, padding=1), nn.ReLU(inplace=True),
                                       nn.Conv2d(256, 128, 3, padding=1), nn.ReLU(inplace=True))
        self.density_layer = nn.Sequential(nn.Conv2d(128, 1, 1), nn.ReLU())

    def forward(self, x):
        x = self.features(x)
        x = nn.functional.interpolate(x, scale_factor=2, mode='bilinear', align_corners=True)
        return self.density_layer(self.reg_layer(x))


MEAN = np.array([0.485, 0.456, 0.406], np.float32)
STD = np.array([0.229, 0.224, 0.225], np.float32)


def prep(frame_bgr, w, h):
    rgb = cv2.cvtColor(cv2.resize(frame_bgr, (w, h), interpolation=cv2.INTER_LINEAR), cv2.COLOR_BGR2RGB)
    x = (rgb.astype(np.float32) / 255 - MEAN) / STD
    return x.transpose(2, 0, 1)[None]


def frames(path, fractions=(0.2, 0.5, 0.8)):
    cap = cv2.VideoCapture(path)
    n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    out = []
    for f in fractions:
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(n * f))
        ok, fr = cap.read()
        if ok:
            out.append(fr)
    cap.release()
    return out


def heat_preview(frame, density, path, label):
    h, w = frame.shape[:2]
    d = cv2.resize(density, (w, h), interpolation=cv2.INTER_LINEAR)
    d = np.clip(d / (d.max() + 1e-6), 0, 1)
    colour = cv2.applyColorMap((d * 255).astype(np.uint8), cv2.COLORMAP_JET)
    mix = cv2.addWeighted(frame, 0.6, colour, 0.4, 0)
    cv2.putText(mix, label, (12, 34), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (255, 255, 255), 3)
    cv2.imwrite(path, mix)


LONG_SIDES = [1024, 768, 640]  # long side of the model input; the short side keeps the video's aspect ratio


def input_size(frame, long_side):
    """Keep the frame's aspect ratio (squashing a portrait clip into a landscape input shrinks every
    person and wrecks the count). Both sides are rounded to multiples of 16, which the network needs."""
    h, w = frame.shape[:2]
    scale = long_side / max(w, h)
    return max(16, round(w * scale / 16) * 16), max(16, round(h * scale / 16) * 16)
videos = sorted(glob.glob(os.path.join(VIDEOS, '*.mp4')))
results = {}

for wset in ['SHB', 'SHA']:
    wpath = os.path.join(WEIGHTS, f'DM-Count_{wset}.pth')
    if not os.path.exists(wpath):
        print('missing', wpath)
        continue
    model = DMCount().eval()
    model.load_state_dict(torch.load(wpath, map_location='cpu')['model'])

    # ---- Export with dynamic height/width so the browser can choose the input size ----
    onnx_path = os.path.join(OUT, f'dm-count-{wset.lower()}.onnx')
    dummy = torch.zeros(1, 3, 352, 640)
    torch.onnx.export(model, dummy, onnx_path, input_names=['image'], output_names=['density'], opset_version=17,
                      dynamic_axes={'image': {2: 'height', 3: 'width'}, 'density': {2: 'dh', 3: 'dw'}}, dynamo=False)
    sess = ort.InferenceSession(onnx_path, providers=['CPUExecutionProvider'])
    print(f'\n== DM-Count {wset}: ONNX {os.path.getsize(onnx_path) / 2**20:.1f} MB')

    for vid in videos:
        name = os.path.basename(vid)[:-4]
        for k, fr in enumerate(frames(vid)):
            row = []
            for long_side in LONG_SIDES:
                w, h = input_size(fr, long_side)
                x = prep(fr, w, h)
                with torch.no_grad():
                    ref = model(torch.from_numpy(x)).numpy()
                t = time.perf_counter()
                out = sess.run(None, {'image': x})[0]
                ms = (time.perf_counter() - t) * 1000
                diff = float(np.abs(out - ref).max())
                row.append((w, float(out.sum()), ms, diff))
                if long_side == LONG_SIDES[1]:
                    heat_preview(fr, out[0, 0], os.path.join(OUT, f'{wset}-{name}-{k}.jpg'), f'DM-Count {wset} {w}x{h}: {out.sum():.0f} people')
            results.setdefault((name, k), {})[wset] = row
            print(f'{name}[{k}]  ' + '  '.join(f'{L}px={c:6.1f} ({ms:4.0f} ms, max|onnx-torch|={d:.1e})' for L, (w, c, ms, d) in zip(LONG_SIDES, row)))
