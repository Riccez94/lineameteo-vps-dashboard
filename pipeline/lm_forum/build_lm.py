#!/usr/bin/env python3
"""Versione della dashboard per il forum Linea Meteo (tema lineameteo, chiaro e scuro).

Legge public/index.html e public/product.js e scrive in public/lm/:
  lm_vps.css, lm_vps.js   stile e programma adattati (tutto limitato a #lmvps)
  contenuto.html          contenuto della pagina, caricato da lm_loader.js
  lm_loader.js            caricatore usato dal blocco CMS del forum
Se qualcosa non torna si ferma con un errore e lascia com'erano i file gia' pubblicati.

Uso: python3 pipeline/lm_forum/build_lm.py public public/lm
"""
import hashlib
import re
import shutil
import sys
import tempfile
from pathlib import Path

SRC = Path(sys.argv[1])
OUT = Path(sys.argv[2])
TMP = Path(tempfile.mkdtemp(prefix="lm_forum_"))

html = (SRC / "index.html").read_text(encoding="utf-8").replace("\r\n", "\n")
js = (SRC / "product.js").read_text(encoding="utf-8")
css = re.search(r"<style>(.*?)</style>", html, re.S).group(1)
ROOT = "#lmvps"

# ---------------------------------------------------------------- CSS
# colori fissi -> variabili (chiaro = colori del forum, scuro arriva da solo dalle variabili del forum)
COLOR_MAP = {
    "#17354e": "var(--text)", "#102d46": "var(--title)", "#0876ad": "var(--accent)",
    "#e8f3f9": "var(--accent-soft)", "#28a8c4": "var(--accent-2)", "#617b90": "var(--muted)",
    "#d8e4ed": "var(--border-2)", "#f4f8fb": "var(--surface-2)", "#edf3f7": "var(--surface-2)",
    "#435e73": "var(--text-2)", "#426276": "var(--text-2)", "#4c6476": "var(--text-2)", "#28445b": "var(--text-2)",
    "#eaf0f5": "var(--surface-3)", "#dbe6ef": "var(--border-2)",
    "#f8fbfd": "var(--surface-2)", "#f9fbfc": "var(--surface-2)", "#fbfdff": "var(--surface)",
    "#f7fafc": "var(--surface-2)", "#eff6fa": "var(--surface-2)", "#f0f8fb": "var(--vps-note-bg)",
    "#dbe5ed": "var(--line)", "#e4edf3": "var(--border)", "#e6edf2": "var(--line)", "#e5edf3": "var(--border-2)",
    "#74899b": "var(--muted)", "#243c50": "var(--text)", "#192f40": "var(--text)", "#8a969f": "var(--muted)",
    "#fff7ed": "var(--vps-warn-bg)", "#fed7aa": "var(--vps-warn-bd)", "#b45309": "var(--vps-warn)",
    "#70420f": "var(--vps-warn-tx)", "#cf5c19": "var(--vps-warn)",
    "#fff1f2": "var(--vps-alert-bg)", "#fecdd3": "var(--vps-alert-bd)", "#c62828": "var(--vps-alert)",
    "#bd3434": "var(--vps-alert)",
    "#effaf4": "var(--vps-ok-bg)", "#bbebcf": "var(--vps-ok-bd)", "#16734a": "var(--vps-ok)", "#188655": "var(--vps-ok)",
    "#e0f5ea": "var(--vps-ok-bg)", "#fbe5e3": "var(--vps-alert-bg)",
    "#143c5510": "var(--vps-shadow-c)", "#17354e0c": "var(--vps-shadow-c)", "#102d4633": "rgba(0,0,0,.25)",
}
VARS_LIGHT = """
  --vps-warn:#b45309;--vps-warn-bg:#fff7ed;--vps-warn-bd:#fed7aa;--vps-warn-tx:#70420f;
  --vps-alert:#c62828;--vps-alert-bg:#fff1f2;--vps-alert-bd:#fecdd3;
  --vps-ok:#16734a;--vps-ok-bg:#effaf4;--vps-ok-bd:#bbebcf;
  --vps-note-bg:#f0f8fb;--vps-shadow-c:#143c5510;--vps-tip-bg:#16325e;
  /* colori dei grafici, letti da lm_vps.js */
  --vps-c-grid:#e5edf3;--vps-c-grid2:#e5ebef;--vps-c-axis:#617b90;--vps-c-ink:#17354e;--vps-c-zero:#1c3548;
  --vps-c-obs:#17354e;--vps-c-normal:#77838d;--vps-c-bg:#ffffff;--vps-c-contour:rgba(24,49,67,.30);
  --vps-c-frame:#687f8f;--vps-c-frame2:#aab9c4;--vps-c-today:#c42d42;--vps-c-clim:#0876ad;
"""
VARS_DARK = """
  --vps-warn:#f2a650;--vps-warn-bg:#382814;--vps-warn-bd:#5a4120;--vps-warn-tx:#f0cd85;
  --vps-alert:#f07c74;--vps-alert-bg:#3a1c1d;--vps-alert-bd:#5c2b2c;
  --vps-ok:#63c99a;--vps-ok-bg:#14352a;--vps-ok-bd:#2c5a45;
  --vps-note-bg:#172a3d;--vps-shadow-c:rgba(0,0,0,.25);--vps-tip-bg:#0a1424;
  --vps-c-grid:#24324a;--vps-c-grid2:#24324a;--vps-c-axis:#8b9ab0;--vps-c-ink:#dfe6ef;--vps-c-zero:#b2bfcf;
  --vps-c-obs:#e8eef6;--vps-c-normal:#8d9aab;--vps-c-bg:#131c29;--vps-c-contour:rgba(230,238,248,.28);
  --vps-c-frame:#5d6f86;--vps-c-frame2:#3a4b63;--vps-c-today:#f07c74;--vps-c-clim:#64aaf2;
"""


