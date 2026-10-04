from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Table, TableStyle,
    Image, PageBreak, KeepTogether, NextPageTemplate,
)

ROOT = "C:/Users/anany/OneDrive/Desktop/DESKTOP_FOLDERS/curiospark"
IMG = ROOT + "/docs/images/"
OUT = ROOT + "/docs/Sentinel-Crowd-Project-Guide.pdf"

F = "C:/Windows/Fonts/"
pdfmetrics.registerFont(TTFont("Body", F + "segoeui.ttf"))
pdfmetrics.registerFont(TTFont("Body-Bold", F + "segoeuib.ttf"))
pdfmetrics.registerFont(TTFont("Body-Italic", F + "segoeuii.ttf"))
pdfmetrics.registerFont(TTFont("Mono", F + "consola.ttf"))
pdfmetrics.registerFont(TTFont("Mono-Bold", F + "consolab.ttf"))
from reportlab.pdfbase.pdfmetrics import registerFontFamily
registerFontFamily("Body", normal="Body", bold="Body-Bold", italic="Body-Italic", boldItalic="Body-Bold")

INK = colors.HexColor("#111111")
MUTED = colors.HexColor("#4a4945")
LINE = colors.HexColor("#c9c7c0")
PAPER = colors.HexColor("#f4f3ef")
SAFE = colors.HexColor("#2f7a45")
WATCH = colors.HexColor("#9a7410")
WARN = colors.HexColor("#b4561a")
CRIT = colors.HexColor("#b02a22")

S = {
    "title": ParagraphStyle("title", fontName="Body-Bold", fontSize=34, leading=40, textColor=INK),
    "subtitle": ParagraphStyle("subtitle", fontName="Body", fontSize=15, leading=21, textColor=MUTED),
    "h1": ParagraphStyle("h1", fontName="Body-Bold", fontSize=19, leading=24, textColor=INK, spaceBefore=4, spaceAfter=8),
    "h2": ParagraphStyle("h2", fontName="Body-Bold", fontSize=13, leading=17, textColor=INK, spaceBefore=10, spaceAfter=4),
    "body": ParagraphStyle("body", fontName="Body", fontSize=10.5, leading=15.5, textColor=INK, spaceAfter=6),
    "small": ParagraphStyle("small", fontName="Body", fontSize=9, leading=12.5, textColor=MUTED),
    "cell": ParagraphStyle("cell", fontName="Body", fontSize=9.5, leading=13, textColor=INK),
    "cellb": ParagraphStyle("cellb", fontName="Body-Bold", fontSize=9.5, leading=13, textColor=INK),
    "head": ParagraphStyle("head", fontName="Body-Bold", fontSize=9, leading=12, textColor=colors.white),
    "bullet": ParagraphStyle("bullet", fontName="Body", fontSize=10.5, leading=15, textColor=INK, leftIndent=14, bulletIndent=2, spaceAfter=3),
    "quote": ParagraphStyle("quote", fontName="Body-Bold", fontSize=12, leading=17, textColor=INK, leftIndent=10, borderPadding=(8, 8, 8, 10), backColor=PAPER, spaceBefore=6, spaceAfter=10),
    "caption": ParagraphStyle("caption", fontName="Body", fontSize=8.5, leading=11.5, textColor=MUTED, spaceBefore=3, spaceAfter=10),
    "mono": ParagraphStyle("mono", fontName="Mono", fontSize=9.5, leading=13, textColor=INK, backColor=PAPER, borderPadding=6, spaceBefore=4, spaceAfter=10),
}

W = A4[0] - 36 * mm  # usable width


def P(text, style="body"):
    return Paragraph(text, S[style])


def bullets(items, style="bullet"):
    return [Paragraph(t, S[style], bulletText="\u2022") for t in items]


def numbered(items):
    return [Paragraph(t, S["bullet"], bulletText=f"{i}.") for i, t in enumerate(items, 1)]


def table(rows, widths, header=True, zebra=True):
    data = []
    for r, row in enumerate(rows):
        out = []
        for c, cell in enumerate(row):
            if isinstance(cell, str):
                st = "head" if (header and r == 0) else ("cellb" if c == 0 else "cell")
                out.append(Paragraph(cell, S[st]))
            else:
                out.append(cell)
        data.append(out)
    t = Table(data, colWidths=widths, repeatRows=1 if header else 0)
    style = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOX", (0, 0), (-1, -1), 0.8, INK),
        ("LINEBELOW", (0, 0), (-1, -1), 0.4, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]
    if header:
        style += [("BACKGROUND", (0, 0), (-1, 0), INK)]
    if zebra:
        for r in range(1 if header else 0, len(rows)):
            if r % 2 == 0:
                style.append(("BACKGROUND", (0, r), (-1, r), PAPER))
    t.setStyle(TableStyle(style))
    return t


