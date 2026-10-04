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
        ["What it is", "A web app that watches a camera view, counts people zone by zone, reads how the crowd is moving, and warns staff before it becomes dangerous"],
        ["Code", "github.com/ananyac9820/sentinel-crowd"],
        ["Runs on", "Any laptop with Chrome or Edge. No server, no API keys, no special hardware."],
        ["Guide date", "5 October 2026"],
    ], [32 * mm, W - 32 * mm], header=False),
    Spacer(1, 16),
    P("<b>How to read this guide.</b> Sections 1 to 4 explain the idea, what is new about it, and how it works. "
      "Sections 5 to 8 walk through every screen, the two modes and every rule. Sections 9 to 13 cover the technology, privacy and limits. "
      "Sections 14 and 15 are your presentation script and answers to likely judge questions.", "body"),
    NextPageTemplate("page"), PageBreak(),
]

# ---------------- 1. Problem ----------------
st += [
    P("1. The problem", "h1"),
    P("Crowd crushes and stampedes happen again and again at Indian railway stations, temples, melas and festivals. "
      "They rarely start suddenly. Pressure builds over several minutes, usually at a narrow point such as a staircase, a footbridge or a gate. "
      "The people on the ground cannot see it, because each person only sees the few people around them."),
    P("Most of these places already have CCTV cameras. But a few people watch many screens, and nobody can judge crowd density "
      "and movement on twenty screens at once. By the time someone notices, it is often too late to open a gate or stop people entering."),
    P("Problem in one line: the danger is visible on camera minutes before a crush, but nobody is measuring it.", "quote"),
]

# ---------------- 2. Solution ----------------
st += [
    P("2. Our solution", "h1"),
    P("Sentinel Crowd turns an ordinary camera view into a control-room screen. It does five things:"),
    *numbered([
        "<b>Counts people</b> in each zone of the camera view. Zones are a 4 by 3 grid (A1 to C4) by default, or named areas that staff draw themselves, such as \"Staircase\".",
        "<b>Reads how the crowd moves</b>: the direction of flow in each zone, people moving against each other (counter-flow), and chaotic pushing (turbulence).",
        "<b>Predicts</b> how many seconds remain before a filling zone reaches crush density.",
        "<b>Raises plain-English alerts</b> with a clear action, such as \"Open exit gate 2 and halt platform entry now\", and explains which rule fired.",
        "<b>Lets staff try an action</b> in the simulation and see on a station map where the crowd goes next.",
    ]),
    P("One-line pitch: Sentinel Crowd reads the crowd, not just the count. It warns before a zone is full, predicts when it will become dangerous, explains why, and tells staff which gate to open, using cameras that are already installed.", "quote"),
]

# ---------------- 3. Novelty ----------------
st += [
    P("3. What makes it new", "h1"),
    P("Detecting and counting people is not new on its own. What is new is what we do with the detections. Use these points when judges ask about novelty."),
    table([
        ["Idea", "What it means", "Why it matters"],
        ["Crowd turbulence index", "Crowd pressure = density multiplied by how unevenly people move. This idea comes from research on real crowd disasters (Helbing and colleagues, 2007).", "Chaotic pushing in a dense crowd is a recognised sign that a crush is starting. Most tools only count heads."],
        ["Counter-flow detection", "Finds two streams of people moving opposite ways along the same line, for example up and down a staircase.", "Opposing flows at stairs and gates are a common trigger of crushes."],
        ["Time-to-critical forecast", "Projects each busy zone's growth to show a countdown: \"B3 critical in about 14 seconds\".", "Turns detection into prediction. Staff get time to act."],
        ["Measured early-warning lead time", "The app records how many seconds before a zone reached CRITICAL the first warning fired. In our scenario: 14 seconds.", "Proves the early warning actually comes early, with a number."],
        ["What-if interventions and station map", "Operators can open a gate, pause entry or redirect people, and see the crowd respond and move to other areas on a 4-camera station map.", "Shows that actions move risk rather than remove it, for example pausing entry fills the concourse."],
        ["Explainable, actionable alerts", "Every alert says which rule fired with its numbers, and names a specific action and exit gate.", "Police and station staff must be able to justify closing a gate."],
        ["Private and low-cost", "Runs in a browser on existing cameras. Video never leaves the laptop. No faces recognised.", "Realistic for Indian stations, temples and melas."],
    ], [38 * mm, 70 * mm, W - 108 * mm]),
]