def map_colors(sel, decl):
    out = []
    for d in decl.split(";"):
        if not d.strip():
            continue
        prop, _, val = d.partition(":")
        p = prop.strip()
        if p.startswith("--"):
            continue  # variabili originali: sostituite sotto
        if p == "color":
            val = re.sub(r"#fff\b|\bwhite\b", "#fff", val)
        elif sel.strip().endswith("img") and "#fff" in val:
            pass  # le carte sono immagini su fondo bianco: restano bianche
        else:
            val = re.sub(r"#fff\b|\bwhite\b", "var(--surface)", val)
        for k, v in COLOR_MAP.items():
            val = re.sub(re.escape(k) + r"(?![0-9a-fA-F])", v, val, flags=re.I)
        val = re.sub(r"var\(--(navy|blue|blue2|cyan|ink|muted|line|paper|page|soft|red|amber|green|shadow)\)",
                     lambda m: {"navy": "var(--title)", "blue": "var(--accent)", "blue2": "var(--accent-soft)",
                                "cyan": "var(--accent-2)", "ink": "var(--text)", "muted": "var(--muted)",
                                "line": "var(--border-2)", "paper": "var(--surface)", "page": "transparent",
                                "soft": "var(--surface-2)", "red": "var(--vps-alert)", "amber": "var(--vps-warn)",
                                "green": "var(--vps-ok)", "shadow": "var(--shadow)"}[m.group(1)], val)
        val = re.sub(r"Inter,\s*\"?Segoe UI\"?,\s*(Arial,\s*)?sans-serif", "var(--font)", val)
        out.append(p + ":" + val.strip())
    return ";".join(out)


def scope(sel):
    parts = []
    for s in sel.split(","):
        s = s.strip()
        if not s:
            continue
        if s in (":root",):
            continue
        if s == "body":
            parts.append(ROOT)
        elif s == "*":
            parts += [ROOT, ROOT + " *"]
        else:
            parts.append(ROOT + " " + s)
    return ",".join(parts)