def shot(name, caption, width=W):
    from reportlab.lib.utils import ImageReader
    ir = ImageReader(IMG + name)
    iw, ih = ir.getSize()
    h = width * ih / iw
    img = Image(IMG + name, width=width, height=h)
    framed = Table([[img]], colWidths=[width])
    framed.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 0.8, INK), ("LEFTPADDING", (0, 0), (-1, -1), 0),
                                ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 0),
                                ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
    return KeepTogether([framed, P(caption, "caption")])


def level_chip(text, color):
    return f'<font name="Mono-Bold" color="{color.hexval().replace("0x", "#")}">{text}</font>'


SAFE_T, WATCH_T, WARN_T, CRIT_T = (level_chip("SAFE", SAFE), level_chip("WATCH", WATCH), level_chip("WARNING", WARN), level_chip("CRITICAL", CRIT))


def on_page(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(INK)
    canvas.setLineWidth(2)
    canvas.line(18 * mm, A4[1] - 14 * mm, A4[0] - 18 * mm, A4[1] - 14 * mm)
    canvas.setFont("Body-Bold", 8.5)
    canvas.setFillColor(INK)
    canvas.drawString(18 * mm, A4[1] - 11.5 * mm, "SENTINEL CROWD")
    canvas.setFont("Body", 8.5)
    canvas.setFillColor(MUTED)
    canvas.drawRightString(A4[0] - 18 * mm, A4[1] - 11.5 * mm, "Project guide for the team")
    canvas.drawRightString(A4[0] - 18 * mm, 10 * mm, f"Page {doc.page}")
    canvas.restoreState()


def on_cover(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(PAPER)
    canvas.rect(0, 0, A4[0], A4[1], stroke=0, fill=1)
    # large checks, like the app background
    canvas.setStrokeColor(colors.HexColor("#dcdad3"))
    canvas.setLineWidth(1.2)
    step = 34 * mm
    x = 0
    while x < A4[0]:
        canvas.line(x, 0, x, A4[1]); x += step
    y = 0
    while y < A4[1]:
        canvas.line(0, y, A4[0], y); y += step
    canvas.setStrokeColor(INK)
    canvas.setLineWidth(4)
    canvas.line(18 * mm, A4[1] - 60 * mm, A4[0] - 18 * mm, A4[1] - 60 * mm)
    canvas.restoreState()


doc = BaseDocTemplate(OUT, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=20 * mm, bottomMargin=16 * mm,
                      title="Sentinel Crowd: Project Guide", author="Sentinel Crowd team")
frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="f")
cover_frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, A4[1] - 66 * mm - doc.bottomMargin, id="c")
doc.addPageTemplates([PageTemplate(id="cover", frames=[cover_frame], onPage=on_cover),
                      PageTemplate(id="page", frames=[frame], onPage=on_page)])

st = []

# ---------------- Cover ----------------
st += [
    P("Sentinel Crowd", "title"), Spacer(1, 6),
    P("AI early warning for crowd crushes using existing CCTV cameras.", "subtitle"), Spacer(1, 18),
    P("Project guide: everything the team needs to understand the project and present it to judges.", "body"),
    Spacer(1, 8),
    table([
        ["Event", "CuriousPARC 2026, Theme 3: Computer Vision, Behaviour Analysis and Scene Understanding"],
        ["What it is", "A web app that watches a camera view, counts people in 12 zones, and warns staff before a crowd becomes dangerous"],
        ["Code", "github.com/ananyac9820/sentinel-crowd"],
        ["Runs on", "Any laptop with Chrome or Edge. No server, no API keys, no special hardware."],
        ["Guide date", "5 October 2026"],
    ], [32 * mm, W - 32 * mm], header=False),
    Spacer(1, 16),
    P("<b>How to read this guide.</b> Sections 1 to 4 explain the idea and how it works. Sections 5 to 8 show every screen and rule. "
      "Sections 9 to 12 cover the technology. Sections 13 and 14 are your presentation script and answers to likely judge questions. "
      "Section 15 lists what is being built next.", "body"),
    NextPageTemplate("page"), PageBreak(),
]