# ---------------- 4. Flow ----------------
st += [
    Spacer(1, 10),
    P("4. How it works: the flow", "h1"),
    P("Every half second, the app runs this loop. Simulation mode and Live mode share the same loop; only steps 1 to 3 differ."),
    table([
        ["Step", "What happens", "Where in the code"],
        ["1. Camera", "Video comes from the simulated platform, an uploaded MP4, or a webcam.", "SimulatedFeed.jsx, useLiveDetection.jsx"],
        ["2. Detect people", "Live: the COCO-SSD model finds every person twice per second. Simulation: the scripted scenario provides counts and movement.", "detector.js, simulation.js"],
        ["3. Track movement", "Live: each person is matched to where they were half a second ago, giving a speed and direction. Tracks are anonymous and last a few seconds.", "tracker.js"],
        ["4. Count per zone", "People and their movement are grouped into zones by position.", "zones.js"],
        ["5. Smooth", "Counts are averaged (1.5 s in Simulation, 3 s in Live) so flicker does not cause false alarms.", "risk.js"],
        ["6. Check rules", "Density, surge, forecast, turbulence and counter-flow for every zone.", "risk.js"],
        ["7. Overall risk", "Worst zone's level, raised one level if any zone has a surge, turbulence or counter-flow.", "risk.js"],
        ["8. Alert and notify", "New alerts appear with time, zone, severity, message and reason. Serious alerts sound an alarm and send a simulated SMS.", "risk.js, alarm.js, Dashboard.jsx"],
    ], [30 * mm, 95 * mm, W - 125 * mm]),
    Spacer(1, 6),
    P("Everything happens inside the browser tab. Nothing is sent to any server.", "quote"),
]