def transform(block):
    res = []
    i = 0
    while i < len(block):
        if block.startswith("/*", i):
            j = block.index("*/", i) + 2
            i = j
            continue
        if block[i].isspace():
            i += 1
            continue
        if block[i] == "@":
            head_end = block.index("{", i)
            head = block[i:head_end].strip()
            depth, j = 1, head_end + 1
            while depth:
                depth += {"{": 1, "}": -1}.get(block[j], 0)
                j += 1
            inner = transform(block[head_end + 1:j - 1])
            res.append(head + "{" + inner + "}")
            i = j
            continue
        b = block.index("{", i)
        e = block.index("}", b)
        sel, decl = block[i:b], block[b + 1:e]
        i = e + 1
        if sel.strip() == ":root":
            continue
        sc = scope(sel)
        if sc:
            res.append(sc + "{" + map_colors(sel, decl) + "}")
    return "\n".join(res)


scoped = transform(css)
# pulizie mirate dopo la conversione
scoped = scoped.replace(ROOT + "{margin:0;background:transparent;color:var(--text);font:15px/1.48 var(--font)}",
                        ROOT + "{color:var(--text);font:15px/1.48 var(--font)}")

EXTRA = r"""
/* ---- integrazione nel forum (tema lineameteo) ---- */
#lmvps{max-width:none;margin:0 0 12px;text-align:left}
#lmvps .shell{max-width:none;margin:0;padding:0}
#lmvps h1,#lmvps h2,#lmvps h3{background:none;border:0;padding:0;text-shadow:none;text-transform:none}
#lmvps h2,#lmvps h3{color:var(--title);font-weight:700;font-family:var(--font)}

/* testata come le altre pagine (Nowcasting, Meteogrammi...) */
#lmvps{--vps-grad:linear-gradient(135deg,#16325e 0%,#1565c0 62%,#1e88d6 100%)}
body.lm-dark #lmvps{--vps-grad:linear-gradient(135deg,#0c1c36 0%,#123c70 62%,#17528f 100%)}
#lmvps .lmvps-head{position:relative;overflow:hidden;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:14px;padding:20px 22px;border-radius:14px;background:var(--vps-grad);color:#fff}
#lmvps .lmvps-head::after{content:"";position:absolute;right:-60px;top:-90px;width:260px;height:260px;border-radius:50%;background:rgba(255,255,255,.07);pointer-events:none}
#lmvps .lmvps-head>*{position:relative;z-index:1}
#lmvps .lmvps-kicker{display:inline-block;margin-bottom:6px;padding:3px 10px;border-radius:999px;background:rgba(255,255,255,.16);color:#fff;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase}
#lmvps h1.lmvps-title{margin:0 0 4px;padding:0;border:0;background:none;color:#fff;font-size:24px;font-weight:800;line-height:1.2;letter-spacing:-.01em;text-shadow:none;text-transform:none}
#lmvps .lmvps-head p{margin:0;max-width:620px;color:rgba(255,255,255,.86);font-size:13.5px;line-height:1.5}
#lmvps .lmvps-upd{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
#lmvps .lmvps-time{color:rgba(255,255,255,.86);font-size:12.5px}
#lmvps .lmvps-refresh{display:inline-flex;align-items:center;gap:6px;height:34px;padding:0 14px;border:0;border-radius:999px;background:#fff;color:#16325e;font:700 13px var(--font);white-space:nowrap;cursor:pointer}
#lmvps .lmvps-refresh:hover{background:#e3edfa}
#lmvps .lmvps-refresh.is-busy svg{animation:lmvpsspin .8s linear infinite}
@keyframes lmvpsspin{to{transform:rotate(360deg)}}
#lmvps .lmvps-warn{margin:12px 0 0}
@media(max-width:600px){#lmvps .lmvps-head{padding:16px}#lmvps h1.lmvps-title{font-size:20px}}
#lmvps .runline{margin:12px 2px 14px;font-size:12.5px;line-height:1.55}
#lmvps .runline strong{font-weight:600;color:var(--text-2)}
#lmvps .panel{border-color:var(--border-2);box-shadow:var(--shadow)}
#lmvps .map-controls select{background:var(--surface-3);border:1px solid var(--border-2);color:var(--text);height:auto;min-height:0}
#lmvps .seg button:not([aria-pressed=true]):hover{background:var(--hover);color:var(--title)}
#lmvps .view-btn:not([aria-selected=true]):hover{background:var(--hover)}
#lmvps .chart-tooltip{background:var(--vps-tip-bg)}
#lmvps .sliderrow input{accent-color:var(--accent)}
#lmvps table.prob-table{background:none}
#lmvps .prob-table th{color:var(--muted);font-weight:700}
#lmvps .prob-table td{color:var(--text)}
#lmvps .meter{opacity:.95}
#lmvps .lmvps-src{display:block;margin-top:4px}
#lmvps .lmvps-warn{margin:12px 0 0;padding:10px 14px;border-radius:var(--radius-sm,8px);border:1px solid var(--vps-warn-bd);background:var(--vps-warn-bg);color:var(--vps-warn-tx);font-size:13px;line-height:1.45}
#lmvps .lmvps-warn[hidden]{display:none}
#lmvps .map-figure img{background:#fff!important}
body.lm-dark #lmvps .map-image-frame{background:#0f1723}
body.lm-dark #lmvps .chartbox{background:var(--surface)}
body.lm-dark #lmvps .meter{background:linear-gradient(90deg,#8a5a1c 0 18%,#86702a 18% 35%,#2e6b48 35% 68%,#2b5f7a 68% 100%)}
body.lm-dark #lmvps .view-btn[aria-selected=true] small{color:#cfe2f7}
"""