# ---------------- 1. Problem ----------------
st += [
    P("1. The problem", "h1"),
    P("Crowd crushes and stampedes happen again and again at Indian railway stations, temples, melas and festivals. "
      "They rarely start suddenly. Pressure builds over several minutes, usually at a narrow point such as a staircase, a footbridge or a gate. "
      "The people on the ground cannot see it, because each person only sees the few people around them."),
    P("Most of these places already have CCTV cameras. But the cameras are watched by a few people looking at many screens, "
      "and nobody can judge crowd density on twenty screens at once. By the time someone notices, it is often too late to open a gate or stop people entering."),
    P("Problem in one line: the danger is visible on camera minutes before a crush, but nobody is measuring it.", "quote"),
]

# ---------------- 2. Solution ----------------
st += [
    P("2. Our solution", "h1"),
    P("Sentinel Crowd turns an ordinary camera view into a control-room screen. It does four things:"),
    *numbered([
        "<b>Counts people</b> in each part of the camera view. The view is split into a 4 by 3 grid of 12 zones named A1 to C4.",
        "<b>Checks simple, explainable rules</b>: is a zone too full, is it filling too fast, and how many seconds until it becomes dangerous.",
        "<b>Raises plain-English alerts</b> with a clear action, such as \"Open exit gate 2 and halt platform entry now\".",
        "<b>Shows the overall risk</b> as one of four levels: " + SAFE_T + ", " + WATCH_T + ", " + WARN_T + " or " + CRIT_T + ".",
    ]),
    P("One-line pitch: Sentinel Crowd watches how fast each part of a crowd is filling up, warns before it is full, explains why, and tells staff which gate to open, using cameras that are already installed.", "quote"),
]

# ---------------- 3. Novelty ----------------
st += [
    P("3. What makes it new", "h1"),
    P("Detecting and counting people is not new on its own. What is new is what we do with the counts. Use these points when judges ask about novelty."),
    table([
        ["Idea", "What it means", "Why it matters"],
        ["Time-to-critical forecast", "For each busy zone, we measure how fast it is filling and predict how many seconds remain before it reaches crush density. Example: \"B3 critical in about 14 seconds\".", "Turns the system from detecting danger into predicting it. Staff get a countdown, not just an alarm."],
        ["Rate-of-build-up warning", "A surge alert fires when a zone fills quickly, even while it is still below the danger count.", "Crushes form from fast build-up. In our demo, the surge warning fires about 14 seconds before the zone reaches the critical count."],
        ["Explainable alerts", "Every alert has a \"Why this alert\" section showing the exact rule and numbers.", "Police and station staff need to justify actions like closing a gate. A black-box score is hard to trust."],
        ["Action, not just alarm", "Alerts name a specific action: which exit gate to open, which calmer zone to send people towards.", "Turns detection into a decision the operator can act on in seconds."],
        ["Runs on existing cameras, in a browser", "No server, no cloud, no new hardware. The AI model runs on the laptop.", "Low cost makes it realistic for Indian stations, temples and melas."],
        ["Private by design", "Video never leaves the device. No faces are recognised. Only counts are kept.", "Suitable for public spaces and Indian privacy expectations."],
    ], [36 * mm, 70 * mm, W - 106 * mm]),
]

# ---------------- 4. Flow ----------------
flow_rows = [
    ["Step", "What happens", "Where in the code"],
    ["1. Camera", "Video comes from the simulated platform, an uploaded MP4, or a webcam.", "SimulatedFeed.jsx, useLiveDetection.jsx"],
    ["2. Detect people", "In Live mode, the COCO-SSD model finds every person in the frame twice per second (every 500 ms). In Simulation mode, the scripted scenario provides the counts.", "detector.js, simulation.js"],
    ["3. Count per zone", "Each person is placed in one of the 12 zones by the centre of their box.", "useLiveDetection.jsx"],
    ["4. Smooth", "Counts are averaged over the last 1.5 seconds so a missed detection in one frame does not cause a false alarm.", "risk.js"],
    ["5. Check rules", "Density thresholds, surge rule and time-to-critical forecast are checked for every zone.", "risk.js"],
    ["6. Overall risk", "Overall level = the worst zone's level, raised one level if any zone is surging.", "risk.js"],
    ["7. Alert with action", "New alerts are added to the feed with time, zone, severity, message and the reason.", "risk.js, AlertsFeed.jsx"],
    ["8. Operator sees it", "Status bar, camera grid, zone table, alerts and chart all update together.", "Dashboard.jsx and components"],
]
st += [
    P("4. How it works: the flow", "h1"),
    P("Every half second, the app runs this loop. The same loop is used in Simulation mode and Live mode; only step 2 differs."),
    table(flow_rows, [30 * mm, 95 * mm, W - 125 * mm]),
    Spacer(1, 8),
    P("Everything happens inside the browser tab. Nothing is sent to any server.", "quote"),
]