# ---------------- 5. Screens ----------------
st += [
    PageBreak(),
    P("5. The screens", "h1"),
    P("5.1 Landing page", "h2"),
    P("Product name, one sentence, a <b>live preview</b> of the real dashboard running the simulation, an \"Open dashboard\" button, "
      "\"How it works\" in four steps, and links to the Terms and Privacy pages."),
    shot("landing.png", "Landing page. The preview is the real dashboard running live, not a picture."),
    P("5.2 Layout of the dashboard", "h2"),
    P("A top bar with five tabs and the Simulation / Live switch, then a status bar that is visible on every tab, so a CRITICAL is never hidden."),
    table([
        ["Part", "What it shows"],
        ["Status bar", "Overall risk in large letters with a short instruction, then: <b>Critical in</b> (forecast countdown), people, busiest zone, risk score out of 100, zones with a surge, and zones with turbulence or counter-flow (Motion). Tinted at WATCH and WARNING, solid red at CRITICAL, with a red page border."],
        ["Monitor tab", "Camera view with zone grid and movement arrows, scenario progress, what-if buttons, a small 2-minute chart, and the alerts list."],
        ["Station tab", "Map of four cameras coloured by risk, with arrows for where actions send people."],
        ["Zones tab", "Zone map and a table with count, level, trend, forecast, turbulence, counter-flow, direction and exit gate for every zone."],
        ["Timeline tab", "Full chart with turbulence, early-warning lead time and run summary, alert history with filters, incident report, CSV exports, and SMS log."],
        ["Setup tab", "Alert thresholds, notification settings (alarm sound, simulated SMS), and the zone editor."],
        ["Shortcuts", "Space pause or play, R restart, F fullscreen, 1 to 5 switch tabs. Sound on or off is in the top bar."],
    ], [30 * mm, W - 30 * mm]),
    PageBreak(),
    P("5.3 Monitor tab at each risk level", "h2"),
    shot("safe.png", "SAFE: normal evening flow. Arrows show everyone drifting toward the staircase."),
    shot("warning.png", "WARNING at 0:42: B3 next to the staircase is filling fast. The status bar shows \"Critical in B3 ~15s\" and the forecast alert has fired."),
    PageBreak(),
    shot("critical.png", "CRITICAL at 0:56: solid red status bar and border. Red double arrows in B3 and C3 show counter-flow; B3 shows turbulence 100. Alerts include crowd turbulence and counter-flow."),
    P("Reading the camera view", "h2"),
    *bullets([
        "<b>Zone colour</b>: green or none = SAFE, yellow = WATCH, orange = WARNING, red = CRITICAL.",
        "<b>Label</b>: zone name, people count, and a tag: <b>CRIT ~14s</b> (forecast), <b>TURB 94</b> (turbulence) or <b>SURGE</b>.",
        "<b>Black arrow</b>: the direction people in that zone are moving. Longer means faster.",
        "<b>Red double arrow</b>: counter-flow, people moving both ways.",
    ]),
    PageBreak(),
    P("5.4 What-if actions and the station map", "h2"),
    P("In Simulation mode, the What if bar has three actions: <b>Open exit gate 2</b>, <b>Pause entry</b> and <b>Redirect to Platform 3</b>. "
      "Press one at any time and the crowd responds from that moment. The Station tab shows where the people went."),
    shot("whatif.png", "Pause entry and Redirect pressed at 0:47. B3 never reaches crush density; risk falls to WATCH by 1:05."),
    shot("station.png", "Station map at the same moment: the concourse rises to WATCH because people are held outside, and an arrow shows people moving to Platform 3."),
    PageBreak(),
    P("5.5 Zones tab", "h2"),
    shot("zones.png", "Zones tab: every zone's numbers in one table. Bars show turbulence and counter-flow on a 0 to 100 scale; the tick marks the alert level."),
    P("5.6 Timeline tab and incident report", "h2"),
    shot("timeline.png", "Timeline tab: full chart with the turbulence line, early-warning lead time (14 s), time at each level, alert history with filters and the notification log."),
    PageBreak(),
    shot("report.png", "Incident report: summary (highest risk, time at each level, peak people, lead time, actions) and the full alert log with reasons. Use the browser's Save as PDF to keep it.", width=W * 0.78),
    PageBreak(),
    P("5.7 Setup tab and custom zones", "h2"),
    shot("thresholds.png", "Setup tab: thresholds on the left (separate for Simulation and Live), notifications below, and the zone editor on the right."),
    shot("custom-zones.png", "After pressing Station preset and Apply zones: named zones such as Stair approach and Staircase. Limits scale with zone size, and alerts use the names."),
    PageBreak(),
    P("5.8 Live detection on real footage", "h2"),
    shot("live.png", "Live detection on a rush-hour station clip. Each detected person has a box; counts and movement feed the same rules. Very dense crowds are undercounted, which we state openly."),
    P("Other pages", "h2"),
    *bullets([
        "<b>Privacy page</b>: video never leaves the device, no faces are recognised, people are followed only anonymously for a few seconds to measure movement, and nothing is stored.",
        "<b>Terms page</b>: a prototype, not a certified safety system; staff remain responsible for decisions.",
        "<b>Error screen</b>: if anything ever crashes, a \"Reload dashboard\" message appears instead of a blank page.",
    ]),
]

