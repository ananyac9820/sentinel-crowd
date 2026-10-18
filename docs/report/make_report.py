"""Builds the Sentinel DAA project report (PDF).

Every number comes from data.json, produced by export-data.mjs from the real engine.
Screenshots come from capture.mjs (headless Chrome driving the running app).

Usage: python make_report.py <data.json> <image dir> <output.pdf>
Needs: reportlab, pillow. Fonts: Arial and Courier New (macOS system fonts).
"""
import json
import os
import sys
import tempfile

from PIL import Image as PILImage
from reportlab.graphics.shapes import Drawing, Line, Polygon, Rect, String
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.pdfmetrics import registerFontFamily
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (BaseDocTemplate, CondPageBreak, Frame, Image, KeepTogether, NextPageTemplate,
                                PageBreak, PageTemplate, Paragraph, Spacer, Table, TableStyle)

DATA, IMG, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
D = json.load(open(DATA))

# ---------------------------------------------------------------- fonts and styles
F = "/System/Library/Fonts/Supplemental/"
pdfmetrics.registerFont(TTFont("Body", F + "Arial.ttf"))
pdfmetrics.registerFont(TTFont("Body-Bold", F + "Arial Bold.ttf"))
pdfmetrics.registerFont(TTFont("Body-Italic", F + "Arial Italic.ttf"))
pdfmetrics.registerFont(TTFont("Mono", F + "Courier New.ttf"))
pdfmetrics.registerFont(TTFont("Mono-Bold", F + "Courier New Bold.ttf"))
registerFontFamily("Body", normal="Body", bold="Body-Bold", italic="Body-Italic", boldItalic="Body-Bold")
registerFontFamily("Mono", normal="Mono", bold="Mono-Bold", italic="Mono", boldItalic="Mono-Bold")

INK = colors.HexColor("#111111")
MUTED = colors.HexColor("#4a4945")
LINE = colors.HexColor("#c9c7c0")
PAPER = colors.HexColor("#f4f3ef")
SAFE = colors.HexColor("#2f7a45")
WATCH = colors.HexColor("#9a7410")
WARN = colors.HexColor("#b4561a")
CRIT = colors.HexColor("#b02a22")

S = {
    "title": ParagraphStyle("title", fontName="Body-Bold", fontSize=33, leading=37, textColor=INK),
    "subtitle": ParagraphStyle("subtitle", fontName="Body-Bold", fontSize=17, leading=22, textColor=INK),
    "meta": ParagraphStyle("meta", fontName="Body", fontSize=11, leading=16, textColor=MUTED),
    "part": ParagraphStyle("part", fontName="Body-Bold", fontSize=10, leading=13, textColor=CRIT, spaceAfter=2, keepWithNext=1),
    "h1": ParagraphStyle("h1", fontName="Body-Bold", fontSize=20, leading=25, textColor=INK, spaceAfter=8, keepWithNext=1),
    "h2": ParagraphStyle("h2", fontName="Body-Bold", fontSize=13.5, leading=18, textColor=INK, spaceBefore=10, spaceAfter=4, keepWithNext=1),
    "h3": ParagraphStyle("h3", fontName="Body-Bold", fontSize=10.5, leading=14, textColor=INK, spaceBefore=6, spaceAfter=2, keepWithNext=1),
    "body": ParagraphStyle("body", fontName="Body", fontSize=10, leading=14.6, textColor=INK, spaceAfter=6),
    "small": ParagraphStyle("small", fontName="Body", fontSize=8.6, leading=12, textColor=MUTED, spaceAfter=4),
    "cell": ParagraphStyle("cell", fontName="Body", fontSize=8.8, leading=12, textColor=INK),
    "cellb": ParagraphStyle("cellb", fontName="Body-Bold", fontSize=8.8, leading=12, textColor=INK),
    "cellm": ParagraphStyle("cellm", fontName="Mono", fontSize=8.6, leading=11.5, textColor=INK),
    "head": ParagraphStyle("head", fontName="Body-Bold", fontSize=8.6, leading=11.5, textColor=colors.white),
    "bullet": ParagraphStyle("bullet", fontName="Body", fontSize=10, leading=14.2, textColor=INK, leftIndent=13, bulletIndent=2, spaceAfter=2.5),
    "quote": ParagraphStyle("quote", fontName="Body-Bold", fontSize=11.5, leading=16.5, textColor=INK, backColor=PAPER,
                            borderPadding=(8, 9, 8, 9), leftIndent=9, rightIndent=9, spaceBefore=6, spaceAfter=12),
    "why": ParagraphStyle("why", fontName="Body", fontSize=10, leading=14.4, textColor=INK, backColor=colors.HexColor("#f7ece9"),
                          borderColor=CRIT, borderWidth=0, borderPadding=(7, 8, 7, 8), leftIndent=8, rightIndent=8, spaceBefore=4, spaceAfter=10),
    "caption": ParagraphStyle("caption", fontName="Body", fontSize=8.3, leading=11, textColor=MUTED, spaceBefore=3, spaceAfter=10),
    "mono": ParagraphStyle("mono", fontName="Mono", fontSize=9, leading=12.5, textColor=INK, backColor=PAPER,
                           borderPadding=(6, 7, 6, 7), leftIndent=7, rightIndent=7, spaceBefore=4, spaceAfter=10),
    "viva": ParagraphStyle("viva", fontName="Body-Italic", fontSize=9.8, leading=14, textColor=INK, leftIndent=10,
                           borderColor=INK, borderPadding=(2, 0, 2, 8), spaceBefore=2, spaceAfter=10),
}
W = A4[0] - 36 * mm  # usable width


def P(text, style="body"):
    return Paragraph(text, S[style])


def bullets(items):
    return [Paragraph(t, S["bullet"], bulletText="•") for t in items]


def numbered(items):
    return [Paragraph(t, S["bullet"], bulletText=f"{i}.") for i, t in enumerate(items, 1)]


def M(text):
    return f'<font name="Mono">{text}</font>'


def table(rows, widths, header=True, zebra=True, mono_cols=()):
    data = []
    for r, row in enumerate(rows):
        out = []
        for c, cell in enumerate(row):
            if isinstance(cell, str) or isinstance(cell, (int, float)):
                cell = str(cell)
                st = "head" if (header and r == 0) else ("cellm" if c in mono_cols else ("cellb" if c == 0 else "cell"))
                out.append(Paragraph(cell, S[st]))
            else:
                out.append(cell)
        data.append(out)
    t = Table(data, colWidths=widths, repeatRows=1 if header else 0)
    style = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOX", (0, 0), (-1, -1), 0.8, INK),
        ("LINEBELOW", (0, 0), (-1, -1), 0.4, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 3.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4.5),
    ]
    if header:
        style.append(("BACKGROUND", (0, 0), (-1, 0), INK))
    if zebra:
        for r in range(1 if header else 0, len(rows)):
            if r % 2 == 0:
                style.append(("BACKGROUND", (0, r), (-1, r), PAPER))
    t.setStyle(TableStyle(style))
    return t


def complexity_box(key, extra=None):
    a = D["algorithms"][key]
    ms = D["timings"].get(key)
    observed = "-" if ms is None else (f"{ms * 1000:.1f} µs" if ms < 0.01 else f"{ms:.3f} ms")
    rows = [["Time", a["time"]], ["Space", a["space"]], ["Data structure", a["structure"]],
            ["Observed (this scenario)", f"{observed} per run, averaged over repeated runs"], ["Source file", a["file"]]]
    if extra:
        rows.append(extra)
    data = [[Paragraph(k, S["cellb"]), Paragraph(v, S["cellm"] if k in ("Time", "Space", "Source file") else S["cell"])] for k, v in rows]
    t = Table(data, colWidths=[38 * mm, W - 38 * mm])
    t.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.8, INK), ("BACKGROUND", (0, 0), (0, -1), PAPER),
        ("LINEBELOW", (0, 0), (-1, -1), 0.4, LINE), ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5), ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    return [KeepTogether([t]), Spacer(1, 8)]


# ---------------------------------------------------------------- images
TMP = tempfile.mkdtemp()


def trimmed(name):
    """Removes the empty panel background under the graph legend so figures are compact."""
    path = os.path.join(IMG, name)
    im = PILImage.open(path).convert("RGB")
    w, h = im.size
    px = im.load()
    bg = (246, 245, 241)

    def blank(y):
        for x in range(12, w - 12, 3):
            p = px[x, y]
            if abs(p[0] - bg[0]) + abs(p[1] - bg[1]) + abs(p[2] - bg[2]) > 24:
                return False
        return True

    y = h - 8
    while y > h * 0.4 and blank(y):
        y -= 1
    if y < h - 40:
        im = im.crop((0, 0, w, min(h, y + 24)))
    out = os.path.join(TMP, name)
    im.save(out)
    return out