# ---------------- 5. Screens ----------------
st += [
    Spacer(1, 10),
    P("5. The screens", "h1"),
    P("5.1 Landing page", "h2"),
    P("The first page people see. It has the product name, one sentence on what it does, a <b>live preview</b> of the real dashboard running the simulation, "
      "an \"Open dashboard\" button, a short \"How it works\" section in four steps, and links to the Terms and Privacy pages."),
    shot("landing.jpg", "Landing page. The preview on the right is the real dashboard running live, not a picture."),
    P("5.2 The dashboard", "h2"),
    P("This is the main screen for the demo. It is laid out like control-room software: everything important is visible at once."),
    table([
        ["Part", "What it shows"],
        ["Top bar", "Product name, the Simulation / Live detection switch, and the Thresholds button."],
        ["Status bar", "Overall risk level in large letters with a short instruction. Also: <b>Critical in</b> (the forecast countdown), people count, busiest zone, risk score out of 100, and which zones are surging. Tinted at WATCH and WARNING, solid red at CRITICAL."],
        ["Camera panel", "The video with the 4 by 3 zone grid on top. Each zone is tinted by its level and labelled with its name, count, and SURGE or CRIT countdown tags. In Simulation mode it has Pause, speed (1x or 2x) and Restart buttons and a scenario progress bar."],
        ["Zones table", "All 12 zones with their count, a trend arrow (rising, steady, falling over 5 seconds), and the CRIT countdown when one exists."],
        ["Alerts", "Newest first. Each row shows time, severity, zone, a one-line message and a suggested action. Click a row to see \"Why this alert\"."],
        ["Density chart", "The last 2 minutes: people count (grey area, left axis) and risk score (black line, right axis) with a dashed red danger line at 75."],
    ], [30 * mm, W - 30 * mm]),
    PageBreak(),
    P("5.3 How the dashboard looks at each risk level", "h2"),
    shot("safe.jpg", "SAFE: normal evening flow. All zones green or neutral, no alerts."),
    shot("warning.jpg", "WARNING: zone B3 near the staircase is filling fast. The status bar shows \"Critical in B3 ~15s\" and the forecast alert has fired."),
    PageBreak(),
    shot("critical.jpg", "CRITICAL: the status bar turns solid red and the page border turns red. One alert is opened to show its \"Why this alert\" explanation."),
    P("5.4 Live detection screen", "h2"),
    shot("live.jpg", "Live detection mode after the AI model has loaded. The operator uploads a CCTV clip or turns on the webcam. The grey blocks are a loading placeholder for the chart until data arrives."),
    PageBreak(),
    P("5.5 Thresholds panel", "h2"),
    shot("thresholds.jpg", "Thresholds panel. Staff can change every limit. Simulation and Live mode have separate settings because a real detector counts fewer people per frame."),
    P("5.6 Other pages", "h2"),
    *bullets([
        "<b>Privacy page</b>: explains that video never leaves the device, no faces are recognised, and nothing is stored.",
        "<b>Terms page</b>: explains that this is a prototype, not a certified safety system, and that staff remain responsible for decisions.",
        "<b>Error screen</b>: if anything ever crashes, a \"Reload dashboard\" message appears instead of a blank page.",
    ]),
]