out_css = ("/* Linea Meteo - Vortice polare stratosferico (dashboard VPS) dentro il tema lineameteo.\n"
           "   Tutto e' limitato a #lmvps; tema scuro con body.lm-dark (cambia anche al volo). */\n"
           + ROOT + "{" + VARS_LIGHT + "}\nbody.lm-dark " + ROOT + "{" + VARS_DARK + "}\n"
           + scoped + "\n" + EXTRA)


# ---------------------------------------------------------------- HTML del blocco
m_main = re.search(r"<main class=\"shell\">(.*)</main>", html, re.S)
if not m_main:
    raise SystemExit("ERRORE: <main class=\"shell\"> non trovato in index.html")
body = m_main.group(1)
m_head = re.search(r"\s*<div class=\"brandline\">.*?<p class=\"subtitle\">.*?</p>", body, re.S)
head_old = m_head.group(0) if m_head else None
_ICON_UNUSED = ('<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" '
        'stroke-linecap="round" stroke-linejoin="round"><path d="M12 12m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0"/>'
        '<path d="M12 4a8 8 0 0 1 8 8"/><path d="M20 12a8 8 0 0 1-8 8"/><path d="M12 20a8 8 0 0 1-8-8"/>'
        '<path d="M4 12a8 8 0 0 1 8-8"/><path d="M12 7.5a4.5 4.5 0 0 1 4.5 4.5"/><path d="M12 16.5A4.5 4.5 0 0 1 7.5 12"/></svg>')
REFRESH_SVG = ('<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path fill="currentColor" '
               'd="M17.65 6.35A7.95 7.95 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>')
head_new = ('\n  <header class="lmvps-head">'
            '<div><span class="lmvps-kicker">Stratosfera &middot; emisfero nord</span>'
            '<h1 class="lmvps-title">Vortice polare stratosferico</h1>'
            '<p>Intensit&agrave;, struttura e previsioni del vortice polare: vento a 60&deg;N, ensemble, onde planetarie e mappe dei principali modelli.</p></div>'
            '<div class="lmvps-upd"><span class="lmvps-time" id="lmvps-time"></span>'
            '<button type="button" class="lmvps-refresh" id="lmvps-refresh" title="Ricarica i dati">' + REFRESH_SVG + 'Aggiorna</button></div>'
            '</header>\n'
            '  <div id="lmvps-warn" class="lmvps-warn" role="status" hidden></div>')