# ---------------- 6. Modes ----------------
st += [
    PageBreak(),
    P("6. The two modes", "h1"),
    P("6.1 Simulation mode (default, use this on stage)", "h2"),
    P("A scripted 90-second scenario on Platform 2 of a busy junction. It needs no camera and no internet, and runs exactly the same way every time. "
      "Press R to restart from SAFE. With \"Auto response\" ticked, Gate 2 opens by itself at 1:06."),
    table([
        ["Time", "What happens on screen"],
        ["0:00", "Normal evening flow. Everything " + SAFE_T + "."],
        ["0:18", "Train delay announced. The platform slowly fills."],
        ["0:37", "B3, next to the staircase, passes 8 people. Level " + WATCH_T + "."],
        ["0:39", "Surge alert: \"Zone B3 density rising fast\". Overall risk jumps to " + WARN_T + "."],
        ["0:40", "Forecast alert: B3 on course to reach crush density in about 20 to 25 seconds. Countdown starts."],
        ["0:45", "Overall " + CRIT_T + ". Status bar turns red."],
        ["0:46", "A train arrives and passengers push up the stairs against the crowd."],
        ["0:49 to 0:51", "Crowd turbulence alert in B3, then counter-flow alerts in B3 and C3 (red double arrows)."],
        ["0:53", "B3 actually reaches the critical count of 18, 14 seconds after the first early warning."],
        ["1:06", "Auto response: Gate 2 opens. (Or press a what-if button earlier and see a different outcome.)"],
        ["1:14 to 1:26", "Crowd disperses. Risk eases to WATCH, then " + SAFE_T + "."],
    ], [26 * mm, W - 26 * mm]),
    P("What-if results you can show", "h2"),
    table([
        ["Action at about 0:47", "What happens"],
        ["Nothing (untick Auto response)", "B3 keeps rising past 25 people and stays CRITICAL."],
        ["Open exit gate 2", "Platform empties quickly through gate 2; the footbridge gets busier for a while."],
        ["Pause entry", "B3 never reaches crush density, but the concourse fills to WATCH: risk moves outside."],
        ["Redirect to Platform 3", "B3 peaks lower; Platform 3 gets busier."],
    ], [52 * mm, W - 52 * mm]),
    P("6.2 Live detection mode", "h2"),
    *numbered([
        "Click <b>Live detection</b> in the top bar.",
        "The first time, the browser downloads the AI model (about 67 MB, 15 to 45 seconds). It is then saved on the laptop, so later it loads in seconds even without internet.",
        "When it says \"AI model ready\", click <b>Upload MP4</b> or <b>Use webcam</b>. Choosing a new camera starts a fresh analysis.",
        "Twice per second, every person is boxed, tracked for movement, counted into a zone, and the same rules run on the real data.",
    ]),
    P("Tips: high-angle CCTV-style clips work best. Sample clips are in the <font name=\"Mono\">demo-videos</font> folder on the laptop "
      "(the Indian platform and rush-hour clips work well; the stairs clip is a close-up and is not useful). The webcam view is mirrored like a video call. "
      "Webcams only work on https or localhost. To connect a real CCTV camera today, use OBS Studio's Virtual Camera or a phone webcam app such as DroidCam."),
]

# ---------------- 7. Rules ----------------
st += [
    Spacer(1, 10),
    P("7. The risk rules in detail", "h1"),
    P("All rules are deliberately simple so they can be explained to anyone in one sentence. Defaults are shown for Simulation / Live."),
    table([
        ["Rule", "What it checks", "Default (Simulation / Live)"],
        ["Density levels", "People in a zone compared with three limits. Limits are for a standard grid cell and scale with zone size, so this is really density.", "WATCH 8 / 3, WARNING 13 / 5, CRITICAL 18 / 8 people"],
        ["Surge", "Count rose by at least a percentage AND at least a number of people within a time window, and is still rising.", "+35% and +4 people in 20 s / +50% and +2 people in 20 s"],
        ["Forecast", "Straight line fitted to the zone's count over the last 10 s, projected to the CRITICAL limit. Only for zones at WATCH or above that are still rising.", "Shown if under 60 s; alert if under 25 s"],
        ["Turbulence", "Crowd pressure = (people / CRITICAL limit) x (movement spread / reference spread) squared, shown on a 0 to 100 scale. Movement spread is how differently people in the zone are moving.", "Alert at 60 or more, held for 1.5 s, zone at WATCH or above"],
        ["Counter-flow", "Find the main line of movement; if people move both ways along it, the index rises toward 100 (equal streams). Random jostling scores 0.", "Alert at 55 or more, held for 1.5 s, zone at WATCH or above"],
        ["Overall risk", "Worst zone's level, raised one level while any zone has a surge, turbulence or counter-flow.", "Same in both modes"],
        ["Risk score", "0 to 100. 75 means a zone is at its CRITICAL limit. +10 while a surge, turbulence or counter-flow is active.", "Same in both modes"],
        ["Lead time", "Seconds between a zone's first early warning (surge, forecast, turbulence, counter-flow) and the moment it reached CRITICAL.", "Shown in the Timeline tab and report"],
    ], [30 * mm, 92 * mm, W - 122 * mm]),
    Spacer(1, 6),
    P("Protections against false alarms", "h2"),
    *bullets([
        "Counts are averaged over 1.5 s (Simulation) or 3 s (Live).",
        "A zone must drop at least one whole person below a limit before the same alert can fire again, and the same level never repeats within 30 s.",
        "Surge, forecast, turbulence and counter-flow alerts have a 30 s cooldown per zone. A zone that is emptying out is never called a surge.",
        "In Live mode, people only report movement after being tracked in three consecutive frames, and small movement jitter (0.02 frame heights per second) is ignored.",
        "The overall level must stay lower for 3 s before it is lowered, so it does not flicker.",
    ]),
]