# ---------------- 6. Modes ----------------
st += [
    PageBreak(),
    P("6. The two modes", "h1"),
    P("6.1 Simulation mode (default, use this on stage)", "h2"),
    P("A scripted 90-second scenario on Platform 2 of a busy junction. It needs no camera and no internet, and it runs exactly the same way every time, "
      "so the demo cannot fail. Pressing R restarts it from SAFE."),
    table([
        ["Time", "What happens on screen"],
        ["0:00", "Normal evening flow. Everything " + SAFE_T + "."],
        ["0:18", "Train delay announced. The whole platform slowly fills."],
        ["0:37", "Zone B3, next to the staircase, passes 8 people. First alert, level " + WATCH_T + "."],
        ["0:39", "Surge alert: \"Zone B3 density rising fast\". Overall risk jumps to " + WARN_T + "."],
        ["0:40", "Forecast alert: \"Zone B3 on course to reach crush density in about 25s\". The countdown starts."],
        ["0:45", "Overall risk becomes " + CRIT_T + ". Status bar turns red. Site-wide alert tells staff to open gate 2."],
        ["0:53", "B3 actually crosses the critical count of 18 people, about 14 seconds after the first early warning."],
        ["1:06", "Intervention: station control opens exit gate 2 and pauses entry."],
        ["1:18 to 1:26", "Crowd disperses. Risk eases to WARNING, then WATCH, then " + SAFE_T + "."],
    ], [26 * mm, W - 26 * mm]),
    Spacer(1, 6),
    P("6.2 Live detection mode", "h2"),
    *numbered([
        "Click <b>Live detection</b> in the top bar.",
        "The first time, the browser downloads the AI model (about 67 MB, 15 to 30 seconds). It is then saved on the laptop, so later it loads in a few seconds even without internet.",
        "When it says \"AI model ready\", click <b>Upload MP4</b> to choose a video, or <b>Use webcam</b>.",
        "Twice per second, every person is outlined, counted into a zone, and the same rules and alerts run on the real counts.",
    ]),
    P("Tips: high-angle CCTV-style clips work best. Four sample clips of Indian railway platforms and stairs are in the <font name=\"Mono\">demo-videos</font> folder on the laptop. "
      "The webcam view is mirrored like a video call. Webcams only work on https or localhost. To connect a real CCTV camera today, use OBS Studio's Virtual Camera "
      "or a phone webcam app such as DroidCam so it appears as a webcam."),
]

# ---------------- 7. Rules ----------------
st += [
    PageBreak(),
    P("7. The risk rules in detail", "h1"),
    P("All rules are deliberately simple so they can be explained to anyone in one sentence."),
    table([
        ["Rule", "What it checks", "Default (Simulation / Live)"],
        ["Density levels", "People in a zone compared to three limits. Below WATCH is SAFE.", "WATCH 8 / 3, WARNING 13 / 5, CRITICAL 18 / 8 people"],
        ["Surge (rapid build-up)", "Count rose by at least a percentage AND at least a number of people within a time window, and is still rising.", "+35% and +4 people in 20 s / +50% and +2 people in 20 s"],
        ["Forecast (time to critical)", "Fits a straight line to the zone's count over the last 10 seconds, then projects when it crosses CRITICAL. Only for zones at WATCH or above that are still rising.", "Shown if under 60 s. Alert if under 25 s."],
        ["Overall risk", "The worst zone's level, raised one level while any zone is surging.", "Same in both modes"],
        ["Risk score (0 to 100)", "75 means a zone is exactly at the CRITICAL limit. +10 while a surge is active. This is the black line on the chart.", "Same in both modes"],
    ], [36 * mm, 82 * mm, W - 118 * mm]),
    Spacer(1, 6),
    P("Protections against false alarms", "h2"),
    *bullets([
        "Counts are averaged over 1.5 seconds, so a person missed in one frame does not cause a false alert.",
        "The same zone cannot repeat the same alert type too often (3 s for level alerts, 30 s for surge and forecast alerts).",
        "A zone that is already emptying out is never called a surge, even if it is fuller than 20 seconds ago.",
        "The overall level must stay lower for 3 seconds before it is lowered, so it does not flicker between levels.",
    ]),
    P("Which gate does it suggest?", "h2"),
    P("Exit gates are along the bottom edge of the platform: Gate 1 under column 1, Gate 2 under columns 2 and 3 (next to the staircase), Gate 3 under column 4. "
      "WARNING alerts suggest moving people towards the calmest neighbouring zone."),
]