if head_old:
    body = body.replace(head_old, head_new)
else:
    print("nota: testata originale non riconosciuta, aggiungo la testata del forum in cima")
    body = head_new + body
CREDIT = '<span>Linea Meteo · Monitoraggio VPS · progetto di <a href="https://www.lineameteo.it/frasnow-profile-u510.html"><b>Francesco R. (Frasnow)</b></a></span>'
if '<span>LineaMeteo · Monitoraggio VPS</span>' in body:
    body = body.replace('<span>LineaMeteo · Monitoraggio VPS</span>', CREDIT)
else:
    body = body.rstrip() + '\n  <footer class="data-foot">' + CREDIT + '</footer>'


# ---------------------------------------------------------------- JS
# Adattamento generico: niente sostituzioni di righe precise, cosi' regge agli aggiornamenti di product.js.
js = js.replace("\r\n", "\n")
WARN = []

def must(pattern, repl, flags=0, what=""):
    global js
    js2, n = re.subn(pattern, repl, js, flags=flags)
    if n == 0:
        raise SystemExit("ERRORE: punto di aggancio non trovato (" + what + "): " + pattern)
    js = js2

def maybe(pattern, repl, flags=0, what=""):
    global js
    js2, n = re.subn(pattern, repl, js, flags=flags)
    if n == 0:
        WARN.append(what)
    js = js2

PRE = r"""
  const ROOT = document.getElementById("lmvps");
  if (!ROOT) return;
  const BASE = (ROOT.getAttribute("data-base") || "").replace(/\/+$/, "");
  const LMF = "'DM Sans', system-ui, -apple-system, 'Segoe UI', sans-serif";
  const SCHEMA_OK = __SCHEMA__;
  const isDark = () => document.body.classList.contains("lm-dark");
  // colori: nel tema chiaro restano quelli originali, nel tema scuro vengono convertiti
  const LM_DARK = {"#17354e":"#e3eaf3","#20384b":"#e8eef6","#1c3548":"#b2bfcf","#536c7f":"#8b9ab0","#617b90":"#8b9ab0",
    "#77838d":"#8d9aab","#e5edf3":"#24324a","#d8e1e8":"#24324a","#e5ebef":"#24324a","#687f8f":"#5d6f86","#aab9c4":"#3a4b63",
    "#fff":"#131c29","#ffffff":"#131c29","#c42d42":"#f07c74","#0876ad":"#64aaf2","#a64b16":"#f2a650",
    "rgba(24,49,67,.30)":"rgba(230,238,248,.28)",
    "#dc2626":"#f2655c","#f18b8b":"#f5a3a3","#1559c7":"#5b9cf0","#7298e8":"#93b4f2","#7527b8":"#b58cf2","#079447":"#3fbf7f"};
  const lmAutoDark = c => {
    const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c); if (!m) return c;
    let h = m[1]; if (h.length === 3) h = h.replace(/./g, x => x + x);
    let r = parseInt(h.slice(0,2),16)/255, g = parseInt(h.slice(2,4),16)/255, b = parseInt(h.slice(4,6),16)/255;
    const mx = Math.max(r,g,b), mn = Math.min(r,g,b); let l = (mx+mn)/2, sat = 0, hue = 0;
    if (mx !== mn) { const d = mx-mn; sat = l > .5 ? d/(2-mx-mn) : d/(mx+mn);
      hue = mx === r ? (g-b)/d + (g < b ? 6 : 0) : mx === g ? (b-r)/d + 2 : (r-g)/d + 4; hue /= 6; }
    if (l < .38) l = Math.min(.9, 1 - l * .85); else if (l > .86) l = .2; else if (l < .5) l = .62; else return c;
    const q = l < .5 ? l*(1+sat) : l+sat-l*sat, p = 2*l-q, f = t => { t = (t+1)%1; return t < 1/6 ? p+(q-p)*6*t : t < .5 ? q : t < 2/3 ? p+(q-p)*(2/3-t)*6 : p; };
    return "#" + [f(hue+1/3), f(hue), f(hue-1/3)].map(v => Math.round(v*255).toString(16).padStart(2,"0")).join("");
  };
  const C = c => { if (!isDark()) return c; const k = String(c).toLowerCase().replace(/\s+/g, ""); return LM_DARK[k] || lmAutoDark(k); };
  const lmAbs = o => { if (Array.isArray(o)) { for (let i = 0; i < o.length; i++) o[i] = lmAbs(o[i]); return o; }
    if (o && typeof o === "object") { for (const k in o) o[k] = lmAbs(o[k]); return o; }
    return typeof o === "string" && /^\/data\//.test(o) ? BASE + o : o; };
"""
PRE = PRE.replace("__SCHEMA__", "3")