def shot(name, caption, width=W, trim=False):
    if trim:
        width = W * 0.84
    path = trimmed(name) if trim else os.path.join(IMG, name)
    iw, ih = PILImage.open(path).size
    img = Image(path, width=width, height=width * ih / iw)
    framed = Table([[img]], colWidths=[width])
    framed.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 0.8, INK)] + [(k, (0, 0), (-1, -1), 0) for k in
                                                                       ("LEFTPADDING", "RIGHTPADDING", "TOPPADDING", "BOTTOMPADDING")]))
    return KeepTogether([framed, P(caption, "caption")])


# ---------------------------------------------------------------- diagrams
def pipeline_diagram():
    """Left: what computer vision measures. Right: what the DAA engine decides."""
    h = 210
    d = Drawing(W, h)
    colw = (W - 40) / 2

    def box(x, y, w, hh, title, sub, fill, ink=INK, tc=INK):
        d.add(Rect(x, y, w, hh, fillColor=fill, strokeColor=ink, strokeWidth=1.1))
        d.add(String(x + 7, y + hh - 13, title, fontName="Body-Bold", fontSize=9, fillColor=tc))
        if sub:
            d.add(String(x + 7, y + hh - 25, sub, fontName="Body", fontSize=7.6, fillColor=MUTED if tc == INK else tc))

    def arrow(x1, y1, x2, y2):
        d.add(Line(x1, y1, x2, y2, strokeColor=INK, strokeWidth=1.2))
        if x1 == x2:
            d.add(Polygon([x2 - 3.5, y2 + 6, x2 + 3.5, y2 + 6, x2, y2], fillColor=INK, strokeColor=INK))
        else:
            d.add(Polygon([x2 - 6, y2 - 3.5, x2 - 6, y2 + 3.5, x2, y2], fillColor=INK, strokeColor=INK))

    d.add(String(0, h - 10, "COMPUTER VISION: what is happening", fontName="Body-Bold", fontSize=8.5, fillColor=MUTED))
    d.add(String(colw + 40, h - 10, "DAA ENGINE: what to do about it", fontName="Body-Bold", fontSize=8.5, fillColor=CRIT))
    left = [("Camera or simulation", "CCTV video, webcam, or scripted scenario"),
            ("Person detection + tracking", "COCO-SSD in the browser, 2 frames/s"),
            ("Zones: counts, density, motion", "surge, forecast, turbulence, counter-flow"),
            ("Crowd state (risk engine)", "per-zone level SAFE..CRITICAL, risk score")]
    right = [("Crowd graph (adjacency list)", "zones, exits, stairs, areas, safe sink"),
             ("Rank + reach + cluster", "merge sort, binary search, BFS, DFS"),
             ("Route + capacity + bottleneck", "Dijkstra, Edmonds-Karp, min cut"),
             ("Plan + recommendation", "greedy, checked by backtracking; before/after")]
    bh, gap = 36, 13
    top = h - 22
    for i, (t, s) in enumerate(left):
        y = top - bh - i * (bh + gap)
        box(0, y, colw, bh, t, s, PAPER)
        if i < 3:
            arrow(colw / 2, y, colw / 2, y - gap)
    for i, (t, s) in enumerate(right):
        y = top - bh - i * (bh + gap)
        last = i == 3
        box(colw + 40, y, colw, bh, t, s, INK if last else colors.white, tc=colors.white if last else INK)
        if i < 3:
            arrow(colw + 40 + colw / 2, y, colw + 40 + colw / 2, y - gap)
    # crowd state -> graph
    yl = top - bh - 3 * (bh + gap) + bh / 2
    yr = top - bh / 2
    d.add(Line(colw, yl, colw + 20, yl, strokeColor=CRIT, strokeWidth=1.6))
    d.add(Line(colw + 20, yl, colw + 20, yr, strokeColor=CRIT, strokeWidth=1.6))
    d.add(Line(colw + 20, yr, colw + 34, yr, strokeColor=CRIT, strokeWidth=1.6))
    d.add(Polygon([colw + 34, yr - 3.5, colw + 34, yr + 3.5, colw + 40, yr], fillColor=CRIT, strokeColor=CRIT))
    return d


def flow_toy_diagram():
    """Tiny example network used to explain residual graphs."""
    d = Drawing(W, 92)
    pos = {"s": (20, 46), "a": (150, 80), "b": (150, 12), "t": (280, 46)}
    edges = [("s", "a", "10"), ("s", "b", "5"), ("a", "b", "15"), ("a", "t", "4"), ("b", "t", "10")]
    for u, v, c in edges:
        (x1, y1), (x2, y2) = pos[u], pos[v]
        d.add(Line(x1, y1, x2, y2, strokeColor=INK, strokeWidth=1.2))
        d.add(String((x1 + x2) / 2 + 3, (y1 + y2) / 2 + 3, c, fontName="Mono-Bold", fontSize=8.5, fillColor=CRIT))
    for k, (x, y) in pos.items():
        d.add(Rect(x - 9, y - 9, 18, 18, fillColor=colors.white, strokeColor=INK, strokeWidth=1.2))
        d.add(String(x - 3, y - 3.5, k, fontName="Body-Bold", fontSize=9.5, fillColor=INK))
    d.add(String(320, 66, "Max flow s→t = 14  (a→t 4 + b→t 10)", fontName="Body", fontSize=8.8, fillColor=INK))
    d.add(String(320, 50, "Min cut = {a→t, b→t}: capacity 4 + 10 = 14", fontName="Body", fontSize=8.8, fillColor=INK))
    d.add(String(320, 34, "Raising s→a does nothing: it is not in the cut.", fontName="Body", fontSize=8.8, fillColor=MUTED))
    return d


def benchmark_chart(rows):
    from reportlab.graphics.charts.lineplots import LinePlot
    from reportlab.graphics.widgets.markers import makeMarker
    d = Drawing(W, 175)
    lp = LinePlot()
    lp.x, lp.y, lp.width, lp.height = 40, 30, W - 170, 130
    series = [("mergeSort", "Merge sort", colors.HexColor("#6b6963")), ("bfs", "BFS", SAFE), ("dijkstra", "Dijkstra", INK), ("maxFlow", "Edmonds-Karp", CRIT)]
    lp.data = [[(r["n"], r[k]) for r in rows] for k, _, _ in series]
    for i, (_, _, c) in enumerate(series):
        lp.lines[i].strokeColor = c
        lp.lines[i].strokeWidth = 1.6
        lp.lines[i].symbol = makeMarker("FilledCircle", size=3.5, fillColor=c, strokeColor=c)
    lp.xValueAxis.valueMin, lp.xValueAxis.valueMax = 0, rows[-1]["n"]
    lp.xValueAxis.valueSteps = [r["n"] for r in rows]
    lp.xValueAxis.labels.fontName = lp.yValueAxis.labels.fontName = "Mono"
    lp.xValueAxis.labels.fontSize = lp.yValueAxis.labels.fontSize = 7.5
    lp.yValueAxis.valueMin = 0
    lp.yValueAxis.labelTextFormat = "%.2f"
    lp.yValueAxis.gridStrokeColor = LINE
    lp.yValueAxis.visibleGrid = 1
    d.add(lp)
    d.add(String(40, 6, "n (array items / graph nodes)", fontName="Body", fontSize=8, fillColor=MUTED))
    d.add(String(0, 165, "ms per run", fontName="Body", fontSize=8, fillColor=MUTED))
    for i, (_, label, c) in enumerate(series):
        y = 140 - i * 16
        d.add(Line(W - 115, y + 3, W - 100, y + 3, strokeColor=c, strokeWidth=2))
        d.add(String(W - 95, y, label, fontName="Body", fontSize=8.5, fillColor=INK))
    return d