# ---------------- 8. Tech stack ----------------
st += [
    P("8. Technology used", "h1"),
    table([
        ["Tool", "What we used it for", "Why we chose it"],
        ["React 19", "Building the user interface as reusable components", "Fast to build, widely known"],
        ["Vite 8", "Development server and production build", "Very fast; outputs a simple static website"],
        ["Tailwind CSS 4", "Styling, layout and the colour theme", "Quick, consistent design"],
        ["TensorFlow.js 4", "Runs the AI model inside the browser using the laptop's graphics card (WebGL)", "No server needed; video stays on the device"],
        ["COCO-SSD (MobileNet v2)", "Pre-trained model that finds people in each video frame", "Free, well-tested, works in real time on a laptop"],
        ["Recharts 3", "The 2-minute density chart", "Simple React charts"],
        ["HTML Canvas", "Drawing the animated simulated platform with moving people", "Smooth animation with no video file"],
        ["IndexedDB (browser storage)", "Saving the AI model after the first download", "Works offline on demo day"],
        ["IBM Plex Sans and Mono", "Fonts for text and numbers", "Readable control-room look"],
        ["GitHub, Vercel or Netlify", "Code hosting and free website hosting", "One-click deploy"],
    ], [38 * mm, 74 * mm, W - 112 * mm]),
    P("Language: JavaScript (React JSX). There is no backend, no database and no API key.", "small"),
]

# ---------------- 9. Code structure ----------------
st += [
    PageBreak(),
    P("9. How the code is organised", "h1"),
    table([
        ["File", "What it does"],
        ["src/lib/risk.js", "The brain: smoothing, density levels, surge rule, forecast, overall risk, alert messages and explanations."],
        ["src/lib/simulation.js", "The scripted 90-second platform scenario and the gate-2 intervention."],
        ["src/lib/detector.js", "Loads the COCO-SSD model and saves it in the browser for offline use."],
        ["src/hooks/useLiveDetection.jsx", "Live mode: upload or webcam, the twice-per-second detection loop, loading and error screens."],
        ["src/components/Dashboard.jsx", "Puts the dashboard together, runs the simulation clock and keyboard shortcuts."],
        ["src/components/StatusCard.jsx", "The status bar at the top."],
        ["src/components/CameraPanel.jsx, ZoneGrid.jsx, SimulatedFeed.jsx", "Camera view, zone overlay and the animated platform."],
        ["src/components/ZoneTable.jsx, AlertsFeed.jsx, DensityChart.jsx", "Zones table, alerts list and chart."],
        ["src/components/SettingsPanel.jsx", "Thresholds panel."],
        ["src/components/Landing.jsx, LegalPage.jsx", "Landing page with live preview; Terms and Privacy pages."],
    ], [62 * mm, W - 62 * mm]),
    Spacer(1, 6),
    P("10. Privacy and safety", "h1"),
    *bullets([
        "All processing happens on the laptop inside the browser. Video files and camera streams are never uploaded.",
        "The model only draws boxes around people. It does not recognise faces, estimate age or gender, or track who someone is.",
        "Nothing is stored except the public AI model files in the browser cache. Alerts disappear when the page is reloaded.",
        "The app is a decision-support tool. Staff and authorities stay responsible for every action.",
    ]),
    P("11. Honest limitations", "h1"),
    *bullets([
        "The general-purpose detector undercounts in very dense crowds, where people hide behind each other. A production version would use a dedicated crowd-density model trained on Indian crowd footage.",
        "Camera angle matters. Overhead or high-angle views work best; face-level phone videos work poorly.",
        "Real CCTV cameras usually stream in a format browsers cannot open directly (RTSP). Today we connect them through OBS Virtual Camera; a production version would add a small relay server.",
        "The forecast is a straight-line projection. When a crowd speeds up, the real time to critical can be shorter than predicted, so it is a warning, not a guarantee.",
        "The Simulation scenario is scripted and fictional.",
    ]),
]

# ---------------- 12. Run & deploy ----------------
st += [
    PageBreak(),
    P("12. How to run and deploy", "h1"),
    P("Run on the laptop", "h2"),
    P("npm install<br/>npm run dev", "mono"),
    P("Then open http://localhost:5173 in Chrome or Edge. Stop it with Ctrl+C in the terminal."),
    P("Keyboard shortcuts", "h2"),
    table([["Key", "Action"], ["Space", "Pause or play"], ["R", "Restart the scenario from SAFE"], ["F", "Fullscreen"]], [30 * mm, W - 30 * mm]),
    P("Deploy on Vercel (free)", "h2"),
    *numbered([
        "Sign in to vercel.com with GitHub. Choose Add New, then Project.",
        "Import the sentinel-crowd repository. Keep the detected Vite settings (build command npm run build, output folder dist).",
        "Click Deploy. You get an https link, so the webcam works there too.",
        "Before demo day, open Live detection once on that exact link and browser, so the 67 MB model is already saved.",
    ]),
]