# 1. tutto limitato al contenitore #lmvps
must(r"const \$ = s => document\.querySelector\(s\), \$\$ = s => \[\.\.\.document\.querySelectorAll\(s\)\];",
     lambda m: "/*@@LMPRE@@*/\n  const $ = s => ROOT.querySelector(s), $$ = s => [...ROOT.querySelectorAll(s)];", what="$ e $$")
# 2. colori dei modelli: letti al momento del disegno
must(r"const colors = (\{[^{}]*\});",
     lambda m: "const colors = new Proxy(" + m.group(1).replace('"#', '"@#') + ',{get:(t,k)=>typeof t[k]==="string"?C(t[k]):t[k]});',
     what="colori dei modelli")
# 3. tutti gli altri colori scritti nel codice
js = re.sub(r'(["\'])(#[0-9a-fA-F]{3,8}|rgba?\([0-9.,\s]+\))\1', lambda m: 'C(' + m.group(1) + m.group(2) + m.group(1) + ')', js)
js = js.replace('"@#', '"#')
js = js.replace("/*@@LMPRE@@*/", PRE.strip("\n"), 1)
js = re.sub(r'color:#([0-9a-fA-F]{6})', r'color:"+C("#\1")+"', js)
# 4. font del forum anche nei grafici
js = re.sub(r'"([^"\n]*?)(?:Inter, ?)?Segoe UI(?:, ?sans-serif)?"', r'"\1"+LMF', js)
# 5. dati dall'indirizzo della pipeline
must(r'fetch\("(/data/[^"]+)"', r'fetch(BASE+"\1"', what="fetch dei dati")
must(r"(s\.data\s*=\s*await r\.json\(\);)", r"\1lmAbs(s.data);lmSchemaCheck(s.data);lmHeadTime();", what="lettura del JSON")
# 6. correzioni facoltative (se l'autore le ha gia' fatte, si saltano)
maybe(r'(\}catch\(e\)\{)(\$\("#feed-status"\)\.textContent=s\.data\?)',
      r'\1if(!s.data){const w=$("#lmvps-warn");if(w){w.textContent="I dati del vortice polare non sono raggiungibili in questo momento. Riprova tra qualche minuto.";w.hidden=false}}\2',
      what="avviso dati non raggiungibili")