# ---------------------------------------------------------------- page templates
def on_page(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(INK)
    canvas.setLineWidth(1.6)
    canvas.line(18 * mm, A4[1] - 14 * mm, A4[0] - 18 * mm, A4[1] - 14 * mm)
    canvas.setFont("Body-Bold", 8)
    canvas.setFillColor(INK)
    canvas.drawString(18 * mm, A4[1] - 12 * mm, "SENTINEL · ALGORITHMIC CROWD SAFETY AND EVACUATION OPTIMIZATION")
    canvas.setFont("Body", 8)
    canvas.drawRightString(A4[0] - 18 * mm, A4[1] - 12 * mm, "CS3212 Design and Analysis of Algorithms")
    canvas.setFillColor(MUTED)
    canvas.drawRightString(A4[0] - 18 * mm, 10 * mm, f"{doc.page}")
    canvas.restoreState()


def on_cover(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(INK)
    canvas.rect(0, A4[1] - 9 * mm, A4[0], 9 * mm, fill=1, stroke=0)
    canvas.setFillColor(CRIT)
    canvas.rect(0, A4[1] - 11 * mm, A4[0], 2 * mm, fill=1, stroke=0)
    canvas.restoreState()


doc = BaseDocTemplate(OUT, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=20 * mm, bottomMargin=16 * mm,
                      title="Sentinel: Algorithmic Crowd Safety and Evacuation Optimization System",
                      author="Sentinel project team", subject="CS3212 Design and Analysis of Algorithms project report")
frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="f")
doc.addPageTemplates([PageTemplate("cover", [frame], onPage=on_cover), PageTemplate("page", [frame], onPage=on_page)])

st = []
def part(label, title):
    st.extend([P(label, "part"), P(title, "h1")])


# ================================================================ COVER
fmt = lambda v: f"{v:g}"
st += [Spacer(1, 6 * mm), P("SENTINEL", "part"), P("Algorithmic Crowd Safety and Evacuation Optimization System", "title"), Spacer(1, 8),
       P("Project report: how the system works, the DAA concepts inside it and why we chose them, and what comes next.", "subtitle"),
       Spacer(1, 10),
       P("<b>Course:</b> CS3212 Design and Analysis of Algorithms<br/><b>Domain:</b> Computer Vision: intelligent crowd analysis and management"
         "<br/><b>Application:</b> Crowd management and emergency evacuation", "meta"),
       Spacer(1, 10),
       P("Computer vision detects <i>what is happening</i> in the crowd. Design and analysis of algorithms decides <i>what should be done about it</i>.", "quote"),
       Spacer(1, 4), pipeline_diagram(), Spacer(1, 12),
       P("<b>Contents</b>", "h3")]
toc = [("1", "The problem and what Sentinel does"), ("2", "How the whole system works"), ("3", "From a crowd to a graph"),
       ("4", "DAA concepts: what, why and how (10 algorithms)"), ("5", "End-to-end worked example: Emergency Crowd Surge"),
       ("6", "Complexity analysis, comparison and benchmark"), ("7", "Testing and how to verify the results"),
       ("8", "What we will add next"), ("A–C", "Demo script, viva questions, how to run")]
half = (len(toc) + 1) // 2
cells = [[toc[i][0], toc[i][1], toc[i + half][0] if i + half < len(toc) else "", toc[i + half][1] if i + half < len(toc) else ""] for i in range(half)]
st.append(table(cells, [9 * mm, W / 2 - 9 * mm, 9 * mm, W / 2 - 9 * mm], header=False, zebra=False))
st += [NextPageTemplate("page"), PageBreak()]

# ================================================================ 1. PROBLEM
part("PART 1", "The problem and what Sentinel does")
st += [
    P("Crowd crushes happen when people pack into a space faster than they can leave it. Once density passes roughly "
      "five people per square metre, people can no longer choose where they move; pressure waves pass through the crowd and "
      "can injure or kill. Railway platforms, stairs, temple queues, stadium gates and concerts are typical places. The warning "
      "signs are visible on CCTV minutes before the danger peaks: one area filling much faster than the rest, people pushed in different "
      "directions (turbulence) and two streams moving against each other (counter-flow)."),
    P("Control rooms have cameras but not decision support. An operator watching twenty screens must answer, under time pressure: "
      "<b>Which area is most dangerous? Can those people still reach an exit? Which way should we send them? How fast can the area "
      "be emptied, and what limits that? Which action helps most?</b>"),
    P("Sentinel answers these questions in two layers:"),
    *bullets([
        "<b>Computer vision layer</b> (the original Sentinel Crowd project): detects people in video, counts them per zone, measures "
        "movement, and raises explainable alerts (density, surge, forecast, turbulence, counter-flow).",
        "<b>DAA decision layer</b> (this course project): turns the measured crowd state into a weighted graph and runs classic "
        "algorithms with known correctness and complexity to decide what to do, and shows the measured improvement.",
    ]),
    P("Objectives", "h2"),
    *numbered([
        "Measure the crowd state per zone from video, or from a deterministic simulation for repeatable demos.",
        "Represent the venue as a weighted graph generated from that live state, not a separate toy graph.",
        "Find reachable exits (BFS), the connected danger region (DFS) and the safest route (Dijkstra).",
        "Compute evacuation capacity (maximum flow) and the bottleneck that limits it (minimum cut).",
        "Choose interventions quickly (greedy) and check them against the exact optimum (backtracking).",
        "Show a before/after improvement that is computed, and make every result traceable: input → algorithm → output → decision.",
    ]),
]

# ================================================================ 2. SYSTEM
st += [PageBreak()]
part("PART 2", "How the whole system works")
st += [
    P("Sentinel is a single-page web app (React + Vite) that runs entirely in the browser: no server, no API key, and video never "
      "leaves the device. The code is split into layers so the algorithms can be tested without a camera or a browser."),
    table([
        ["Layer", "What it does", "Main files"],
        ["Vision", "Loads COCO-SSD (TensorFlow.js) and detects people twice per second in a webcam or uploaded MP4. A light tracker follows each person for a few seconds to estimate velocity.", "lib/detector.js, lib/tracker.js, hooks/useLiveDetection.jsx"],
        ["Zones", "Splits the view into named zones (default 4×3 grid A1..C4) and aggregates people and motion per zone, including a counter-flow index.", "lib/zones.js"],
        ["Risk engine", "CrowdEngine: smoothing, density levels, surge, forecast, turbulence and counter-flow rules; produces a snapshot with levels and a 0–100 risk score.", "lib/risk.js"],
        ["Simulation", "A scripted, deterministic 90 s station scenario (Platform 2 of a junction) plus three side cameras; what-if actions change it.", "lib/simulation.js"],
        ["Site", "Where the exits and entries are (Gate 1–3, footbridge stairs). Advice names real exits only when a site is configured.", "lib/site.js"],
        ["DAA engine", "Builds the crowd graph and runs the decision pipeline; projects risk with the existing model.", "engine/*.js"],
        ["Algorithms", "Hand-written data structures and algorithms; no graph, routing or sorting libraries.", "algorithms/**"],
        ["UI", "Monitor, Station, Zones, Timeline, Setup, DAA Engine and Algorithm Analysis tabs.", "components/**"],
    ], [23 * mm, 93 * mm, W - 116 * mm], mono_cols=(2,)),
    P("2.1 Computer vision: from pixels to crowd state", "h2"),
    P("Each sampled frame goes through the person detector. Every detected person becomes a point (the centre of the box). "
      "The tracker matches points between frames to estimate speed and direction. Points are counted into zones. Per zone, Sentinel "
      "computes the average velocity, the spread of velocities, and a counter-flow index (0 when everyone moves the same way, "
      "1 when two equal streams move in opposite directions along one line)."),
    P("2.2 The risk rules", "h2"),
    table([
        ["Rule", "Meaning", "Why it matters"],
        ["Density", "People per zone vs WATCH / WARNING / CRITICAL limits, scaled to zone size", "The basic crush indicator"],
        ["Surge", "A zone rising by a set % and number of people within 20 s", "Fast build-up gives little time to react"],
        ["Forecast", "Least-squares growth rate projected to the CRITICAL threshold", "Early warning: seconds until crush density"],
        ["Turbulence", "Density × spread of movement (Helbing et al., 2007)", "Pushing in different directions precedes crushes"],
        ["Counter-flow", "Two streams moving opposite ways along one line", "Common trigger at stairs and gates"],
    ], [24 * mm, 82 * mm, W - 106 * mm]),
    P("Overall risk is the worst zone's level, raised by one level while a surge, turbulence or counter-flow is active. "
      "Every alert explains which rule fired. The DAA engine reads this snapshot as its input.", "small"),
    P("2.3 Simulation and the Emergency Crowd Surge scenario", "h2"),
    P("For a reliable classroom demo, Simulation mode plays a scripted 90-second evening rush: a train is delayed, the crowd funnels "
      "toward the staircase in zone B3, a train arrives and passengers push up the stairs against the crowd. "
      f"<b>Load Emergency Crowd Surge</b> replays this script with no automatic response to 0:{D['t']} and pauses. No random numbers "
      f"are used, so every load gives exactly the same state: <b>{D['people']} people</b>, zone B3 at "
      f"<b>{D['critical']['density']}% of crush density</b>, counter-flow at the foot of the stairs, Gate 2 and the emergency exit closed."),
    shot("monitor-critical.png", f"Monitor tab at 0:{D['t']} in the Emergency Crowd Surge scenario. B3 is CRITICAL with turbulence 100 and counter-flow "
         "(red opposing arrows); B2 and C3 are forecast to reach crush density in about 20–25 s. The alert feed explains each rule."),
    P("2.4 The tabs", "h2"),
    table([
        ["Tab", "Purpose"],
        ["Monitor", "Camera view (simulated or live), zone grid, flow arrows, alert feed with reasons, what-if buttons"],
        ["Station", "Four-camera station map coloured by risk; arrows show where actions send people"],
        ["Zones / Timeline", "Per-zone details; full chart, alert history, incident report, CSV export"],
        ["Setup", "Thresholds, notifications, site exits/entries, zone editor"],
        ["DAA Engine", "The decision pipeline, eight steps, each drawn on the crowd graph with step-by-step replay"],
        ["Algorithm Analysis", "Complexity table (theory vs observed runtime) and benchmark mode"],
    ], [34 * mm, W - 34 * mm]),
]

# ================================================================ 3. GRAPH
st += [PageBreak()]
part("PART 3", "From a crowd to a graph")
g = D["graph"]
st += [
    P("Every DAA algorithm in Sentinel works on <b>one graph</b>, rebuilt from the live crowd state "
      f"(engine/crowdGraphBuilder.js). In the emergency scenario it has <b>V = {g['V']} nodes and E = {g['E']} directed edges</b>."),
    table([
        ["Node type", "Where it comes from", "Data on the node"],
        ["Zone (12)", "The camera's zones A1..C4", "people, density (% of crush density), risk = max(alert level, turbulence, counter-flow)"],
        ["Exit (Gate 1–3, emergency exit)", "Site configuration; linked to the nearest zone", "closed or open (a closed exit has capacity 0)"],
        ["Stairs", "Site entry 'Footbridge stairs'", "counter-flow measured by the camera at its foot"],
        ["Area (footbridge, concourse, Platform 3)", "The other three station cameras", "people and density from those cameras"],
        ["Safe area", "One sink node: the street", "-"],
    ], [42 * mm, 58 * mm, W - 100 * mm]),
    Spacer(1, 6),
    table([
        ["Edge attribute", "Meaning", "How it is computed"],
        ["distance", "Metres walked", "Zone centres on an 80 m × 24 m platform; fixed lengths for stairs and passages"],
        ["capacity", "People per minute that can pass safely", "90/min on open floor × crowd factor; gates 40–45; stairs 60 × (1 − 0.6 × counter-flow); 0 if closed"],
        ["congestion", "How full the destination is", "Destination density in % of crush density (from the camera)"],
        ["risk", "Danger at the destination", "max(alert level, turbulence, counter-flow), 0–100"],
        ["cost", "Crowd-aware cost for Dijkstra", "0.4 × distance + 0.4 × congestion + 0.2 × risk"],
    ], [26 * mm, 50 * mm, W - 76 * mm]),
    Spacer(1, 4),
    P(f"cost = {D['weights']['distance']} × distance(m) + {D['weights']['congestion']} × congestion(%) + {D['weights']['risk']} × risk(0–100)", "mono"),
    P("<b>Crowd factor.</b> Pedestrian flow slows in dense crowds (the fundamental diagram of pedestrian flow). Sentinel uses a "
      "simple version: full capacity up to 50% of crush density, falling linearly to 40% of capacity at crush density. "
      "<b>Counter-flow loss.</b> At full counter-flow the stairs lose 60% of their capacity, because people going down block people going up."),
    P("Why a graph, and why an adjacency list?", "h2"),
    P("A station is a network: areas connected by corridors, stairs and gates, each with a length and a width. A graph captures exactly this, "
      "and once the crowd is a graph, decades of proven algorithms apply. We store it as an <b>adjacency list</b> (each node keeps a list "
      f"of its outgoing edges). Our graph is sparse: {g['E']} edges against V² = {g['V'] ** 2} possible pairs. An adjacency list uses "
      "O(V + E) memory and lets BFS, DFS, Dijkstra and max flow visit a node's neighbours in time proportional to its degree, which is what "
      "gives them their O(V + E)-style bounds. An adjacency matrix would need O(V²) memory and O(V) time to list neighbours."),
    shot("step2-graph.png", "The crowd graph in the app (DAA Engine, step 2). Circles are camera zones with their head counts (colour = alert level). "
         "Edge colour shows congestion; dashed grey edges are closed (capacity 0). Right column: areas measured by the other station cameras.", trim=True),
    *complexity_box("graph"),
]

# ================================================================ 4. ALGORITHMS
st += [PageBreak()]
part("PART 4", "DAA concepts: what, why and how")
st += [
    P("Each algorithm below is hand-written in src/algorithms/ and actually called by the decision engine (engine/decisionEngine.js). "
      "For each one we give: what it is, <b>why we use it in Sentinel</b>, what it computes in the emergency scenario, its complexity, "
      "and why we did not choose an alternative."),
    table([
        ["#", "Question the operator asks", "Algorithm", "Answer in the emergency scenario"],
        ["1", "Which zones are most dangerous?", "Merge sort + binary search", f"{D['critical']['name']} ({D['critical']['density']}%), band {D['critical']['band']['label']}"],
        ["2", "Which exits can those people reach?", "BFS", ", ".join(x[0] for x in D["bfs"]["reachable"]) + "; not " + ", ".join(D["bfs"]["blocked"])],
        ["3", "Which connected zones are affected?", "DFS", " → ".join(D["dfs"]["order"])],
        ["4", "Which way should they go?", "Dijkstra", " → ".join(D["dijkstra"]["safest"]["path"])],
        ["5", "How fast can we evacuate?", "Edmonds-Karp max flow", f"{D['flow']['max']} people/min"],
        ["6", "What limits evacuation?", "Min cut", ", ".join(c[0] for c in D["flow"]["cut"])],
        ["7", "What should we do?", "Greedy (+ backtracking check)", " + ".join(s["chosen"] for s in D["greedy"]["steps"])],
    ], [7 * mm, 46 * mm, 38 * mm, W - 91 * mm]),
]


def algo(num, title, what, why, how, key, alt, viva, figure=None, extra_box=None, after_how=None):
    out = [CondPageBreak(70 * mm), P(f"4.{num} {title}", "h2"), P("<b>What it is.</b> " + what),
           P("<b>Why we use it in Sentinel.</b> " + why, "why"), P("<b>What it computes here.</b> " + how)]
    if after_how:
        out += after_how
    if figure:
        out.append(figure)
    out += complexity_box(key, extra_box)
    out.append(P("<b>Why not something else?</b> " + alt))
    out.append(P("Viva answer: “" + viva + "”", "viva"))
    return out


rk = D["ranking"]
st += algo(1, "Merge sort: ranking zones by danger",
           "A divide-and-conquer sort. Split the list in half, sort each half recursively, then merge the two sorted halves by repeatedly "
           "taking the smaller front item. The recurrence T(n) = 2T(n/2) + O(n) solves to O(n log n).",
           "Before deciding anything we need to know where the danger is. Ranking zones by density (ties broken by people, then "
           "turbulence) gives the operator a priority list and gives the rest of the pipeline its starting point: the top zone becomes the "
           "source for BFS, DFS and Dijkstra. Merge sort is <b>stable</b>, so zones with equal density keep their camera order and the "
           "ranking is reproducible, and it is O(n log n) in the <b>worst</b> case, which matters when a stadium has hundreds of zones.",
           f"Input: {len(rk['before'])} zones in camera order. Output: "
           + ", ".join(f"{n} {d}%" for n, d, _ in rk['ranked'][:5]) + f", … ({rk['divides']} divides and {rk['merges']} merges, i.e. n − 1 merges for n = 12).",
           "mergeSort",
           "Quicksort is O(n²) in the worst case and not stable. Insertion sort is O(n²). JavaScript's Array.prototype.sort hides the "
           "algorithm and its behaviour depends on the engine, so it is deliberately not used for the ranking.",
           "Merge sort ranks the zones in guaranteed O(n log n), and because it is stable, equal zones stay in a predictable order.")

bands = D["ranking"]["bands"]
st += algo(2, "Binary search: finding the alert band",
           "Search in a sorted array by comparing with the middle element and discarding half of the range each step: O(log n).",
           "Alert thresholds are a sorted list (SAFE from 0, WATCH from 8, WARNING from 13, CRITICAL from 18 people per zone area). "
           "For each zone we need the last threshold that the density reaches: a classic 'last element ≤ value' search. With four bands the "
           "saving is small, but the same code scales to fine-grained tables (per-zone capacity tables, many alert bands) where a linear scan "
           "would be wasteful. It uses exactly the same rule as the existing risk engine, so the two always agree.",
           f"Zone {D['critical']['name']}: {D['critical']['perArea']} people per zone area against thresholds "
           f"[{', '.join(str(b[0]) for b in bands)}]. Probes: " + " → ".join(f"index {p['index']} ({p['min']} ≤ {D['critical']['perArea']})" for p in D['critical']['probes'])
           + f". Found <b>{D['critical']['band']['label']}</b> in {len(D['critical']['probes'])} comparisons.",
           "binarySearch",
           "Linear search is O(n). A hash map cannot answer 'which range contains this value'. Binary search is the standard tool for range lookup in sorted data.",
           "The thresholds are sorted, so binary search finds a zone's alert band in O(log n) comparisons instead of checking every threshold.")

bfs = D["bfs"]
st += algo(3, "Breadth-first search: which exits are reachable?",
           "Explore a graph level by level from a start node using a FIFO <b>queue</b>: first all neighbours, then their neighbours, and so on. "
           "Each node is visited once and each edge checked once.",
           "Before routing people we must know whether an exit can be reached at all. BFS answers reachability, and because it explores in "
           "hop order it also gives the fewest-hops distance to each exit. Closed edges (capacity 0, e.g. a locked gate) are skipped, so a "
           "locked exit shows up as <b>unreachable</b>, which immediately suggests an intervention: open it.",
           f"From {D['critical']['name']}, BFS visits {len(bfs['order'])} nodes in the order " + " → ".join(bfs["order"][:10]) + " → …  Reachable exits: "
           + ", ".join(f"{n} ({h} hops)" for n, h in bfs["reachable"]) + f". <b>Not reachable: {', '.join(bfs['blocked'])}</b> (closed).",
           "bfs",
           "DFS would also find reachability but not the hop distance. Dijkstra is unnecessary when we only ask 'can we get there'.",
           "BFS checks reachability through the crowd network in O(V + E). Closed gates have zero capacity, so BFS correctly reports them as unreachable.",
           figure=shot("step3-graph.png", "BFS in the app: numbers show the visit order, black edges the BFS tree, labels the hop count. Gate 2 and the emergency exit are marked unreachable.", trim=True))

st += algo(4, "Depth-first search: the affected danger cluster",
           "Explore as deep as possible along one branch before backtracking. We use an explicit <b>stack</b> instead of recursion, so a "
           "large venue cannot overflow the call stack.",
           "Danger rarely stays in one zone. Stewards need the whole <b>connected region</b> of crowded zones around the critical zone, because "
           "it must be managed together: moving people from B3 into an already crowded neighbour just moves the problem. DFS with a filter "
           "(enter only zones at WATCH or above) is a flood fill that returns exactly that region.",
           f"From {D['critical']['name']}, entering only zones at WATCH or above: <b>{' → '.join(D['dfs']['order'])}</b>. These zones hold the "
           "crowd that must be handled as one area; the calm zones around them are where people can be sent.",
           "dfs",
           "BFS would find the same set; DFS is the natural fit for region filling and only needs to remember the current path. "
           "Union-Find could maintain clusters incrementally as zones change level (see Part 8).",
           "DFS explores the connected region of dangerous zones around the critical zone, in O(V + E), using an explicit stack.",
           figure=shot("step4-graph.png", "DFS danger cluster: the red tree from B3 enters only zones at WATCH or above.", trim=True))

dj = D["dijkstra"]
st += algo(5, "Dijkstra: the safest evacuation route",
           "Single-source shortest paths for graphs with non-negative edge weights. It repeatedly settles the unsettled node with the smallest "
           "known distance, taken from a <b>binary min-heap</b> (priority queue), and relaxes its outgoing edges. Correct because, with "
           "non-negative weights, no later path can make a settled node cheaper.",
           "The shortest route is not always the safest. Sentinel's edge cost combines distance, congestion and risk, all measured by the "
           "cameras, so Dijkstra finds the route that avoids crowded and turbulent areas, even if it is longer. All costs are ≥ 0, which is exactly the "
           "condition Dijkstra needs. To show the difference, the engine runs the same Dijkstra twice: once on metres and once on cost.",
           "Two routes from " + D['critical']['name'] + " on the same graph:",
           "dijkstra",
           "BFS ignores weights. Bellman-Ford handles negative weights we do not have and costs O(V·E). Floyd-Warshall computes all pairs "
           "in O(V³), which we do not need. A* needs a heuristic and is planned for large venues (Part 8).",
           "Dijkstra is used because evacuation costs are never negative. The cost combines distance, congestion and risk, so it picks a longer "
           "route when the shorter one runs through the crush.",
           after_how=[table([
               ["Route", "Path", "Metres", "Cost", "Max congestion", "Max risk"],
               ["Shortest (by metres)", " → ".join(dj["shortest"]["path"]), fmt(dj["shortest"]["distance"]), fmt(dj["shortest"]["cost"]), f"{dj['shortest']['congestion']}%", fmt(dj["shortest"]["risk"])],
               ["Safest (by cost)", " → ".join(dj["safest"]["path"]), fmt(dj["safest"]["distance"]), fmt(dj["safest"]["cost"]), f"{dj['safest']['congestion']}%", fmt(dj["safest"]["risk"])],
           ], [30 * mm, 66 * mm, 15 * mm, 14 * mm, 25 * mm, W - 150 * mm]), Spacer(1, 4),
               P(f"The safest route is {fmt(dj['safest']['distance'] - dj['shortest']['distance'])} m longer but its cost is "
                 f"{fmt(round(dj['shortest']['cost'] - dj['safest']['cost'], 1))} lower, because the short route climbs the stairs through C3 "
                 f"({dj['shortest']['congestion']}% congestion) against counter-flow (risk {dj['shortest']['risk']}). Settle order: "
                 + ", ".join(f"{n} {d}" for n, d in dj["settled"][:8]) + ", …")],
           figure=shot("step5-graph.png", "Dijkstra in the app: solid black = safest route with edge costs; dashed red = shortest route by metres; "
                       "numbers give the settle order and d = cost from B3.", trim=True),
           extra_box=["Lazy deletion", "Instead of decrease-key, a node is pushed again when its distance improves; stale heap entries are skipped when popped. Same O((V + E) log V) bound because log E ≤ 2 log V."])

fl = D["flow"]
st += algo(6, "Maximum flow (Edmonds-Karp): evacuation capacity",
           "A flow network has a source, a sink and edge capacities. The maximum flow is the largest amount that can move from source to sink "
           "without exceeding any capacity and with flow conserved at every node. <b>Ford-Fulkerson</b> repeatedly finds a source-to-sink "
           "path with spare capacity in the <b>residual graph</b> and pushes as much as the path's tightest edge allows. <b>Edmonds-Karp</b> "
           "always picks the <i>shortest</i> such path (by BFS), which bounds the number of augmentations to O(V·E).",
           "People moving through corridors, stairs and gates behave like flow through pipes with limited width: each connection lets only so many "
           "people per minute through. Edge capacity in Sentinel means exactly that. A virtual source feeds every occupied zone and the "
           "sink is the street, so the maximum flow is the <b>evacuation capacity of the whole station in people per minute</b>. Dividing the "
           "people on the platform by it gives an estimated clearance time.",
           f"Three augmenting paths, found by BFS on the residual graph:",
           "maxFlow",
           "Plain Ford-Fulkerson with arbitrary paths runs in O(E·f), which depends on the capacity values (and may not terminate with irrational "
           "capacities). Edmonds-Karp's bound depends only on the graph size. Dinic's algorithm, O(V²·E), is faster for very large graphs (Part 8).",
           "Crowd movement through corridors is flow through capacity-limited edges. Edmonds-Karp augments along shortest paths with BFS, so it runs in O(V·E²).",
           after_how=[table([["Iteration", "Augmenting path (from the crowd)", "Pushed", "Total"]] +
                            [[str(i + 1), " → ".join(p["path"]), f"+{fmt(p['add'])}", fmt(p["total"])] for i, p in enumerate(fl["paths"])],
                            [20 * mm, W - 60 * mm, 20 * mm, 20 * mm]), Spacer(1, 4),
                      P(f"<b>Maximum flow = {fl['max']} people/min.</b> With {D['people']} people on the platform, estimated clearance = "
                        f"{D['people']} ÷ {fl['max']} × 60 ≈ <b>{round(fl['evac'])} s</b>."),
                      P("<b>The residual graph.</b> Each edge u→v with capacity c becomes a forward arc with residual c − f and a reverse arc v→u "
                        "with residual f. Reverse arcs let a later path cancel flow that an earlier path sent the wrong way, which is what makes "
                        "the greedy path choice end at the true maximum. In the code, arc i and arc i XOR 1 are always a forward/reverse pair.")],
           figure=shot("step6-graph.png", "Max flow in the app: black edges show flow / capacity; thick red edges are the min cut (labelled with capacity); "
                       "dashed orange edges are closed exits that cross the cut.", trim=True))

st += algo(7, "Minimum cut: the bottleneck",
           "An s-t cut splits the nodes into a source side and a sink side; its capacity is the total capacity of edges going from the source side "
           "to the sink side. The <b>max-flow min-cut theorem</b> says the maximum flow equals the capacity of the smallest cut. After Edmonds-Karp, "
           "the nodes still reachable from the source in the residual graph form the source side of a minimum cut.",
           "Max flow says how much; min cut says <b>why not more</b>. The cut edges are the bottleneck of the evacuation, which tells the operator "
           "where to act: only adding capacity across the cut can increase evacuation capacity. Sentinel also lists <b>closed</b> edges that cross "
           "the cut (a locked gate next to the crowd), because opening one adds capacity directly across the bottleneck.",
           "Cut edges: " + ", ".join(f"<b>{e}</b> ({fmt(c)}/min)" for e, c in fl["cut"]) + f". Total {sum(c for _, c in fl['cut']):g}/min = the max flow, "
           "as the theorem requires. The stairs carry only 35/min because the camera measures 70% counter-flow at their foot. Closed edges "
           "crossing the cut: " + ", ".join(fl["closed"]) + ".",
           "minCut",
           "Checking every possible cut is exponential (2<super>V</super> subsets). Reading the cut from the final residual graph costs one BFS.",
           "By max-flow min-cut, the saturated edges leaving the residual-reachable set limit the total flow, so they are the evacuation bottleneck.",
           figure=KeepTogether([flow_toy_diagram(), P("Toy example of the theorem and the key insight used by the greedy step: improving an edge that is not in the min cut cannot raise the maximum flow.", "caption")]))

gr = D["greedy"]
greedy_rows = [["Step", "Option", "Cost", "Seconds saved", "Ratio"]]
for i, s in enumerate(gr["steps"]):
    for name, cost, gain, ratio in s["options"]:
        chosen = name == s["chosen"]
        greedy_rows.append([str(i + 1) if chosen else "", ("<b>" + name + "  (chosen)</b>") if chosen else name, str(cost),
                            "over budget" if gain is None else f"{fmt(gain)} s", "-" if ratio is None else fmt(ratio)])
st += algo(8, "Greedy: choosing interventions",
           "A greedy algorithm builds a solution step by step, always taking the option that looks best right now, and never undoing a choice. "
           "It is fast and simple, but only guaranteed optimal for problems with the greedy-choice property (e.g. fractional knapsack, Kruskal).",
           "In an emergency, operators need a recommendation in seconds, in a form they can understand: 'do this first, then this'. "
           "Sentinel has candidate actions with a cost (staff and disruption points): open Gate 2, pause entry from the footbridge, redirect to "
           "Platform 3, open the emergency exit. For each candidate, the greedy step <b>re-runs max flow</b> on the graph with that action applied "
           "and measures the seconds of clearance time saved. It picks the best <b>seconds saved ÷ cost</b>, applies it, and repeats with the "
           f"new state, until the goal (clear within {D['target']} s) is met or the budget ({D['budget']} points) runs out.",
           f"Clearance starts at {fmt(gr['initial'])} s. {gr['stop']} after {len(gr['steps'])} steps at {fmt(gr['final'])} s, spending {gr['spent']} of {D['budget']} points.",
           "greedy",
           "Exhaustive search (backtracking, next section) is exact but exponential. Integer linear programming is exact but heavy for a browser. "
           "Greedy is the practical choice for a live decision; we verify it with backtracking.",
           "Greedy gives a fast, explainable plan by repeatedly taking the action with the best benefit-to-cost ratio. It is locally optimal and not "
           "guaranteed to be globally optimal, which is why we check it with backtracking.",
           after_how=[table(greedy_rows, [12 * mm, W - 74 * mm, 12 * mm, 28 * mm, 22 * mm]), Spacer(1, 4),
                      P("<b>Notice 'Redirect to Platform 3' saves 0 s.</b> It adds capacity after the footbridge, but the footbridge is not in the min cut; "
                        "the stairs before it are. This is the max-flow min-cut theorem in action, and greedy correctly ignores it."),
                      P("<b>Greedy is not always optimal.</b> One of our unit tests uses budget 4 with a cheap action (cost 1, +12 capacity) "
                        "and a big one (cost 4, +40). Greedy takes the cheap one first (better ratio) and can no longer afford the big one; "
                        "backtracking finds the big one is better.")],
           figure=shot("step7-graph.png", "Graph with the greedy plan applied: green edges gained capacity (Gate 2: 0 → 45, emergency exit: 0 → 30); "
                       "red edges are the new min cut.", trim=True))

op = D["optimal"]
st += algo(9, "Backtracking: checking the greedy plan",
           "Backtracking explores a decision tree (here: include or exclude each intervention), and abandons (prunes) a branch as soon as it "
           "cannot lead to a valid solution.",
           "We want to be honest about greedy. Backtracking gives the <b>exact</b> best plan within the budget, so the app can state whether greedy "
           "matched the optimum. With only four actions this is cheap; its exponential growth is exactly why greedy is used for the live decision.",
           f"{op['explored']} complete plans evaluated, {op['pruned']} branches pruned (over budget), out of {op['total']} subsets. "
           f"Best within budget: <b>{' + '.join(op['plan'])}</b> (clearance {fmt(op['value'])} s, cost {op['cost']}). "
           "Greedy found the same plan, so greedy matched the optimum here.",
           "backtracking",
           "Plain brute force evaluates all 2<super>m</super> subsets with no pruning. Branch and bound with an upper bound on remaining benefit "
           "would prune more (Part 8).",
           "Backtracking tries every include/exclude choice and prunes branches that break the budget. It is O(2^m), so we use it to verify greedy, not to decide live.")

st += [CondPageBreak(60 * mm), P("4.10 Data structures used", "h2"),
       table([
           ["Data structure", "Operations and cost", "Used by", "File"],
           ["Adjacency list", "add edge O(1), neighbours O(degree), memory O(V + E)", "Every graph algorithm", "algorithms/graph/Graph.js"],
           ["Queue (head index)", "enqueue / dequeue O(1)", "BFS, Edmonds-Karp, min cut", "dataStructures/Queue.js"],
           ["Stack", "push / pop O(1)", "DFS", "dataStructures/Stack.js"],
           ["Binary min-heap", "push / pop O(log n), peek O(1)", "Dijkstra", "dataStructures/MinHeap.js"],
           ["Residual graph", "paired arcs i and i XOR 1; update O(1) per arc", "Edmonds-Karp, min cut", "flow/maxFlow.js"],
           ["Arrays", "merge buffers O(n); sorted thresholds", "Merge sort, binary search", "sorting/, searching/"],
       ], [32 * mm, 56 * mm, 42 * mm, W - 130 * mm], mono_cols=(3,)),
       P("The queue keeps a head index instead of calling Array.shift(), which is O(n) in JavaScript; this keeps BFS truly O(V + E).", "small")]

# ================================================================ 5. WORKED EXAMPLE
st += [PageBreak()]
part("PART 5", "End-to-end worked example: Emergency Crowd Surge")
pj = D["projection"]
lv = ["SAFE", "WATCH", "WARNING", "CRITICAL"]
st += [
    P("This is the whole pipeline on one deterministic state, exactly as the professor can trace it in the code: "
      "<b>input → algorithm → output → decision</b>."),
    table([
        ["Step", "Input", "Algorithm", "Output", "Decision it supports"],
        ["0", f"Simulated CCTV at 0:{D['t']}", "Risk engine (CV layer)", f"{D['people']} people, overall CRITICAL, score {D['score']}", "Start the analysis"],
        ["1", "12 zone densities", "Merge sort, binary search", f"{D['critical']['name']} first, {D['critical']['band']['label']}", "Focus on B3"],
        ["2", "Crowd state + site + side cameras", "Graph builder", f"V = {g['V']}, E = {g['E']}", "-"],
        ["3", "Graph, start B3", "BFS", f"Gate 2 and emergency exit unreachable", "Opening an exit is worth considering"],
        ["4", "Graph, start B3", "DFS", " → ".join(D["dfs"]["order"]), "Manage these zones together"],
        ["5", "Graph, costs", "Dijkstra ×2", " → ".join(dj["safest"]["path"][:4]), "Send B3 towards Gate 3, not the stairs"],
        ["6", "Graph, capacities", "Edmonds-Karp", f"{fl['max']} people/min, ≈ {round(fl['evac'])} s", "Evacuation is too slow"],
        ["7", "Residual graph", "Min cut", "Gate 1, stairs (35), Gate 3", "Add capacity across the cut"],
        ["8", "4 candidate actions", "Greedy (+ max flow per option)", " + ".join(s["chosen"] for s in gr["steps"]), "Recommended plan"],
        ["9", "Same candidates", "Backtracking", "Same plan is optimal", "Confidence in the plan"],
        ["10", "Graph with plan", "Edmonds-Karp, Dijkstra", f"{D['after']['max']} people/min, ≈ {round(D['after']['evac'])} s", "Expected improvement"],
        ["11", "Scenario replay", "Existing risk model", f"risk {pj['without']['score']} → {pj['withPlan']['score']} at 1:18", "Independent confirmation"],
    ], [12 * mm, 33 * mm, 33 * mm, 48 * mm, W - 126 * mm]),
    Spacer(1, 6),
    P("The recommendation the app generates", "h2"),
    P("<br/>".join(D["recommendation"]), "quote"),
    KeepTogether([P("Before and after", "h2"), table([
        ["Measure", "Before", "After the plan", "Change"],
        ["Evacuation capacity (max flow)", f"{fl['max']} /min", f"{D['after']['max']} /min", f"+{D['gainPct']}%"],
        ["Estimated clearance", f"{round(fl['evac'])} s", f"{round(D['after']['evac'])} s", f"−{D['timeCutPct']}%"],
        ["Bottleneck (min cut)", ", ".join(c[0] for c in fl["cut"]), ", ".join(c[0] for c in D["after"]["cut"]), "two more exits share the load"],
        [f"Projected risk at 1:18 (existing risk model)", f"{pj['without']['score']}/100 {lv[pj['without']['level']]}", f"{pj['withPlan']['score']}/100 {lv[pj['withPlan']['level']]}", "from crush risk to safe"],
    ], [44 * mm, 40 * mm, 56 * mm, W - 140 * mm]),
    P("Graph values are recomputed by running the same algorithms on the graph with the plan applied. Projected risk replays the deterministic "
      "scenario 20 s ahead with Sentinel's own risk engine, once without and once with the plan. Pressing <b>Apply recommended plan</b> adds the same "
      "actions to the running simulation: within about 8 seconds the live risk falls from CRITICAL to WATCH.", "small")]),
]

# ================================================================ 6. COMPLEXITY
st += [CondPageBreak(110 * mm)]
part("PART 6", "Complexity analysis, comparison and benchmark")
alg_order = ["mergeSort", "binarySearch", "graph", "bfs", "dfs", "dijkstra", "maxFlow", "minCut", "greedy", "backtracking"]
rows = [["Algorithm", "Sentinel use", "Time", "Space", "Observed"]]
for k in alg_order:
    a = D["algorithms"][k]
    ms = D["timings"][k]
    rows.append([a["name"], a["purpose"], a["time"], a["space"], f"{ms * 1000:.1f} µs" if ms < 0.01 else f"{ms:.3f} ms"])
st += [
    table(rows, [36 * mm, 56 * mm, 34 * mm, 22 * mm, W - 148 * mm], mono_cols=(2, 3, 4)),
    P(f"V = {g['V']}, E = {g['E']} edges in the scenario graph; m = 4 candidate interventions; T_flow = one Edmonds-Karp run. Observed times are averages over "
      "repeated runs on one machine (Node.js), measured with performance.now().", "small"),
    P("Deriving the bounds", "h2"),
    *bullets([
        "<b>BFS / DFS: O(V + E).</b> Every node enters the queue/stack at most once (visited set) and every adjacency list is scanned once.",
        "<b>Dijkstra: O((V + E) log V).</b> Each node is settled once (V pops); each edge relaxation may push one heap entry (E pushes); each heap "
        "operation is O(log E) = O(log V).",
        "<b>Edmonds-Karp: O(V·E²).</b> Each BFS is O(E). With shortest augmenting paths, the BFS distance to every node never decreases, and each "
        "edge can be the bottleneck (critical) at most O(V) times, so there are O(V·E) augmentations.",
        "<b>Min cut: O(V + E)</b> once the max flow is known: one BFS on the residual graph and one pass over the edges.",
        "<b>Greedy: O(m²·T_flow)</b> worst case: at most m steps, each evaluating up to m options with one max-flow run each. Here that is at most "
        "4 + 3 + 2 + 1 = 10 max-flow runs.",
        "<b>Backtracking: O(2<super>m</super>·T_flow)</b> worst case: 16 subsets for m = 4; pruning removed 4 branches here. At m = 30 it would be over a billion.",
        "<b>Whole pipeline:</b> dominated by greedy and backtracking. For this station that is about 1–2 ms in total.",
    ]),
    P("Algorithm comparisons", "h2"),
    table([
        ["Comparison", "What it shows"],
        ["BFS vs Dijkstra", "BFS finds the fewest hops; Dijkstra the cheapest path when edges have different non-negative weights."],
        ["Dijkstra on metres vs on cost", "Same algorithm, different weights: the safest route is 12 m longer but avoids the crush."],
        ["Ford-Fulkerson vs Edmonds-Karp", "Arbitrary paths: O(E·f), depends on capacities. Shortest (BFS) paths: O(V·E²), depends only on graph size."],
        ["Max flow vs min cut", "Equal by the theorem; the app and the tests check that the cut capacity equals the flow."],
        ["Greedy vs backtracking", "Polynomial and locally optimal vs exponential and exact. Here they agree; a unit test shows a case where they do not."],
        ["Merge sort vs quicksort", "Both O(n log n) on average; merge sort is also O(n log n) in the worst case and stable."],
    ], [48 * mm, W - 48 * mm]),
    P("Theoretical complexity vs observed runtime", "h2"),
    P("Big-O is a worst-case bound on growth; a stopwatch is a single observation on one machine. The Algorithm Analysis tab shows both side "
      "by side and states clearly that observed runtimes <b>cannot prove</b> a bound. Benchmark mode runs merge sort, BFS, Dijkstra and "
      "Edmonds-Karp on seeded synthetic inputs (random arrays, grid graphs) of size 10 to 1000:"),
]
bm = D["benchmark"]
st += [table([["n", "E", "Merge sort (ms)", "BFS (ms)", "Dijkstra (ms)", "Edmonds-Karp (ms)"]] +
             [[str(r["n"]), str(r["edges"]), f"{r['mergeSort']:.4f}", f"{r['bfs']:.4f}", f"{r['dijkstra']:.4f}", f"{r['maxFlow']:.4f}"] for r in bm],
             [16 * mm, 18 * mm, 32 * mm, 32 * mm, 32 * mm, W - 130 * mm], mono_cols=(1, 2, 3, 4, 5)),
       P("Measured when this report was generated (Node.js). Merge sort, BFS and Dijkstra grow roughly in line with n log n, V + E and (V + E) log V. "
         "Edmonds-Karp grows far more slowly than its O(V·E²) worst case on these grids, because the number of augmenting paths stays small; worst-case "
         "bounds are often pessimistic in practice. Small sizes are noisy because of timer resolution and JIT warm-up.", "small"),
       KeepTogether([benchmark_chart(bm), P("Observed runtime per run against input size (numeric axis, so the curve shapes reflect real growth). Same data as the table.", "caption")])]

# ================================================================ 7. TESTING
st += [CondPageBreak(110 * mm)]
part("PART 7", "Testing and how to verify the results")
st += [
    P("The UI is not the only place the algorithms are checked. <b>37 automated tests</b> run with Node's built-in test runner (npm test), "
      "with no extra libraries:"),
    table([
        ["Area", "What is tested"],
        ["Data structures", "Queue FIFO with 200 items and empty dequeue; stack LIFO; min-heap pops in priority order"],
        ["Merge sort", "Normal, empty, single item, descending comparator, stability, 60 random arrays against a reference sort, trace has n − 1 merges"],
        ["Binary search", "Every present item, missing item, empty and single-element arrays; band lookup at every boundary; probe count ≤ log n + 1"],
        ["BFS / DFS", "Hop order, single node, missing start, disconnected graph, closed (zero-capacity) edge, cycles, DFS filter"],
        ["Dijkstra", "Cheaper-not-fewer-hops route, distance vs cost weights, unreachable target, closed edge, negative weight rejected, "
                     "30 random graphs checked against Floyd-Warshall"],
        ["Max flow / min cut", "CLRS textbook network (23), multiple exits with a bottleneck corridor, flow conservation, zero-capacity edge, "
                               "disconnected graph, reverse edges undoing a bad path, infinite-capacity guard, cut capacity = flow"],
        ["Greedy / backtracking", "Ratio order, budget, goal, empty and useless candidates, a case where greedy is not optimal, subset and pruning counts"],
        ["End to end", "Scenario determinism; graph built from the crowd state; full analysis invariants; applied actions not re-offered; empty crowd; "
                       "no exits configured; every action logged exactly once"],
    ], [34 * mm, W - 34 * mm]),
    P("Integrity rules we followed", "h2"),
    *bullets([
        "No routing, graph or sorting library; Array.prototype.sort is not used for the ranking.",
        "No hard-coded algorithm outputs: every number in the app and in this report is computed from the graph (this report reads a JSON file exported from the engine).",
        "No random numbers in the demo scenario; random inputs only in tests and the benchmark, always with a fixed seed.",
        "Physical constants (exit widths, walking distances, which gate is locked) are a clearly labelled dataset in engine/stationModel.js.",
        "Observed runtimes are labelled as observations, never as proof of complexity.",
    ]),
    P("How to trace a result in the code", "h2"),
    table([
        ["Result", "Follow this path"],
        ["Critical zone", "decisionEngine.js runDaaAnalysis → riskEngine.js rankZones → mergeSort.js, binarySearch.js"],
        ["Safest route", "decisionEngine.js → crowdGraphBuilder.js buildCrowdGraph (edge costs) → dijkstra.js (MinHeap.js)"],
        ["Evacuation capacity", "decisionEngine.js evacuationCapacity → crowdGraphBuilder.js withCrowdSource → maxFlow.js (Queue.js)"],
        ["Bottleneck", "decisionEngine.js → minCut.js on the residual graph from maxFlow.js"],
        ["Plan", "decisionEngine.js → greedyIntervention.js with objective = clearance from maxFlow; check in backtrackingPlanner.js"],
    ], [34 * mm, W - 34 * mm], mono_cols=(1,)),
]

# ================================================================ 8. FUTURE
st += [CondPageBreak(110 * mm)]
part("PART 8", "What we will add next")
st += [
    P("These additions are <b>planned, not implemented</b>. Each one extends a DAA idea already in Sentinel, and each answers a limitation "
      "we state openly."),
    P("8.1 Dynamic programming: allocating people across exits", "h2"),
    P("<b>Problem.</b> Max flow gives the total capacity, but not 'how many people from B3 should go to each gate' so that the last person "
      "is out as early as possible. With k exits, exit j having capacity c<sub>j</sub> (people/min) and walking time w<sub>j</sub>, assigning "
      "x<sub>j</sub> people to it finishes at w<sub>j</sub> + x<sub>j</sub> / c<sub>j</sub>. We want to minimise the latest finish."),
    P("dp[j][p] = minimum possible latest finish time using exits 1..j for p people<br/>"
      "dp[0][0] = 0,   dp[0][p] = infinity for p &gt; 0<br/>"
      "dp[j][p] = min over x = 0..p of  max( dp[j-1][p-x],  w_j + x / c_j )<br/>"
      "answer = dp[k][n];   time O(k * n^2),   space O(k * n)", "mono"),
    P("<b>Why DP:</b> the problem has optimal substructure (the best split of the remaining people over the remaining exits does not depend on "
      "how earlier exits were filled) and overlapping subproblems. <b>Why not now:</b> we chose not to ship it until it is fully tested, rather "
      "than show a fake result."),
    P("8.2 Other algorithmic additions", "h2"),
    table([
        ["Addition", "DAA concept", "Why it helps Sentinel", "Complexity"],
        ["Min-cost max-flow", "Successive shortest paths with potentials", "Moves the maximum number of people while also minimising total route cost: combines Dijkstra and max flow in one answer", "O(F · E log V)"],
        ["Flow over time", "Time-expanded network", "Real clearance times that include walking time and queues, not just people ÷ flow", "max flow on V·T nodes"],
        ["Dinic's algorithm / push-relabel", "Blocking flows, level graphs", "Faster max flow for stadium-size graphs with thousands of nodes", "O(V² · E) / O(V³)"],
        ["A* and D* Lite", "Heuristic and incremental shortest paths", "Faster routing on large maps; update routes every tick instead of recomputing from scratch", "≤ Dijkstra; incremental"],
        ["Union-Find", "Disjoint sets with path compression", "Keep danger clusters up to date as zones change level, instead of re-running DFS", "≈ O(α(n)) per update"],
        ["Hungarian algorithm", "Assignment problem / bipartite matching", "Assign stewards to critical zones and gates to minimise total response time", "O(n³)"],
        ["Branch and bound", "Bounding + pruning", "Exact intervention plans for larger action sets, pruning with an upper bound on remaining benefit", "exponential worst case, far fewer nodes"],
        ["Sliding window with deque", "Monotonic queue", "O(1) per tick surge and maximum detection over long histories", "O(1) amortised"],
    ], [33 * mm, 34 * mm, W - 95 * mm, 28 * mm]),
    P("8.3 System additions", "h2"),
    *bullets([
        "<b>Crowd-density model</b> (e.g. CSRNet-style density maps) for very dense crowds, where a person detector undercounts.",
        "<b>Multi-camera fusion:</b> real cameras for every station area instead of simulated side cameras, feeding the same graph.",
        "<b>Calibrated capacities:</b> measure real people-per-minute at gates and stairs instead of illustrative constants.",
        "<b>Alerts to staff phones</b> and a small backend for logs and multi-operator use (SMS is simulated today).",
        "<b>Site editor for the graph:</b> draw corridors and capacities for any venue, not only the demo station.",
    ]),
    P("Known limitations today", "h2"),
    *bullets([
        "Clearance = people ÷ max flow is a steady-flow estimate that ignores walking time (fixed by flow over time, 8.2).",
        "Capacities and action costs are illustrative constants for one demo station.",
        "Every occupied zone is fed by an unlimited virtual source, so max flow measures exit capacity, not per-zone demand.",
        "Projected risk is only available in Simulation mode; a live camera cannot be replayed into the future.",
    ]),
]

# ================================================================ APPENDICES
st += [PageBreak()]
part("APPENDIX A", "30-minute demo script")
st += [table([
    ["Time", "Show", "Say"],
    ["0–3", "Landing page", "The crowd-crush problem; CV tells us what is happening, DAA tells us what to do."],
    ["3–7", "Monitor, Station tabs (simulation; optionally Live with a demo video)", "Zones, counts, movement, surge, turbulence, counter-flow; explainable alerts."],
    ["7–10", "DAA Engine: live graph → Load Emergency Crowd Surge → Run DAA Analysis", "How the crowd becomes a graph: nodes, edges, capacity, cost. Steps 1–2."],
    ["10–14", "Steps 3–5 (use Replay)", "BFS: Gate 2 unreachable. DFS: danger cluster. Dijkstra: safest ≠ shortest, and why."],
    ["14–20", "Step 6", "Max flow 115/min, three augmenting paths, residual graph, min cut, counter-flow on the stairs."],
    ["20–24", "Step 7", "Greedy ratio table; redirect saves 0 s (not on the cut); backtracking confirms optimum; greedy not always optimal."],
    ["24–27", "Step 8 → Apply recommended plan; Monitor", "Before/after: 115 → 190/min, 55 s → 33 s; live risk drops to WATCH."],
    ["27–30", "Algorithm Analysis → Run benchmark", "Theory vs observed; data structures; trade-offs; what we will add."],
], [14 * mm, 62 * mm, W - 76 * mm]),
    P("Keyboard: 1–7 switch tabs, ← → move between DAA steps, Space pause/play, R restart, F fullscreen.", "small")]

st += [Spacer(1, 6), P("APPENDIX B", "part"), P("Likely viva questions", "h1")]
qa = [
    ("Why is Dijkstra correct here?", "All edge costs are distance, congestion and risk multiplied by positive weights, so they are never negative. With non-negative weights, the node with the smallest tentative distance cannot be improved later, so settling it is safe."),
    ("Why Edmonds-Karp and not plain Ford-Fulkerson?", "Ford-Fulkerson's running time depends on the flow value; Edmonds-Karp chooses shortest augmenting paths with BFS, which bounds augmentations to O(V·E) and the total to O(V·E²), independent of capacities."),
    ("What is the residual graph and why do we need reverse edges?", "It records how much more flow each edge can take (forward) and how much can be undone (reverse). Without reverse edges an early bad path could block the optimum."),
    ("How do you get the min cut from the max flow?", "After the last BFS fails, the nodes reachable from the source in the residual graph form side S. Original edges from S to the rest are saturated, and their capacities sum to the max flow."),
    ("Why does 'Redirect to Platform 3' give zero benefit?", "It adds capacity after the footbridge, but the min cut is at the stairs before it. Only increasing capacity across the min cut can raise the maximum flow."),
    ("Is the greedy plan optimal?", "Not in general. Here backtracking checked all 16 subsets and found the same plan. A unit test shows a budget where greedy is worse."),
    ("Why merge sort instead of the built-in sort?", "To implement and control the algorithm: guaranteed O(n log n) worst case and stability. The built-in sort is engine-dependent and would hide the algorithm."),
    ("What is the overall complexity of one analysis?", "Dominated by greedy (O(m²) max-flow runs) and backtracking (O(2^m) runs), each Edmonds-Karp O(V·E²). With V = 21, E = 48 and m = 4, about 1–2 ms."),
    ("Do your runtime measurements prove the complexity?", "No. They are observations on one machine; Big-O is a mathematical bound. The benchmark only illustrates trends."),
    ("Where do the numbers come from?", "From the crowd state (camera or deterministic simulation) and a labelled station dataset; every result is computed by the algorithms and can be traced in decisionEngine.js."),
    ("What if the camera fails during the demo?", "The DAA engine is independent of computer vision. Simulation mode and the emergency scenario run offline, with no model, webcam or internet."),
    ("What would you add with more time?", "Dynamic programming for exit allocation, min-cost max-flow, flow over time for real clearance times, and Dinic's algorithm for large venues."),
]
for q, a in qa:
    st.append(KeepTogether([P(f"<b>Q. {q}</b>", "h3"), P(a)]))

st += [CondPageBreak(80 * mm), P("APPENDIX C", "part"), P("How to run", "h1"),
       P("npm install<br/>npm run dev        (open http://localhost:5173)<br/>npm test           (37 tests)<br/>npm run build", "mono"),
       P("In the app: <b>DAA Engine</b> tab → <b>Load Emergency Crowd Surge</b> → <b>Run DAA Analysis</b>. For Live detection, use the clips in the "
         "sentinel-demo-videos folder (Live detection → Upload MP4); the AI model (≈ 67 MB) downloads once and is then cached."),
       P("This report was generated from the code: docs/report/export-data.mjs exports the engine's results, capture.mjs takes the screenshots, "
         "and make_report.py builds the PDF.", "small")]

doc.build(st)
print("wrote", OUT)