# ---------------- 13. Demo script ----------------
st += [
    P("13. 60-second demo script", "h1"),
    table([
        ["Time", "Say this", "Do this"],
        ["0 to 10 s", "\"Stampedes at Indian stations and temples happen because nobody sees the danger building. Sentinel Crowd watches existing CCTV and warns before the crush.\"", "Show the landing page, click Open dashboard, press F."],
        ["10 to 25 s", "\"This is Platform 2 at rush hour. The camera view is split into 12 zones. Each zone is counted and coloured green, yellow, orange or red.\"", "Point at the zone grid and status bar."],
        ["25 to 40 s", "\"Watch B3 by the staircase. It is filling fast, so we warn early, and we forecast it: B3 will reach crush density in about 15 seconds.\"", "Point at the surge alert and the Critical in countdown."],
        ["40 to 50 s", "\"Critical. The system tells the operator exactly what to do: open gate 2 and stop entry. Click any alert to see why it fired.\"", "Click the top alert to open Why this alert."],
        ["50 to 60 s", "\"Gate 2 opens and the risk returns to safe. In Live mode, the same logic runs on real video, entirely in the browser, with no faces recognised.\"", "Switch to Live detection and show the model ready screen."],
    ], [22 * mm, 100 * mm, W - 122 * mm]),
]

# ---------------- 14. Q&A ----------------
qa = [
    ("Is person detection your innovation?", "No. Detection is a standard building block. Our contribution is the early warning layer: rate-of-build-up alerts, a time-to-critical forecast, explainable rules and specific actions."),
    ("How accurate is it?", "The general model undercounts in very dense crowds, which we state openly. The rules use trends and relative changes, which still work when counts are low. A production version would swap in a crowd-density model; the rest of the system stays the same."),
    ("Why not use a deep model for risk instead of rules?", "Operators must trust and justify their actions. Simple rules with a written reason are auditable. Thresholds can be tuned per site."),
    ("How does the forecast work?", "It fits a straight line to the zone's count over the last 10 seconds and calculates when that line crosses the critical limit. It only runs for zones that are already busy and still rising."),
    ("Can it work with real CCTV?", "Yes, through OBS Virtual Camera today. For a full deployment, a small relay converts camera streams for the browser, and one laptop can watch several cameras."),
    ("What about privacy?", "Video never leaves the device, no faces are recognised, and only counts are used. No data is stored."),
    ("What does it cost?", "It runs on an ordinary laptop in a browser, with free open-source software, using cameras that are already installed."),
    ("What happens if the internet fails?", "Simulation mode needs no internet. Live mode only needs internet once to download the model; after that it is cached on the laptop."),
]
st += [
    PageBreak(),
    P("14. Questions judges may ask", "h1"),
    table([["Question", "Short answer"]] + [[q, a] for q, a in qa], [52 * mm, W - 52 * mm]),
]

# ---------------- 15. Next ----------------
st += [
    P("15. Coming next (being built now)", "h1"),
    P("These features are planned and in progress. Do not present them as finished until they appear in the app.", "small"),
    Spacer(1, 4),
    table([
        ["Feature", "What it adds"],
        ["Crowd turbulence index", "Measures how chaotic and jerky the crowd's movement is. Research on crowd disasters links chaotic movement in dense crowds to the start of crushes."],
        ["Flow direction and counter-flow", "Arrows showing which way each zone moves, and an alert when people move against each other, for example at a staircase."],
        ["Tabs", "Monitor, Zones, Timeline and Setup tabs, so each screen stays uncluttered."],
        ["What-if buttons", "Open gate, pause entry or announce delay during the simulation, and watch the risk respond."],
        ["Station map", "Several cameras shown on one map of the station."],
        ["Incident report, alarm and SMS", "Download a timeline of alerts and actions, a sound at CRITICAL, and a mock SMS panel to the station master."],
        ["Draw your own zones", "Name real places such as Staircase or Gate 2 instead of a fixed grid."],
    ], [48 * mm, W - 48 * mm]),
]

doc.build(st)
print("written", OUT)