HELPERS = r"""
  function lmSchemaCheck(d){
    const w=$("#lmvps-warn");if(!w)return;
    if(d&&d.schema!=null&&Number(d.schema)!==SCHEMA_OK){w.textContent="Il formato dei dati è cambiato (versione "+d.schema+", la pagina è fatta per la "+SCHEMA_OK+"): alcuni grafici potrebbero non essere corretti finché la pagina non viene aggiornata.";w.hidden=false}
    else w.hidden=true;
  }
  function lmHeadTime(){const t=$("#lmvps-time");if(!t||!s.data||!s.data.generatedAt)return;t.textContent="Dati elaborati "+new Intl.DateTimeFormat("it-IT",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit",timeZone:"Europe/Rome"}).format(new Date(s.data.generatedAt))}
  $("#lmvps-refresh")?.addEventListener("click",async()=>{const b=$("#lmvps-refresh");b.classList.add("is-busy");try{await load()}finally{setTimeout(()=>b.classList.remove("is-busy"),500)}});
  // tema chiaro/scuro: al cambio si ridisegnano i grafici con i nuovi colori
  let lmDarkNow=isDark();
  new MutationObserver(()=>{const d=isDark();if(d===lmDarkNow)return;lmDarkNow=d;if(s.data)try{render()}catch(e){}}).observe(document.body,{attributes:true,attributeFilter:["class"]});
"""
k = js.rstrip().rfind("})();")
if k < 0:
    raise SystemExit("ERRORE: fine del programma non trovata")
js = js[:k] + HELPERS.strip("\n") + "\n" + js[k:]
for w in WARN:
    print("nota: correzione non applicata (forse gia' fatta dall'autore):", w)

js = ("/* Linea Meteo - Vortice polare stratosferico (dashboard VPS di Francesco R. (Frasnow), versione per il forum).\n"
      "   Generato da pipeline/lm_forum/build_lm.py: non modificare a mano. */\n" + js)
ver = hashlib.sha1((out_css + js + body).encode("utf-8")).hexdigest()[:10]
contenuto = ('<!-- Linea Meteo - Vortice polare: contenuto caricato da lm_loader.js. Generato da pipeline/lm_forum/build_lm.py -->\n'
             '<div class="shell" data-v="' + ver + '">' + body.rstrip() + '\n</div>\n')
LOADER = r"""/* Linea Meteo - caricatore della pagina Vortice polare per il blocco CMS del forum.
   Nel blocco: <div id="lmvps" class="lm-keep-colors" data-base="https://lineameteo-vps-dashboard.pages.dev"></div>
   + questo script. Carica contenuto, stile e programma da data-base: ogni aggiornamento del progetto arriva da solo. */
(function () {
	var root = document.getElementById('lmvps');
	if (!root || root.getAttribute('data-lm-loaded')) { return; }
	root.setAttribute('data-lm-loaded', '1');
	var base = (root.getAttribute('data-base') || 'https://lineameteo-vps-dashboard.pages.dev').replace(/\/+$/, '');
	function fail() {
		root.innerHTML = '<div style="padding:22px;border-radius:12px;background:var(--surface,#fff);color:var(--muted,#5f6f84);text-align:center">' +
			'La pagina del vortice polare non &egrave; raggiungibile in questo momento. Riprova tra qualche minuto.</div>';
	}
	fetch(base + '/lm/contenuto.html', { cache: 'no-cache', credentials: 'omit' }).then(function (r) {
		if (!r.ok) { throw new Error(r.status); }
		return r.text();
	}).then(function (html) {
		var v = (/data-v="([0-9a-f]+)"/.exec(html) || [])[1] || String(Date.now());
		var css = document.createElement('link');
		css.rel = 'stylesheet';
		css.href = base + '/lm/lm_vps.css?v=' + v;
		css.onload = function () {
			root.innerHTML = html;
			var js = document.createElement('script');
			js.src = base + '/lm/lm_vps.js?v=' + v;
			js.onerror = fail;
			document.body.appendChild(js);
		};
		css.onerror = fail;
		document.head.appendChild(css);
	})['catch'](fail);
})();
"""
(TMP / "lm_vps.css").write_text(out_css, encoding="utf-8")
(TMP / "lm_vps.js").write_text(js, encoding="utf-8")
(TMP / "contenuto.html").write_text(contenuto, encoding="utf-8")
(TMP / "lm_loader.js").write_text(LOADER, encoding="utf-8")
OUT.mkdir(parents=True, exist_ok=True)
for f in TMP.iterdir():
    shutil.move(str(f), str(OUT / f.name))
shutil.rmtree(TMP, ignore_errors=True)
print("ok versione", ver, "->", OUT)