# ---------------- 8. Tech ----------------
st += [
    PageBreak(),
    P("8. Technology used", "h1"),
    table([
        ["Tool", "What we used it for", "Why we chose it"],
        ["React 19", "The user interface, built from components", "Fast to build, widely known"],
        ["Vite 8", "Development server and production build", "Very fast; outputs a simple static website"],
        ["Tailwind CSS 4", "Styling and the paper control-room theme", "Quick, consistent design"],
        ["TensorFlow.js 4", "Runs the AI model in the browser using the graphics card (WebGL)", "No server needed; video stays on the device"],
        ["COCO-SSD (MobileNet v2)", "Pre-trained model that finds people in each frame", "Free, well-tested, real time on a laptop"],
        ["Our own tracker", "Matches people between frames to measure speed and direction (tracker.js)", "Small, anonymous, no extra model"],
        ["Recharts 3", "Density and risk charts", "Simple React charts"],
        ["HTML Canvas and SVG", "Animated simulated platform, flow arrows, station map", "Smooth graphics with no video files"],
        ["Web Audio API", "Alarm tones", "No sound files needed"],
        ["IndexedDB (browser storage)", "Saves the AI model after first download", "Works offline on demo day"],
        ["GitHub, Vercel or Netlify", "Code hosting and free website hosting", "One-click deploy"],
    ], [38 * mm, 74 * mm, W - 112 * mm]),
    P("Language: JavaScript (React JSX). There is no backend, no database and no API key.", "small"),
    P("9. How the code is organised", "h1"),
    table([
        ["File", "What it does"],
        ["src/lib/risk.js", "The brain: smoothing, density levels, surge, forecast, turbulence, counter-flow, overall risk, lead time, alert messages and reasons."],
        ["src/lib/zones.js", "Zone layouts (grid and custom), exit gates, neighbours, grouping people into zones, the counter-flow measure."],
        ["src/lib/tracker.js", "Live mode person tracker for speed and direction."],
        ["src/lib/simulation.js", "The scripted scenario, motion script, what-if actions, and the other three station cameras."],
        ["src/lib/detector.js", "Loads COCO-SSD and saves it in the browser for offline use."],
        ["src/lib/report.js, alarm.js", "Incident report, CSV exports; alarm tones."],
        ["src/hooks/useLiveDetection.jsx", "Upload or webcam, the twice-per-second detection loop, loading and error screens."],
        ["src/components/Dashboard.jsx", "Tabs, simulation clock, interventions, notifications and keyboard shortcuts."],
        ["Other components", "StatusCard, CameraPanel, ZoneGrid, SimulatedFeed, AlertsFeed, DensityChart, ZoneTable, StationMap, TimelineView, SettingsPanel, ZoneEditor, Landing, LegalPage."],
    ], [56 * mm, W - 56 * mm]),
]

# ---------------- 10-12 ----------------
st += [
    Spacer(1, 10),
    P("10. Privacy and safety", "h1"),
    *bullets([
        "All processing happens on the laptop inside the browser. Video files and camera streams are never uploaded.",
        "The model only draws boxes around people. It does not recognise faces or estimate age or gender.",
        "To measure movement, each box is followed for a few seconds using only its position on screen. These tracks have no identity and are discarded straight away.",
        "Nothing is stored except the public AI model files in the browser cache. Alerts disappear when the page is reloaded. SMS messages are simulated and never sent.",
        "The app supports decisions. Staff and authorities remain responsible for every action.",
    ]),
    P("11. Honest limitations", "h1"),
    *bullets([
        "The general-purpose detector undercounts very dense crowds, where people hide behind each other. A production version would use a crowd-density model trained on Indian footage.",
        "Movement is estimated from detections twice per second, so speeds and directions are approximate, and tracking gets harder in very packed scenes.",
        "Camera angle matters. Overhead or high-angle views work best.",
        "Real CCTV cameras usually stream in a format browsers cannot open (RTSP). Today we connect them through OBS Virtual Camera; a production version would add a small relay server.",
        "The forecast is a straight-line projection. When a crowd speeds up, the real time can be shorter than predicted.",
        "The Simulation scenario, other station cameras and SMS messages are scripted or simulated.",
    ]),
    P("12. How to run and deploy", "h1"),
    P("npm install<br/>npm run dev", "mono"),
    P("Then open http://localhost:5173 in Chrome or Edge. Stop it with Ctrl+C. To deploy on Vercel: sign in with GitHub, Add New, Project, "
      "import sentinel-crowd, keep the Vite settings, Deploy. Open Live detection once on the deployed link before demo day so the model is saved there."),
    P("13. What we would build next", "h1"),
    *bullets([
        "A crowd-density model trained on Indian stations and festivals, for accurate counts in packed crowds.",
        "A small relay server to connect many real CCTV cameras directly, with one dashboard for a whole station.",
        "Real SMS and wireless alerts to staff, and integration with station announcement systems.",
        "Learning normal patterns for each station and time of day, to flag unusual build-ups earlier.",
    ]),
]

