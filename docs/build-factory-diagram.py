import json, os
D = os.environ.get("ICON_DIR", os.path.dirname(os.path.abspath(__file__)))  # needs icons.json + dl/*.b64
icons = json.load(open(f"{D}/icons.json"))
daytona = open(f"{D}/dl/daytona.b64").read().strip()
belli = open(f"{D}/dl/belli.b64").read().strip()

NOSANA = '''<svg viewBox="0 0 31 27" xmlns="http://www.w3.org/2000/svg"><path fill="#10E80C" d="M8.9965 2.46796C8.53975 1.56781 7.78816 0.846191 6.86355 0.420062C5.93895 -0.00606649 4.89553 -0.111724 3.90243 0.120216C2.90933 0.352156 2.02475 0.908099 1.39208 1.69793C0.759409 2.48776 0.41573 3.46519 0.41675 4.47177V26.567H3.40885V4.47177C3.41418 4.13276 3.53399 3.80519 3.74932 3.5409C3.96465 3.27661 4.26319 3.0907 4.59771 3.01259C4.93222 2.93448 5.28358 2.96863 5.5962 3.10964C5.90882 3.25066 6.16482 3.49047 6.3237 3.79114L16.4047 23.6159H13.0572L7.80172 13.2845H4.45428L11.2135 26.567H21.2559L8.9965 2.46796Z"/><path fill="#10E80C" d="M27.9481 0.00192261V22.0972C27.9417 22.4353 27.8214 22.7617 27.6063 23.025C27.3911 23.2884 27.0932 23.4736 26.7596 23.5516C26.4259 23.6296 26.0755 23.5958 25.7634 23.4558C25.4513 23.3157 25.1953 23.0772 25.0358 22.7778L14.9548 2.95303H18.3023L23.5578 13.2845H26.9052L20.1485 0.00192261H10.1062L22.3604 24.101C22.818 25.0003 23.57 25.721 24.4945 26.1465C25.419 26.572 26.462 26.6774 27.4548 26.4456C28.4476 26.2138 29.332 25.6584 29.965 24.8692C30.598 24.0801 30.9425 23.1034 30.9427 22.0972V0.00192261H27.9481Z"/></svg>'''


def ic(name, size=18, color=None):
    i = icons[name]
    fill = color or f"#{i['hex']}"
    return f'<svg class="ic" width="{size}" height="{size}" viewBox="0 0 24 24" aria-label="{name}"><path fill="{fill}" d="{i["path"]}"/></svg>'


def img(b64, size=18, label=""):
    return f'<img class="ic" width="{size}" height="{size}" alt="{label}" src="data:image/png;base64,{b64}">'


def nosana(size=18):
    return NOSANA.replace("<svg ", f'<svg class="ic" width="{size}" height="{round(size*27/31)}" aria-label="Nosana" ')


def box(x, y, w, cls, logos, title, body, h=None):
    style = f"left:{x}px;top:{y}px;width:{w}px" + (f";height:{h}px" if h else "")
    return f'<div class="box {cls}" style="{style}"><div class="hd">{logos}<b>{title}</b></div><p>{body}</p></div>'


nodes = []
# Left: prospect
nodes.append(box(32, 92, 214, "g-user", img(belli, 18, "Belli"), "Airline visitor",
                 "Opens belli.ai, clicks <i>Demo</i>, enters work email + airline (e.g. Etihad)"))
nodes.append(box(32, 470, 214, "g-user", img(belli, 18, "Belli"), "Their own Belli",
                 "Airline dashboard + booking portal, real backend, no sign-in"))
# Vercel
nodes.append(box(296, 240, 236, "g-vercel", ic("vercel", 16) + ic("next", 16) + ic("react", 16) + ic("ts", 15),
                 "Vercel · demo factory", "belli.ai landing + demo form, <code>/api/demo</code>, <code>*.belli.ai</code> routing"))
nodes.append(box(296, 470, 236, "g-vercel", ic("flightaware", 20),
                 "Airline profile", "IATA codes, AWB prefix 607, hub + airports; FlightAware AeroAPI flights"))
# Nosana
nodes.append(box(596, 34, 340, "g-nosana", nosana(22) + ic("ollama", 18) + ic("qwen", 18),
                 "Nosana · Ollama · qwen3:8b",
                 "RTX 3060 on the decentralized network. Proposes hub, routes, fleet, brand colour and fake forwarders"))
# Daytona sandbox inner nodes
nodes.append(box(624, 268, 186, "g-day", ic("node", 16), "edge.mjs",
                 ":3000 dashboard · :4000 portal · <code>/belli-api</code>"))
nodes.append(box(846, 268, 196, "g-day", ic("next", 15) + ic("react", 15) + ic("tailwind", 15), "Belli frontend",
                 "Dashboard + booking portal, no-login demo mode"))
nodes.append(box(846, 400, 196, "g-day", ic("go", 20), "belli-api",
                 "Go · Echo · GORM, seeded per airline"))
nodes.append(box(1078, 400, 158, "g-day", ic("pg", 17), "PostgreSQL 16", "Flights, aircraft, ULDs, 607- AWBs"))
nodes.append(box(1078, 268, 158, "g-day", ic("redis", 17), "Redis", "Cache and job queues"))
nodes.append(box(624, 400, 186, "g-day", img(daytona, 16, "Daytona"), "Snapshot",
                 "<code>belli-demo-stack-v1</code>, one sandbox per airline"))
# Bottom row
nodes.append(box(624, 570, 186, "g-ext", ic("github", 16), "GitHub",
                 "belli-ai/belli-api + belli-ai/belli"))
nodes.append(box(846, 570, 196, "g-clerk", ic("clerk", 16), "Clerk",
                 "Sign-in for real tenants; demos swap in stand-ins"))
nodes.append(box(1078, 570, 158, "g-ext", ic("resend", 14) + ic("posthog", 16), "Resend · PostHog",
                 "Email, analytics"))

# Arrows: polyline points, step badge position, label (text, x, y), dashed
A = [
    ([(246,128),(270,128),(270,292),(296,292)], (270,176), ("email + airline",283,168), "1", False),
    ([(450,240),(450,112),(596,112)], (520,112), ("build airline profile",478,88), "2", False),
    ([(532,300),(588,300),(588,440),(624,440)], (588,372), ("create / reuse sandbox",470,382), "3", False),
    ([(810,440),(846,440)], (828,440), None, "4", False),
    ([(139,546),(139,604),(572,604),(572,320),(624,320)], (420,604), ("open dashboard + portal",440,608), "5", False),
    ([(810,310),(846,310)], None, None, "", False),
    ([(1042,440),(1078,440)], None, None, "", False),
    ([(1042,310),(1078,310)], None, None, "", False),
    ([(717,570),(717,482)], (717,528), ("build once",728,520), "A", True),
    ([(414,470),(414,338)], None, None, "", False),
]
paths = []
labels = []
for pts, badge, lab, step, dashed in A:
    d = ' stroke-dasharray="5 4"' if dashed else ""
    pp = " ".join(f"{x},{y}" for x, y in pts)
    paths.append(f'<polyline points="{pp}" fill="none" stroke="#7b8494" stroke-width="1.5" stroke-linejoin="round" marker-end="url(#ah)"{d}/>')
    if step and badge:
        bx, by = badge
        paths.append(f'<circle cx="{bx}" cy="{by}" r="10" fill="#ff5a1f" stroke="#fff" stroke-width="2"/><text x="{bx}" y="{by+4}" text-anchor="middle" class="step">{step}</text>')
    if lab:
        t, lx, ly = lab
        labels.append(f'<div class="lab" style="left:{lx}px;top:{ly}px">{t}</div>')