# ---------------- 14. Demo script ----------------
st += [
    PageBreak(),
    P("14. Demo script (about 90 seconds)", "h1"),
    P("Press R first so the scenario starts from SAFE. Use 1x speed. Keep Sound on so judges hear the alarm.", "small"),
    Spacer(1, 4),
    table([
        ["Time", "Say this", "Do this"],
        ["0 to 10 s", "\"Stampedes at Indian stations and temples happen because nobody sees the danger building. Sentinel Crowd watches existing CCTV and warns before the crush.\"", "Landing page, then Open dashboard, press F."],
        ["10 to 25 s", "\"This is Platform 2 at rush hour. Each zone is counted, and the arrows show which way people are moving.\"", "Point at the zone grid and arrows."],
        ["25 to 40 s", "\"B3 by the staircase is filling fast. We warn early and forecast it: crush density in about 15 seconds.\"", "Point at the surge alert and Critical in countdown."],
        ["40 to 55 s", "\"A train arrives and people push up the stairs against the crowd. We detect that counter-flow, and the turbulence: chaotic pushing that research links to crushes. Every alert explains why.\"", "Point at the red double arrows and TURB tag; click one alert."],
        ["55 to 70 s", "\"The operator can act. If we pause entry, the platform recovers, but the station map shows the concourse filling. Risk moves; it doesn't disappear.\"", "Press Pause entry; press 2 for the Station tab."],
        ["70 to 90 s", "\"Afterwards, the incident report shows we warned 14 seconds before the zone became critical. And in Live mode the same logic runs on real video, in the browser, with no faces recognised.\"", "Press 4 for Timeline, open Incident report; then switch to Live detection."],
    ], [22 * mm, 100 * mm, W - 122 * mm]),
]

# ---------------- 15. Q&A ----------------
qa = [
    ("Is person detection your innovation?", "No. Detection is a standard building block. Our contribution is reading crowd behaviour: turbulence, counter-flow, a time-to-critical forecast, measured lead time, and what-if actions with a station view."),
    ("What is crowd turbulence?", "When a crowd is dense and people start moving in different directions, pressure waves form. Research on the 2006 Hajj disaster (Helbing and colleagues) measured this as density times the variance of movement. We compute a simple version per zone."),
    ("How do you measure movement without identifying people?", "Each box is matched to the nearest box half a second earlier. That gives a speed and direction. There is no face or identity, and tracks are discarded after a few seconds."),
    ("How accurate is it?", "The general model undercounts very dense crowds, which we state openly. The rules use trends and relative changes, which still work when counts are low. A crowd-density model can replace the detector without changing the rest."),
    ("Why rules instead of a black-box risk model?", "Operators must trust and justify actions. Simple rules with written reasons are auditable, and limits can be tuned per site."),
    ("How does the forecast work?", "A straight line fitted to the zone's count over the last 10 seconds, extended to the critical limit. It only runs for busy zones that are still rising."),
    ("Can it work with real CCTV?", "Yes, through OBS Virtual Camera today. A full deployment adds a small relay that converts camera streams for the browser."),
    ("What does it cost?", "An ordinary laptop, a browser, free open-source software and cameras that are already installed."),
    ("What if the internet fails?", "Simulation needs no internet. Live mode needs it once to download the model; after that it is cached."),
]
st += [
    PageBreak(),
    P("15. Questions judges may ask", "h1"),
    table([["Question", "Short answer"]] + [[q, a] for q, a in qa], [52 * mm, W - 52 * mm]),
]

doc.build(st)
print("written", OUT)