html = f'''<title>Belli Demo Factory Architecture</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500&display=swap">
<style>
/* Layout: one 1280×720 slide-style figure (light by design), scaled to the page width. */
:root {{ --bg:#ffffff; --ink:#1a1f2b; --muted:#5d6676; --line:#cfd5df; --belli:#ff5a1f; color-scheme: light }}
* {{ box-sizing:border-box }}
body {{ background:var(--bg); color:var(--ink); font:13px/1.4 Inter,system-ui,sans-serif;
  padding-left:max(16px,env(safe-area-inset-left,0px)); padding-right:max(16px,env(safe-area-inset-right,0px)); padding-block:20px 28px }}
.wrap {{ max-width:1280px; margin:0 auto; overflow-x:auto }}
.stage {{ position:relative; width:1280px; height:760px; transform-origin:0 0; background:#fff; border:1px solid #e3e7ee; border-radius:6px }}
h1 {{ position:absolute; left:32px; top:22px; margin:0; font:700 22px/1.2 Inter,sans-serif; letter-spacing:-.01em }}
h1 span {{ color:var(--belli) }}
.grp {{ position:absolute; border:1.5px dashed; border-radius:8px }}
.grp > em {{ position:absolute; top:-10px; left:12px; background:#fff; padding:0 6px; font:600 12px Inter,sans-serif; font-style:normal; display:flex; gap:6px; align-items:center }}
.g1 {{ left:20px; top:70px; width:238px; height:490px; border-color:#9cc8a0 }} .g1>em{{ color:#2f7d36 }}
.g2 {{ left:284px; top:218px; width:260px; height:342px; border-color:#b9bec7 }} .g2>em{{ color:#3b4250 }}
.g3 {{ left:604px; top:226px; width:652px; height:282px; border-color:#9fb1f0; background:#f7f9ff }} .g3>em{{ color:#2f4bc4 }}
.box {{ position:absolute; background:#fff; border:1.5px solid; border-radius:7px; padding:8px 10px; box-shadow:0 1px 2px rgba(20,30,50,.06) }}
.box .hd {{ display:flex; align-items:center; gap:6px; margin-bottom:3px }}
.box b {{ font-weight:650; font-size:13.5px }}
.box p {{ margin:0; color:var(--muted); font-size:11.8px }}
.box code {{ font:500 11px "JetBrains Mono",monospace; color:#3b4250 }}
.ic {{ flex:none; display:block }}
.g-user {{ border-color:#8fc596; background:#f3fbf3 }}
.g-vercel {{ border-color:#c6cbd3; background:#fafafa }}
.g-day {{ border-color:#a8b8f2; background:#fff }}
.g-ext {{ border-color:#d6dae1; background:#fff }}
.g-clerk {{ border-color:#c3b3ff; background:#f6f3ff }}
.g-nosana {{ border:2.5px solid #10e80c; background:linear-gradient(135deg,#ecfdeb,#ffffff 75%); box-shadow:0 0 0 4px rgba(16,232,12,.15),0 8px 22px rgba(16,180,12,.18) }}
.g-nosana b {{ color:#087a05; font-size:15px }}
.lab {{ position:absolute; z-index:2; font-size:11px; color:var(--muted); background:rgba(255,255,255,.9); padding:0 3px }}
svg.arrows {{ position:absolute; inset:0; pointer-events:none; z-index:1 }}
.step {{ font:700 11px Inter,sans-serif; fill:#fff }}
.cap {{ position:absolute; left:32px; right:32px; bottom:18px; font-size:12px; color:var(--muted); border-top:1px solid #e6e9ef; padding-top:8px }}
.cap b {{ color:var(--ink) }}
</style>
<div class="wrap"><div class="stage" id="stage">
<h1><span>Belli</span> Demo Factory: Vercel, Nosana, Daytona</h1>
<div class="grp g1"><em>Prospect's browser</em></div>
<div class="grp g2"><em>{ic("vercel",12)} Vercel</em></div>
<div class="grp g3"><em>{img(daytona,14,"Daytona")} Daytona · one sandbox per airline</em></div>
<svg class="arrows" viewBox="0 0 1280 760">{"".join(nodes)}
<svg class="arrows" viewBox="0 0 1280 760"><defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="#7b8494"/></marker></defs>{"".join(paths)}</svg>
{"".join(labels)}
<div class="cap"><b>Belli Demo Factory.</b> Steps 1–5 follow one Demo click: the factory on Vercel asks Nosana's GPU (Ollama, qwen3:8b) to build the airline's profile, starts or reuses that airline's Daytona sandbox from the snapshot, seeds the real Belli stack (step 4), and the visitor opens their dashboard and booking portal. Step A runs once: the snapshot is built from GitHub.</div>
</div></div>
<script>
const s=document.getElementById("stage");
function fit(){{const w=s.parentElement.clientWidth;const k=Math.min(1,w/1280);s.style.transform=`scale(${{k}})`;s.parentElement.style.height=(760*k)+"px"}}
addEventListener("resize",fit);fit();
</script>
'''
open("/home/user/daytona-nosana-hackathon/docs/factory-diagram.html", "w").write(html)
print("ok", len(html))
