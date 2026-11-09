#!/usr/bin/env python3
"""
hoona v7 : générateur de site statique multilingue (sans dépendance).

    python3 v7/build.py

Entrées
  src/layout.html            gabarit commun ; textes en {{t:clé}}, traduits par src/i18n/<langue>.json
  src/pages/<langue>/*.html  une page par fichier, précédée de son en-tête de métadonnées
  src/partials/*.svg         fragments partagés (la fleur des 7 axes)

Sorties
  v7/<langue>/*.html         une arborescence par langue (fr/, nl/, en/), comme hoona.life
  v7/index.html              aiguillage vers la langue du navigateur (français par défaut)
  v7/dist/                   ce qui part en ligne

Ajouter une langue : créer src/pages/nl/ (ou en/) avec les pages traduites, sous les
mêmes noms de fichiers. Une page absente d'une langue n'y est pas publiée et
n'apparaît ni dans le sélecteur de langue, ni dans les balises hreflang.

Contenus éditables dans Sveltia CMS (admin/) :
  content/sejours.json         les dates de séjours immersifs (et « complet »). Le bandeau
                               « prochain séjour », les trois prochaines dates de l'accueil,
                               le calendrier de la page Séjours et les dates du module de
                               réservation (reserver-sejour.html) en sont calculés. Les dates
                               passées sont écartées au build, puis par le navigateur (data-start).
  content/soins/<langue>.json  le catalogue des soins (catégories, prestations, durées, prix, axes,
                               lien Acuity de la séance, pack 5+1 et son lien)
  content/sessions/<langue>.json  les sessions collectives (horaires, prix, pack, abonnement, liens, axes)
  content/journal/<langue>/<slug>.md  les articles du Journal : en-tête YAML (title, description, date, axes,
                               image, image_alt, author, cta_label, cta_url) puis le texte en Markdown.
                               Produit <langue>/journal.html (liste), <langue>/journal/<slug>.html (une page par
                               article, données BlogPosting), <langue>/journal.xml (flux RSS). Un article daté dans
                               le futur attend sa date ; `draft: true` le garde hors ligne.
  content/journees/<langue>.json  les journées et demi-journées (nom, description, prix, lien Acuity par journée)
  content/temoignages/<langue>.json  avis Google (texte, auteur, format, séjour) et témoignages vidéo (fichier, affiche,
                               auteur, format, durée) : accueil et page séjours
  content/chemins/<langue>.json  les quatre chemins de l'accueil : signaux, étapes conseillées, soins et sessions
                               recommandés (par nom, repris des catalogues), articles du Journal. Produit
                               <langue>/chemin-<slug>.html.
  sitemap.xml                  généré à chaque build (toutes les pages indexables, trois langues).

    python3 v7/build.py --watch   reconstruit à chaque enregistrement dans le CMS
"""
import datetime as dt
from zoneinfo import ZoneInfo
import html as htmllib
import json
import pathlib
import re
import shutil
import sys
import time
import unicodedata

ROOT = pathlib.Path(__file__).parent
SRC = ROOT / "src"
DIST = ROOT / "dist"
LAYOUT = (SRC / "layout.html").read_text(encoding="utf-8")


def flower(lang):
    """La fleur des 7 axes, dans la langue de la page (partials/flower.<langue>.svg), sinon en français."""
    p = SRC / "partials" / ("flower.%s.svg" % lang)
    return (p if p.exists() else SRC / "partials" / "flower.svg").read_text(encoding="utf-8")

SITE_URL = "https://www.hoona.life"   # pour les balises hreflang absolues
LANGS = ["fr", "nl", "en"]             # ordre du sélecteur
DEFAULT_LANG = "fr"
NAV_KEYS = ["APPROCHE", "SEJOURS", "SOINS", "SESSIONS", "BILAN", "APROPOS", "CONSULTATION", "JOURNEES"]
# Les entrées à sous-menu de la barre sont marquées « page courante » pour toutes les pages qu'elles regroupent.
NAV_GROUPS = {"SOINS": {"SOINS", "SESSIONS", "BILAN", "CADEAU"}, "APPROCHE": {"APPROCHE", "APROPOS", "JOURNAL", "CONTACT"}}

CONTENT = ROOT / "content"


def load_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def d(s):
    return dt.date.fromisoformat(s)


# ---------- Dates, dans la langue de la page ----------

def span(t, lang, start, end, year=True):
    """« 19 au 23 octobre 2026 » · « 19 to 23 October 2026 » · « 19 tot 23 oktober 2026 »."""
    a, b = d(start), d(end)
    months = t["months"]
    day = (lambda n: "1er" if n == 1 else str(n)) if lang == "fr" else str
    first = day(a.day) + (" " + months[a.month - 1] if a.month != b.month else "")
    last = "%s %s" % (day(b.day), months[b.month - 1]) + (" %d" % b.year if year else "")
    return "%s %s %s" % (first, t["date_to"], last)


def sejours():
    """Les séjours triés par date de début : [{debut, fin, complet}]."""
    rows = load_json(CONTENT / "sejours.json").get("sejours", [])
    return sorted(
        ({"debut": str(r["debut"])[:10], "fin": str(r["fin"])[:10], "complet": bool(r.get("complet"))} for r in rows),
        key=lambda r: r["debut"],
    )


def upcoming(today, open_only=False):
    return [s for s in sejours() if d(s["debut"]) > today and not (open_only and s["complet"])]


def render_next(t, lang, today):
    nxt = upcoming(today, open_only=True)
    return span(t, lang, nxt[0]["debut"], nxt[0]["fin"]) if nxt else t["banner_none"]


def render_next3(t, lang, today):
    return "\n".join(
        '<li data-start="%s"><time datetime="%s">%s</time></li>' % (s["debut"], s["debut"], span(t, lang, s["debut"], s["fin"]))
        for s in upcoming(today, open_only=True)[:3]
    )


def render_calendar(t, lang, today, book_page="contact.html?sejour=%s#reserver"):
    """Un groupe par mois, une ligne filetée par séjour ; « complet » remplace le lien de réservation."""
    groups = {}
    for s in upcoming(today):
        a = d(s["debut"])
        groups.setdefault((a.year, a.month), []).append(s)
    out = []
    for (year, month), rows in groups.items():
        lis = []
        for s in rows:
            if s["complet"]:
                action = '<span class="cal__full">%s</span>' % t["cal_full"]
            else:
                action = ('<a class="link" href="%s">%s<span class="visually-hidden"> %s %s</span></a>'
                          % (book_page % s["debut"], t["cal_book"], t["cal_book_sr"], span(t, lang, s["debut"], s["fin"])))
            lis.append('      <li data-start="%s"><time datetime="%s">%s</time>%s</li>'
                       % (s["debut"], s["debut"], span(t, lang, s["debut"], s["fin"], year=False), action))
        out.append(
            '  <div class="cal__month" data-month="%d-%02d">\n'
            '    <h3 class="cal__label">%s <span>%d</span></h3>\n'
            '    <ul class="cal__list">\n%s\n    </ul>\n  </div>'
            % (year, month, t["months"][month - 1].capitalize(), year, "\n".join(lis))
        )
    return "\n".join(out)


def render_options(t, lang, today):
    """Les dates à venir du module de réservation : un bouton radio par séjour, « complet » désactivé.
    data-start permet au navigateur de retirer lui-même une date passée entre deux builds."""
    out = []
    for s in upcoming(today):
        full = s["complet"]
        out.append(
            '<label class="rsv__date%s" data-start="%s">'
            '<input type="radio" name="sejour" value="%s" data-label="%s"%s required>'
            '<span class="rsv__date-main"><time datetime="%s">%s</time></span>'
            '<span class="rsv__date-year">%s</span></label>'
            % (" is-full" if full else "", s["debut"], s["debut"],
               htmllib.escape(span(t, lang, s["debut"], s["fin"]), quote=True),
               " disabled" if full else "", s["debut"],
               span(t, lang, s["debut"], s["fin"], year=False),
               t["cal_full"] if full else d(s["debut"]).year)
        )
    return "\n".join(out)


# ---------- Catalogue des soins ----------

def duree(minutes, lang):
    """fr : « 50 min », « 1h20 », « 3h » · en : « 80 min », « 3 hours » · nl : « 80 min », « 3 uur »."""
    m = int(minutes)
    if lang == "fr":
        if m < 60:
            return "%d min" % m
        return "%dh" % (m // 60) + ("%02d" % (m % 60) if m % 60 else "")
    if m < 120:
        return "%d min" % m
    return "%g %s" % (m / 60, {"en": "hours", "nl": "uur"}[lang])


def prix(value, t, lang):
    if value in (None, ""):
        return t["price_on_request"]
    n = "%d" % int(value)
    return {"fr": n + "\u00a0€", "en": "€" + n, "nl": "€\u00a0" + n}[lang]


AXES = ["nutrition", "sommeil", "mouvement", "detox", "systeme-nerveux", "psycho-emotionnel", "sens"]


def axes_picker(t, lang):
    """Le sélecteur des 7 axes : la fleur (pétales cliquables) et sept pastilles, sans numéros.
    Les compteurs par axe sont remplis par hoona.js d'après les lignes présentes."""
    e = lambda x: htmllib.escape(str(x), quote=True)
    svg = flower(lang)
    svg = re.sub(r'<a href="approche\.html#axe-([a-z-]+)" aria-label="([^"]+)">',
                 r'<a href="#" role="button" aria-pressed="false" data-axis="\1" aria-label="\2">', svg)
    pills = "".join(
        '<li><button type="button" class="axes__btn" data-axis="%s" aria-pressed="false"><span class="t">%s</span><span class="count" data-axis-count="%s"></span></button></li>'
        % (a, e(t["axes"][a]), a) for a in AXES)
    return (
        '<section class="axes" aria-labelledby="axes-title" data-axes-picker>\n'
        '  <figure class="axes__flower" id="axes-flower">%s</figure>\n'
        '  <div class="axes__pick">\n'
        '    <p class="insert" id="axes-title">%s</p>\n'
        '    <p class="muted">%s</p>\n'
        '    <ul class="axes__list">%s</ul>\n'
        '    <p class="axes__status"><span data-axes-status>%s</span> <button class="link" type="button" data-axes-clear hidden>%s</button></p>\n'
        '    <button class="axes__toggle link" type="button" aria-expanded="false" aria-controls="axes-flower" data-axes-toggle data-show="%s" data-hide="%s">%s</button>\n'
        '  </div>\n</section>'
        % (svg, e(t["axes_pick_title"]), e(t["axes_pick_hint"]), pills, e(t["axes_all"]), e(t["show_all"]),
           e(t["axes_show"]), e(t["axes_hide"]), e(t["axes_show"]))
    )


def axes_tags(item, t):
    e = lambda x: htmllib.escape(str(x), quote=True)
    axes = [a for a in item.get("axes", []) if a in AXES]
    if not axes:
        return ""
    if len(axes) == 7:
        return '<span class="axes-tags"><span class="axes-tag axes-tag--all">%s</span></span>' % e(t["axes_all_tag"])
    return '<span class="axes-tags">%s</span>' % "".join('<span class="axes-tag">%s</span>' % e(t["axes"][a]) for a in axes)


def actions(item, t, lang):
    """Réserver (agenda Acuity, nouvel onglet) ou Nous contacter, puis Pack 5+1 et Abonnement s'ils existent."""
    e = lambda x: htmllib.escape(str(x), quote=True)
    u = item.get("url") or ""
    if u.startswith("mailto:"):
        out = ('<a class="btn btn--sm btn--line" href="%s"><svg class="i" aria-hidden="true"><use href="#i-mail"/></svg>%s</a>'
               '<a class="btn btn--sm btn--line offer-btn" href="tel:%s" title="%s"><svg class="i" aria-hidden="true"><use href="#i-phone"/></svg>%s</a>'
               % (e(u), e(t["contact_mail"]), e(t["tel_link"]), e(t["tel_label"]), e(t["contact_tel"])))
    elif u.startswith("http"):
        out = ('<a class="btn btn--sm" href="%s" target="_blank" rel="noopener">%s<span class="visually-hidden"> : %s %s</span></a>'
               % (e(u), e(t["book"]), e(item.get("nom")), e(t["book_sr"])))
    else:
        out = '<a class="btn btn--sm btn--line" href="contact.html?sujet=soin#reserver">%s</a>' % e(t["contact_us"])
    for key, url_key, label, suffix in (("pack", "url_pack", t["pack_label"], ""), ("abo", "url_abo", t["abo_label"], t["per_month"])):
        if item.get(key):
            price = prix(item[key], t, lang) + suffix
            link = item.get(url_key) or ""
            out += ('<a class="btn btn--sm btn--line offer-btn" href="%s" target="_blank" rel="noopener">%s <b>%s</b></a>' % (e(link), e(label), e(price))
                    if link.startswith("http") else '<span class="btn btn--sm btn--line offer-btn is-static">%s <b>%s</b></span>' % (e(label), e(price)))
    return out


def anchor_chips(cats, key, t):
    e = lambda x: htmllib.escape(str(x), quote=True)
    return "\n      ".join('<a class="chip chip--link" href="#%s">%s<span class="count">%d</span></a>' % (e(c["slug"]), e(c["nom"]), len(c.get(key, []))) for c in cats)


def cat_head(c):
    """L'en-tête d'une catégorie : bandeau photo avec le titre en réserve et une légende, puis l'intro ; sans photo, titre et intro."""
    e = lambda x: htmllib.escape(str(x or ""), quote=True)
    if not c.get("image"):
        return '      <h2 id="h-%s">%s</h2>\n      <p>%s</p>\n' % (e(c["slug"]), e(c["nom"]), e(c.get("intro")))
    cap = '<span class="cartouche">%s</span>' % e(c["image_caption"]) if c.get("image_caption") else ""
    return ('      <figure class="cat-plate"><img src="%s" alt="" width="1600" height="900" loading="lazy" decoding="async">'
            '<figcaption><h2 id="h-%s">%s</h2>%s</figcaption></figure>\n      <p class="cat-intro">%s</p>\n'
            % (e(c["image"].lstrip("/")), e(c["slug"]), e(c["nom"]), cap, e(c.get("intro"))))


ICON_CLOCK = '<svg class="i" aria-hidden="true"><use href="#i-clock"/></svg>'
ICON_CAL = '<svg class="i" aria-hidden="true"><use href="#i-cal"/></svg>'


def pill(text, icon="", cls=""):
    return '<span class="row__pill%s">%s%s</span>' % ((" " + cls) if cls else "", icon, htmllib.escape(str(text), quote=False))


def price_span(value, t, lang):
    """Le prix en gras, ou « sur demande » en pastille quand il n'y a pas de prix."""
    if value in (None, ""):
        return '<span class="row__price row__price--ask">%s</span>' % htmllib.escape(t["price_on_request"], quote=False)
    return '<span class="row__price">%s</span>' % prix(value, t, lang)


_PRODUCT_LINKS = {}

def product_links(lang):
    """[(alias, page)] des prestations qui ont une page dédiée (clé `page`, alias facultatifs), du plus long au plus court."""
    if lang not in _PRODUCT_LINKS:
        out = []
        for kind in ("soins", "sessions"):
            for i in catalogue_items(kind, lang).values():
                if i.get("page"):
                    for a in [i["nom"]] + list(i.get("alias", [])):
                        out.append((a, i["page"]))
        _PRODUCT_LINKS[lang] = sorted(out, key=lambda x: -len(x[0]))
    return _PRODUCT_LINKS[lang]


def link_products(text, lang, skip_page=None):
    """Relie la première mention d'une prestation à sa page dédiée. `text` est déjà échappé."""
    done = set()
    for alias, page in product_links(lang):
        if page == skip_page or page in done or "<a " in text and alias in re.sub(r"<a [^>]*>.*?</a>", "", text, flags=re.S) is False:
            continue
        m = re.search(r"(?<![\w-])%s(?![\w-])" % re.escape(alias), text)
        if m:
            text = text[:m.start()] + '<a href="%s">%s</a>' % (page, alias) + text[m.end():]
            done.add(page)
    return text


def row_title(i, e):
    """Le nom de la prestation, relié à sa page dédiée quand elle existe."""
    if i.get("page"):
        nom = e(i.get("nom")); head, _, last = nom.rpartition(" ")
        return '<a class="row__link" href="%s">%s<span class="nowrap">%s<svg class="i" aria-hidden="true"><use href="#i-arrow"/></svg></span></a>' % (e(i["page"]), head + " " if head else "", last)
    return e(i.get("nom"))


def soin_row(i, t, lang):
    e = lambda x: htmllib.escape(str(x or ""), quote=False)
    return ('        <div class="row row--soin item" data-axes="%s"><span class="row__title">%s</span>'
            '<span class="row__desc">%s%s</span><span class="row__meta">%s</span>%s'
            '<span class="row__act">%s</span></div>'
            % (" ".join(a for a in i.get("axes", []) if a in AXES), row_title(i, e), link_products(e(i.get("description")), lang, i.get("page")), axes_tags(i, t),
               pill(duree(i.get("duree", 0), lang), ICON_CLOCK), price_span(i.get("prix"), t, lang), actions(i, t, lang)))


def session_row(i, t, lang):
    e = lambda x: htmllib.escape(str(x or ""), quote=False)
    when = horaire(i, t, lang)
    pills = pill(duree(i.get("duree", 0), lang), ICON_CLOCK) + "".join(pill(w, ICON_CAL, "row__pill--when") for w in when.split(" · "))
    return ('        <div class="row row--soin item" id="s-%s" data-axes="%s"><span class="row__title">%s</span>'
            '<span class="row__desc">%s%s</span><span class="row__meta">%s</span>%s'
            '<span class="row__act">%s</span></div>'
            % (slugify(i.get("nom", "")), " ".join(a for a in i.get("axes", []) if a in AXES), row_title(i, e), link_products(e(i.get("description")), lang, i.get("page")),
               axes_tags(i, t), pills, price_span(i.get("prix"), t, lang), actions(i, t, lang)))


def catalogue_items(kind, lang):
    """Toutes les prestations (soins) ou sessions d'une langue, indexées par nom."""
    path = CONTENT / kind / ("%s.json" % lang)
    if not path.exists():
        return {}
    out = {}
    for c in load_json(path).get("categories", []):
        for i in c.get("prestations" if kind == "soins" else "sessions", []):
            out[i.get("nom", "")] = i
    return out


def chemin_html(c, chemins, t, lang, arts):
    """La page d'un chemin : signaux, parcours conseillé en étapes, soins et sessions recommandés, Journal, autres chemins."""
    e = lambda x: htmllib.escape(str(x or ""), quote=True)
    soins, sessions = catalogue_items("soins", lang), catalogue_items("sessions", lang)
    missing = [n for n in c.get("soins", []) + c.get("sessions", []) if n not in soins and n not in sessions]
    if missing:
        print("⚠ chemin %s : introuvable dans les catalogues %s" % (c["slug"], missing))
    rows_soins = "\n".join(soin_row(soins[n], t, lang) for n in c.get("soins", []) if n in soins)
    rows_sessions = "\n".join(session_row(sessions[n], t, lang) for n in c.get("sessions", []) if n in sessions)
    # Bouton d'en-tête : l'étape marquée "principal", sinon la première.
    first = next((s for s in c["etapes"] if s.get("principal")), c["etapes"][0])
    # Le parcours se lit en trois notions (phase : point / experimenter / immerger), sans numéros.
    def step_card(s):
        return ('        <li class="path-step"><h4>%s</h4><p>%s</p>'
                '<p class="path-step__go"><a class="link" href="%s">%s</a>%s</p></li>'
                % (e(s["titre"]), link_products(e(s["texte"]), lang), e(s["url"]), e(s["label"]),
                   ('<span class="path-step__price">%s</span>' % e(s["prix"])) if s.get("prix") else ""))
    groups = []
    for s in c["etapes"]:
        ph = s.get("phase") or "experimenter"
        if ph not in ("point", "experimenter", "immerger"):
            print("⚠ chemin %s : phase inconnue « %s »" % (c["slug"], ph)); ph = "experimenter"
        if groups and groups[-1][0] == ph:
            groups[-1][1].append(s)
        else:
            groups.append((ph, [s]))
    steps = "\n".join(
        '      <li class="path-phase" style="--n:%d"><h3 class="path-phase__name">%s<span class="path-phase__sub">%s</span></h3>\n'
        '      <ul class="path-steps">\n%s\n      </ul></li>'
        % (len(ss), e(t["phase_" + ph]), e(t["phase_" + ph + "_sub"]), "\n".join(step_card(s) for s in ss))
        for ph, ss in groups)
    path_cols = len(c["etapes"])
    by_slug = {a["slug"]: a for a in arts}
    posts = [by_slug[s] for s in c.get("journal", []) if s in by_slug][:3]
    journal = ('<section class="section section--tight" aria-labelledby="cj-title">\n  <div class="wrap">\n'
               '    <h2 id="cj-title" style="font-size:var(--text-xl);margin-bottom:var(--space-lg)">%s</h2>\n'
               '    <div class="posts posts--3">\n%s\n    </div>\n  </div>\n</section>\n'
               % (e(t["chemin_journal"]), "\n".join(post_card(a, t, lang, level=3) for a in posts))) if posts else ""
    others = "\n".join(
        '      <a class="chemin-card" href="chemin-%s.html"><img src="%s" alt="" loading="lazy" decoding="async">'
        '<span class="chemin-card__body"><span class="chemin-card__title">%s</span></span></a>'
        % (e(o["slug"]), e(o["image"]), e(o["titre"])) for o in chemins if o["slug"] != c["slug"])
    signals = "\n".join("      <li>%s</li>" % e(s) for s in c.get("signaux", []))
    return (
        '<header class="wrap page-head">\n'
        '  <ol class="crumbs" aria-label="%(crumbs)s"><li><a href="index.html">%(home)s</a></li><li><a href="index.html#chemins">%(kicker_all)s</a></li><li><span aria-current="page">%(nom)s</span></li></ol>\n'
        '  <h1>%(titre)s</h1>\n'
        '  <p class="chapeau">%(chapeau)s</p>\n'
        '  <div class="actions"><a class="btn" href="%(first_url)s">%(first_label)s</a><a class="link" href="echange-decouverte.html">%(call)s</a></div>\n'
        '</header>\n'
        '<figure class="plate plate--short reveal reveal--scale"><img src="%(image)s" alt="%(image_alt)s" width="1600" height="1000" loading="eager" decoding="async"></figure>\n'
        '<section class="section section--tight" aria-labelledby="cs-title">\n  <div class="wrap doc">\n'
        '    <div><h2 id="cs-title" style="font-size:var(--text-xl)">%(signals_title)s</h2></div>\n'
        '    <ul class="signals">\n%(signals)s\n    </ul>\n  </div>\n</section>\n'
        '<section class="section" aria-labelledby="cp-title">\n  <div class="wrap">\n'
        '    <div class="stack" style="margin-bottom:var(--space-xl)"><p class="insert">%(path_kicker)s</p><h2 id="cp-title">%(path_title)s</h2><p class="muted measure">%(path_intro)s</p></div>\n'
        '    <ol class="path-phases" style="--cols:%(path_cols)d">\n%(steps)s\n    </ol>\n  </div>\n</section>\n'
        '<section class="section section--deep" aria-labelledby="cr-title">\n  <div class="wrap">\n'
        '    <div class="stack" style="margin-bottom:var(--space-lg)"><p class="insert">%(reco_kicker)s</p><h2 id="cr-title">%(reco_title)s</h2><p class="muted measure">%(reco_intro)s</p></div>\n'
        '    <div class="rows rows--compact">\n%(rows_soins)s\n    </div>\n'
        '%(sessions_block)s'
        '    <p class="actions" style="margin-top:var(--space-lg)"><a class="btn btn--line" href="soins.html">%(all_soins)s</a><a class="link" href="sessions.html">%(all_sessions)s</a></p>\n'
        '  </div>\n</section>\n'
        '%(journal)s'
        '<section class="section section--tight" aria-labelledby="cc-title">\n  <div class="wrap"><aside class="post__cta">\n'
        '    <p class="insert" id="cc-title">%(cta_kicker)s</p>\n    <p>%(cta_text)s</p>\n'
        '    <p class="actions"><a class="btn" href="echange-decouverte.html">%(call)s</a><a class="link" href="%(first_url)s">%(first_label)s</a></p>\n'
        '  </aside></div>\n</section>\n'
        '<section class="section section--tight" aria-labelledby="co-title">\n  <div class="wrap">\n'
        '    <h2 id="co-title" style="font-size:var(--text-xl);margin-bottom:var(--space-lg)">%(others_title)s</h2>\n'
        '    <div class="chemins-nav">\n%(others)s\n    </div>\n  </div>\n</section>\n'
        % {
            "crumbs": e(t["crumbs"]), "home": e(t["m_home"]), "kicker_all": e(t["chemin_all"]), "nom": e(c["nom"]),
            "kicker": e(t["chemin_kicker"]), "num": e(c["num"]), "titre": e(c["titre"]), "chapeau": e(c["chapeau"]),
            "first_url": e(first["url"]), "first_label": e(first["label"]), "call": e(t["m_call"]),
            "image": e(c["image"].lstrip("/")), "image_alt": e(c.get("image_alt")), "image_caption": e(c.get("image_caption")),
            "signals_title": e(t["chemin_signals"]), "signals": signals,
            "path_kicker": e(t["chemin_path_kicker"]), "path_title": e(t["chemin_path_title"]), "path_intro": e(t["chemin_path_intro"]), "steps": steps, "path_cols": path_cols,
            "reco_kicker": e(t["chemin_reco_kicker"]), "reco_title": e(t["chemin_reco_title"]), "reco_intro": e(t["chemin_reco_intro"]), "rows_soins": rows_soins,
            "sessions_block": ('    <h3 class="chemin-sub">%s</h3>\n    <div class="rows rows--compact">\n%s\n    </div>\n' % (e(t["chemin_sessions"]), rows_sessions)) if rows_sessions else "",
            "all_soins": e(t["chemin_all_soins"]), "all_sessions": e(t["chemin_all_sessions"]), "journal": journal,
            "cta_kicker": e(t["journal_cta_kicker"]), "cta_text": e(t["journal_cta_default"]), "others_title": e(t["chemin_others"]), "others": others,
        }
    )


def render_journees(t, lang):
    """Les journées et demi-journées, depuis content/journees/<langue>.json : chaque ligne a son bouton Réserver
    (lien Acuity générique tant que les liens par journée ne sont pas fournis)."""
    path = CONTENT / "journees" / ("%s.json" % lang)
    if not path.exists():
        return {}
    e = lambda x: htmllib.escape(str(x or ""), quote=False)
    out = {}
    for c in load_json(path).get("categories", []):
        rows = "\n".join(
            '        <div class="row row--soin"><span class="row__title">%s</span><span class="row__desc">%s</span><span class="row__meta"></span>'
            '%s<span class="row__act">%s</span></div>'
            % (e(i.get("nom")), link_products(e(i.get("description")), lang), price_span(i.get("prix"), t, lang), actions(i, t, lang))
            for i in c.get("prestations", []))
        out["{{JOURNEES_%s}}" % ("DEMI" if c["slug"] == "demi-journees" else "COMPLETES")] = '<div class="rows rows--compact">\n%s\n    </div>' % rows
    return out


def render_temoignages(t, lang):
    """Avis Google et témoignages vidéo, depuis content/temoignages/<langue>.json."""
    path = CONTENT / "temoignages" / ("%s.json" % lang)
    if not path.exists():
        return {}
    d = load_json(path)
    e = lambda x: htmllib.escape(str(x or ""), quote=True)
    def quote_card(a):
        who = e(a["auteur"]) + ('<span class="quote__fmt">, %s</span>' % e(a["format"]) if a.get("format") else "")
        pic = ('<img class="quote__pic" src="%s" width="96" height="96" alt="" loading="lazy" decoding="async">' % e(a["photo"])
               if a.get("photo") else '<span class="quote__pic quote__pic--none" aria-hidden="true">%s</span>' % e(a["auteur"][:1]))
        if a.get("url"):
            footer = ('<a class="quote__who" href="%s" target="_blank" rel="noopener" title="%s">%s<span class="quote__name">%s</span>'
                      '<svg class="i quote__ext" aria-hidden="true"><use href="#i-arrow"/></svg><span class="visually-hidden"> (%s)</span></a>'
                      % (e(a["url"]), e(t["quote_link"]), pic, who, e(t["quote_link"])))
        else:
            footer = '<span class="quote__who">%s<span class="quote__name">%s</span></span>' % (pic, who)
        return '      <blockquote class="quote">\n        <p>%s</p>\n        <footer>%s</footer>\n      </blockquote>' % (e(a["texte"]), footer)
    def quotes(items):
        if not items:
            return ""
        nav = ('<div class="quotes__bar"><p class="vt-kicker">%s</p><div class="quotes__nav">'
               '<button type="button" data-prev aria-label="%s"><svg class="i" aria-hidden="true"><use href="#i-arrow"/></svg></button>'
               '<button type="button" data-next aria-label="%s"><svg class="i" aria-hidden="true"><use href="#i-arrow"/></svg></button></div></div>\n'
               % (e(t["temoin_google_kicker"]), e(t["quotes_prev"]), e(t["quotes_next"])))
        return '<div class="quotes-wrap" data-quotes>\n    ' + nav + '    <div class="quotes" data-stagger>\n' + "\n".join(
            quote_card(a) for a in items) + "\n    </div>\n    </div>"
    def video_block(videos):
        if not videos:
            return ""
        return ('<p class="vt-kicker">%s</p>\n    <div class="vt-grid" data-stagger>\n' % e(t["temoin_video"]) + "\n".join(
            '      <figure class="vt"><button class="vt__play" type="button" data-video="%s" aria-label="%s %s">'
            '<img src="%s" alt="" width="540" height="960" loading="lazy" decoding="async"><span class="vt__icon" aria-hidden="true"></span>%s</button>'
            '<figcaption>%s%s</figcaption></figure>'
            % (e(x["fichier"].lstrip("/")), e(t["temoin_play"]), e(x["auteur"]), e(x["affiche"].lstrip("/")),
               ('<span class="vt__dur">%s</span>' % e(x["duree"])) if x.get("duree") else "",
               e(x["auteur"]), (", " + e(x["format"])) if x.get("format") else "") for x in videos) + "\n    </div>")
    videos = d.get("videos", [])
    link = ('<a class="avis__google" href="%s" target="_blank" rel="noopener"><span class="avis__stars" aria-hidden="true">★★★★★</span>'
            '<strong>%s</strong><span>%s %s</span></a>' % (e(d.get("google_url", "")), e(d.get("google_note", "")), e(d.get("google_nombre", "")), e(t["temoin_reviews"])))
    return {"{{AVIS_GOOGLE}}": quotes(d.get("google", [])), "{{AVIS_SEJOUR}}": quotes([a for a in d.get("google", []) if a.get("sejour")]),
            "{{TEMOIGNAGES_VIDEO}}": video_block([x for x in videos if x.get("accueil")]),
            "{{TEMOIGNAGES_VIDEO_SEJOUR}}": video_block([x for x in videos if x.get("sejour")]), "{{AVIS_GOOGLE_LINK}}": link}


def render_soins(t, lang):
    """Sommaire par catégorie, compteur et groupes de la page Soins, depuis content/soins/<langue>.json.
    Chaque ligne porte ses axes (data-axes), ses étiquettes et ses boutons de réservation."""
    path = CONTENT / "soins" / ("%s.json" % lang)
    if not path.exists():
        return {}
    cats = load_json(path).get("categories", [])
    e = lambda x: htmllib.escape(str(x or ""), quote=False)
    total = sum(len(c.get("prestations", [])) for c in cats)
    groups = []
    for c in cats:
        items = c.get("prestations", [])
        rows = "\n".join(soin_row(i, t, lang) for i in items)
        groups.append(
            '    <section class="cat-group" data-cat="%(s)s" id="%(s)s" aria-labelledby="h-%(s)s">\n%(h)s'
            '      <div class="rows rows--compact">\n%(r)s\n      </div>\n    </section>'
            % {"s": e(c["slug"]), "h": cat_head(c), "r": rows}
        )
    return {
        "{{SOINS_FILTERS}}": anchor_chips(cats, "prestations", t),
        "{{SOINS_STATUS}}": "%d %s" % (total, t["js"]["many"] if total > 1 else t["js"]["one"]),
        "{{SOINS_GROUPS}}": "\n\n".join(groups),
        "{{AXES_PICKER}}": axes_picker(t, lang),
        "{{SOINS_JSONLD}}": soins_jsonld(cats, t, lang),
    }


def horaire(item, t, lang):
    slots = item.get("horaire") or []
    if not slots:
        return t["on_request"]
    def heure(h):
        if lang != "fr":
            return h
        hh, mm = h.split(":")
        return "%sh%s" % (int(hh), "" if mm == "00" else mm)
    return " · ".join("%s %s" % (t["jours"].get(x["jour"], x["jour"]), heure(x["heure"])) for x in slots)


def render_week(cats, t, lang):
    """L'agenda de la semaine, calculé depuis les horaires des sessions : chaque créneau mène à sa ligne réservable."""
    e = lambda x: htmllib.escape(str(x or ""), quote=True)
    days, on_request = {}, []
    for c in cats:
        for i in c.get("sessions", []):
            sid, label = "s-" + slugify(i.get("nom", "")), i.get("nom", "").split(",")[0]
            if not i.get("horaire"):
                on_request.append((label, sid))
                continue
            for x in i["horaire"]:
                h, m = (int(v) for v in x["heure"].split(":"))
                end = h * 60 + m + int(i.get("duree") or 60)
                days.setdefault(x["jour"], []).append((h * 60 + m, label, sid, "%d:%02d-%d:%02d" % (h, m, end // 60, end % 60), i.get("note", "")))
    out = []
    for jour in ("lun", "mar", "mer", "jeu", "ven", "sam", "dim"):
        if jour not in days:
            continue
        lis = "\n".join('          <li><a href="#%s">%s%s</a><time>%s</time></li>'
                        % (sid, e(label), ' <span class="note">%s</span>' % e(note) if note else "", when)
                        for _, label, sid, when, note in sorted(days[jour]))
        out.append('      <div class="day">\n        <h3 class="day__name">%s</h3>\n        <ul class="day__slots">\n%s\n        </ul>\n      </div>'
                   % (e(t["jours"][jour].capitalize()), lis))
    html = '    <div class="week">\n%s\n    </div>' % "\n".join(out)
    if on_request:
        html += '\n    <p class="week__note muted">%s : %s</p>' % (
            e(t["on_request"][:1].upper() + t["on_request"][1:]), ", ".join('<a href="#%s">%s</a>' % (sid, e(label)) for label, sid in on_request))
    return html


def render_sessions(t, lang, today):
    """Les sessions collectives réservables, depuis content/sessions/<langue>.json : horaire sous le nom,
    prix de la session, Pack 5+1 et Abonnement."""
    path = CONTENT / "sessions" / ("%s.json" % lang)
    if not path.exists():
        return {}
    cats = load_json(path).get("categories", [])
    e = lambda x: htmllib.escape(str(x or ""), quote=False)
    total = sum(len(c.get("sessions", [])) for c in cats)
    groups = []
    for c in cats:
        rows = "\n".join(session_row(i, t, lang) for i in c.get("sessions", []))
        groups.append(
            '    <section class="cat-group" data-cat="%(s)s" id="%(s)s" aria-labelledby="h-%(s)s">\n%(h)s'
            '      <div class="rows rows--compact">\n%(r)s\n      </div>\n    </section>'
            % {"s": e(c["slug"]), "h": cat_head(c), "r": rows}
        )
    return {
        "{{SESSIONS_FILTERS}}": anchor_chips(cats, "sessions", t),
        "{{SESSIONS_STATUS}}": "%d %s" % (total, t["js"]["session_many"] if total > 1 else t["js"]["session_one"]),
        "{{SESSIONS_GROUPS}}": "\n\n".join(groups),
        "{{SESSIONS_JSONLD}}": sessions_jsonld(cats, t, lang, today),
        "{{SESSIONS_WEEK}}": render_week(cats, t, lang),
    }


# ---------- Données structurées des catalogues ----------

ORG = {"@type": "HealthAndBeautyBusiness", "name": "hoona", "url": SITE_URL + "/",
       "address": {"@type": "PostalAddress", "streetAddress": "Elisabethlaan 6", "postalCode": "3080", "addressLocality": "Tervuren", "addressCountry": "BE"}}
PLACE = {"@type": "Place", "name": "hoona", "address": ORG["address"]}
TZ = ZoneInfo("Europe/Brussels")
DOW = {"lun": 0, "mar": 1, "mer": 2, "jeu": 3, "ven": 4, "sam": 5, "dim": 6}
SCHEMA_DAY = {"lun": "Monday", "mar": "Tuesday", "mer": "Wednesday", "jeu": "Thursday", "ven": "Friday", "sam": "Saturday", "dim": "Sunday"}


def jsonld(obj):
    return '<script type="application/ld+json">\n%s\n</script>' % json.dumps(obj, ensure_ascii=False, separators=(",", ":"))


def offer(price, url, lang, page):
    o = {"@type": "Offer", "price": int(price), "priceCurrency": "EUR", "availability": "https://schema.org/InStock"}
    o["url"] = url if (url or "").startswith("http") else "%s/%s/%s.html" % (SITE_URL, lang, page)
    return o


def soins_jsonld(cats, t, lang):
    items = []
    for c in cats:
        for i in c.get("prestations", []):
            if i.get("prix") in (None, ""):
                continue
            svc = {"@type": "Service", "name": i.get("nom"), "description": i.get("description") or "", "provider": ORG,
                   "serviceType": c.get("nom"), "offers": [offer(i["prix"], i.get("url"), lang, "soins")]}
            if i.get("pack"):
                svc["offers"].append(dict(offer(i["pack"], i.get("url_pack"), lang, "soins"), name=t["pack_label"]))
            items.append(svc)
    return jsonld({"@context": "https://schema.org", "@type": "ItemList", "name": t["m_soins"], "numberOfItems": len(items),
                   "itemListElement": [{"@type": "ListItem", "position": n + 1, "item": it} for n, it in enumerate(items)]})


def sessions_jsonld(cats, t, lang, today):
    """Un Event par session hebdomadaire, daté de sa prochaine occurrence, avec son horaire récurrent."""
    items = []
    for c in cats:
        for i in c.get("sessions", []):
            if not i.get("horaire"):
                continue
            slot = min(i["horaire"], key=lambda x: ((DOW.get(x["jour"], 0) - today.weekday()) % 7, x["heure"]))
            delta = (DOW.get(slot["jour"], 0) - today.weekday()) % 7
            h, m = (int(x) for x in slot["heure"].split(":"))
            start = dt.datetime.combine(today + dt.timedelta(days=delta), dt.time(h, m), tzinfo=TZ)
            end = start + dt.timedelta(minutes=int(i.get("duree") or 60))
            ev = {"@type": "Event", "name": i.get("nom"), "description": i.get("description") or "",
                  "startDate": start.isoformat(), "endDate": end.isoformat(),
                  "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode", "eventStatus": "https://schema.org/EventScheduled",
                  "location": PLACE, "organizer": ORG, "inLanguage": ["fr", "en"],
                  "eventSchedule": [{"@type": "Schedule", "repeatFrequency": "P1W", "byDay": "https://schema.org/" + SCHEMA_DAY.get(x["jour"], "Monday"),
                                     "startTime": x["heure"] if len(x["heure"]) == 5 else "0" + x["heure"], "scheduleTimezone": "Europe/Brussels"} for x in i["horaire"]]}
            if i.get("prix") not in (None, ""):
                ev["offers"] = [offer(i["prix"], i.get("url"), lang, "sessions")]
                if i.get("pack"):
                    ev["offers"].append(dict(offer(i["pack"], i.get("url_pack"), lang, "sessions"), name=t["pack_label"]))
                if i.get("abo"):
                    ev["offers"].append(dict(offer(i["abo"], i.get("url_abo"), lang, "sessions"), name=t["abo_label"]))
            items.append(ev)
    return jsonld({"@context": "https://schema.org", "@type": "ItemList", "name": t["m_sessions"], "numberOfItems": len(items),
                   "itemListElement": [{"@type": "ListItem", "position": n + 1, "item": it} for n, it in enumerate(items)]})


# ---------- Journal ----------

JOURNAL = CONTENT / "journal"


def slugify(s):
    s = unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", s)).strip("-")


def parse_md_front_matter(text):
    """En-tête YAML minimal : `clé: valeur`, listes `[a, b]` ou `- a` sur les lignes suivantes."""
    meta, key = {}, None
    m = re.match(r"\s*---[ \t]*\n(.*?)\n---[ \t]*\n", text, re.S)
    if not m:
        return meta, text
    for line in m.group(1).splitlines():
        if re.match(r"^\s+-\s+", line) and key:
            meta[key] = (meta[key] if isinstance(meta[key], list) else []) + [line.split("-", 1)[1].strip().strip("'\"")]
        elif ":" in line and not line.startswith(" "):
            key, v = line.split(":", 1)
            key, v = key.strip().lower(), v.strip()
            if v.startswith("[") and v.endswith("]"):
                v = [x.strip().strip("'\"") for x in v[1:-1].split(",") if x.strip()]
            else:
                v = v.strip("'\"")
            meta[key] = v
    return meta, text[m.end():]


def md_inline(s):
    s = htmllib.escape(s, quote=False)
    s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)
    s = re.sub(r"(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?!\w)", r"<em>\1</em>", s)
    s = re.sub(r"\[([^\]]+)\]\(([^)\s]+)\)", r'<a href="\2">\1</a>', s)
    return s


def md_to_html(md):
    """Markdown réduit : titres ##/###, paragraphes, listes, citations (dernière ligne `-- Auteur`), images, liens, gras, italique."""
    out, para, lines, i = [], [], md.replace("\r\n", "\n").split("\n"), 0
    bullet = re.compile(r"^([-*]|\d+[.)])\s+(.*)")

    def flush():
        if para:
            out.append("<p>%s</p>" % md_inline(" ".join(x.strip() for x in para)))
            del para[:]

    while i < len(lines):
        s = lines[i].strip()
        if not s:
            flush(); i += 1; continue
        m = re.match(r"^(#{2,4})\s+(.*)", s)
        if m:
            flush()
            lvl, txt = len(m.group(1)), m.group(2).strip()
            out.append('<h%d id="%s">%s</h%d>' % (lvl, slugify(txt), md_inline(txt), lvl)); i += 1; continue
        m = re.match(r'^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)$', s)
        if m:
            flush()
            cap = "<figcaption>%s</figcaption>" % md_inline(m.group(3)) if m.group(3) else ""
            out.append('<figure><img src="%s" alt="%s" loading="lazy" decoding="async">%s</figure>'
                       % (m.group(2), htmllib.escape(m.group(1), quote=True), cap)); i += 1; continue
        if s.startswith(">"):
            flush()
            q = []
            while i < len(lines) and lines[i].strip().startswith(">"):
                q.append(lines[i].strip()[1:].strip()); i += 1
            foot = "<footer>%s</footer>" % md_inline(q.pop()[3:]) if q and q[-1].startswith("-- ") else ""
            paras = [x.strip() for x in re.split(r"\n\s*\n", "\n".join(q)) if x.strip()]
            out.append("<blockquote>%s%s</blockquote>" % ("".join("<p>%s</p>" % md_inline(x.replace("\n", " ")) for x in paras), foot)); continue
        m = bullet.match(s)
        if m:
            flush()
            ordered, items = m.group(1)[0].isdigit(), []
            while i < len(lines) and bullet.match(lines[i].strip()):
                items.append(md_inline(bullet.match(lines[i].strip()).group(2))); i += 1
            tag = "ol" if ordered else "ul"
            out.append("<%s>%s</%s>" % (tag, "".join("<li>%s</li>" % x for x in items), tag)); continue
        para.append(s); i += 1
    flush()
    return "\n".join(out)


def fmt_date(day, t, lang):
    n = ("1er" if day.day == 1 else str(day.day)) if lang == "fr" else str(day.day)
    return "%s %s %d" % (n, t["months"][day.month - 1], day.year)


def load_articles(lang, today):
    """Les articles publiés d'une langue, du plus récent au plus ancien."""
    folder = JOURNAL / lang
    if not folder.is_dir():
        return []
    arts = []
    for p in sorted(folder.glob("*.md")):
        meta, body = parse_md_front_matter(p.read_text(encoding="utf-8"))
        if str(meta.get("draft", "")).lower() == "true":
            continue
        day = d(str(meta.get("date", today))[:10])
        if day > today:
            continue
        html = md_to_html(body)
        words = len(re.sub(r"<[^>]+>", " ", html).split())
        axes = meta.get("axes") or []
        arts.append({
            "slug": p.stem, "title": meta.get("title", p.stem), "description": meta.get("description", ""),
            "date": day, "axes": [a for a in ([axes] if isinstance(axes, str) else axes) if a in AXES],
            "image": (meta.get("image", "") or "").lstrip("/"), "image_alt": meta.get("image_alt", ""), "image_caption": meta.get("image_caption", ""),
            "author": meta.get("author", "hoona"), "cta_label": meta.get("cta_label", ""), "cta_url": meta.get("cta_url", ""),
            "cta_text": meta.get("cta_text", ""), "html": html, "minutes": max(1, round(words / 200)),
        })
    return sorted(arts, key=lambda a: (a["date"], a["slug"]), reverse=True)


def post_card(a, t, lang, level=2):
    e = lambda x: htmllib.escape(str(x or ""), quote=True)
    img = ('<img src="%s" alt="%s" loading="lazy" decoding="async">' % (e(a["image"]), e(a["image_alt"]))) if a["image"] else ""
    return (
        '<article class="post-card item" data-axes="%s">\n'
        '  <a class="post-card__link" href="journal/%s.html">\n'
        '    <figure class="post-card__media">%s</figure>\n'
        '    <p class="post-card__meta">%s<time datetime="%s">%s</time><span>%d %s</span></p>\n'
        '    <h%d class="post-card__title">%s</h%d>\n'
        '    <p class="post-card__desc">%s</p>\n'
        '  </a>\n</article>'
        % (" ".join(a["axes"]), e(a["slug"]), img, axes_tags(a, t), a["date"].isoformat(), fmt_date(a["date"], t, lang),
           a["minutes"], e(t["journal_min"]), level, e(a["title"]), level, e(a["description"]))
    )


def article_jsonld(a, t, lang):
    url = "%s/%s/journal/%s.html" % (SITE_URL, lang, a["slug"])
    author = ({"@type": "Person", "name": a["author"], "jobTitle": t["journal_founder"]} if a["author"] == "Olivia De Stoop"
              else {"@type": "Organization", "name": "hoona", "url": SITE_URL + "/"})
    obj = {"@context": "https://schema.org", "@type": "BlogPosting", "headline": a["title"], "description": a["description"],
           "datePublished": a["date"].isoformat(), "dateModified": a["date"].isoformat(), "inLanguage": lang, "url": url,
           "mainEntityOfPage": {"@type": "WebPage", "@id": url}, "author": author,
           "publisher": {"@type": "Organization", "name": "hoona", "url": SITE_URL + "/",
                         "logo": {"@type": "ImageObject", "url": SITE_URL + "/assets/img/logo-hoona.svg"}},
           "keywords": [t["axes"][x] for x in a["axes"]], "articleSection": t["m_journal"]}
    if a["image"]:
        obj["image"] = SITE_URL + "/" + a["image"]
    return jsonld(obj)


def article_html(a, arts, t, lang):
    """La page d'un article : en-tête, photo, texte, appel à l'action, « à lire aussi »."""
    e = lambda x: htmllib.escape(str(x or ""), quote=True)
    related = [b for b in arts if b["slug"] != a["slug"] and set(b["axes"]) & set(a["axes"])]
    related += [b for b in arts if b["slug"] != a["slug"] and b not in related]
    figure = ""
    if a["image"]:
        figure = ('<figure class="plate plate--short reveal reveal--scale"><img src="%s" alt="%s" width="1600" height="1000" loading="eager" decoding="async">%s</figure>'
                  % (e(a["image"]), e(a["image_alt"]), ""))
    cta_url = a["cta_url"] or "echange-decouverte.html"
    cta_label = a["cta_label"] or t["call"]
    cta_text = a["cta_text"] or t["journal_cta_default"]
    ext = ' target="_blank" rel="noopener"' if cta_url.startswith("http") else ""
    return (
        '<header class="wrap page-head page-head--compact post__head">\n'
        '  <ol class="crumbs" aria-label="%(crumbs)s"><li><a href="index.html">%(home)s</a></li><li><a href="journal.html">%(journal)s</a></li><li><span aria-current="page">%(title)s</span></li></ol>\n'
        '  <p class="post__meta">%(tags)s<time datetime="%(iso)s">%(date)s</time><span>%(min)d %(minlbl)s</span></p>\n'
        '  <h1>%(title)s</h1>\n'
        '  <p class="chapeau">%(desc)s</p>\n'
        '</header>\n%(figure)s\n'
        '<div class="wrap doc section--tight post" style="padding-top:var(--space-lg)">\n'
        '  <aside class="post__aside">\n'
        '    <p><span class="post__label">%(bylbl)s</span>%(author)s</p>\n'
        '    <p><span class="post__label">%(axeslbl)s</span>%(axes)s</p>\n'
        '    <p><a class="link" href="journal.html">%(back)s</a></p>\n'
        '  </aside>\n'
        '  <article class="prose post__body">\n%(body)s\n'
        '    <p class="post__sign">%(sign)s</p>\n'
        '  </article>\n'
        '</div>\n'
        '<section class="section section--tight" aria-labelledby="post-cta-title">\n'
        '  <div class="wrap"><aside class="post__cta">\n'
        '    <p class="insert" id="post-cta-title">%(ctakick)s</p>\n'
        '    <p>%(ctatext)s</p>\n'
        '    <p class="actions"><a class="btn" href="%(ctaurl)s"%(ext)s>%(ctalabel)s</a><a class="link" href="journal.html">%(back)s</a></p>\n'
        '  </aside></div>\n'
        '</section>\n'
        '%(related)s'
        '%(jsonld)s'
        % {
            "crumbs": e(t["crumbs"]), "home": e(t["m_home"]), "journal": e(t["m_journal"]), "title": e(a["title"]),
            "tags": axes_tags(a, t), "iso": a["date"].isoformat(), "date": fmt_date(a["date"], t, lang), "min": a["minutes"],
            "minlbl": e(t["journal_min"]), "desc": e(a["description"]), "figure": figure,
            "bylbl": e(t["journal_by"]), "author": e(a["author"]), "axeslbl": e(t["journal_axes"]),
            "axes": ", ".join(e(t["axes"][x]) for x in a["axes"]) or e(t["axes_all_tag"]), "back": e(t["journal_back"]),
            "body": a["html"], "sign": e(t["journal_sign"]),
            "ctakick": e(t["journal_cta_kicker"]), "ctatext": e(cta_text), "ctaurl": e(cta_url), "ext": ext, "ctalabel": e(cta_label),
            "related": ('<section class="section section--deep" aria-labelledby="related-title">\n  <div class="wrap">\n'
                        '    <h2 id="related-title" style="font-size:var(--text-xl);margin-bottom:var(--space-lg)">%s</h2>\n'
                        '    <div class="posts posts--3">\n%s\n    </div>\n  </div>\n</section>\n'
                        % (e(t["journal_more"]), "\n".join(post_card(b, t, lang, level=3) for b in related[:3]))) if related else "",
            "jsonld": article_jsonld(a, t, lang),
        }
    )


def render_journal(arts, t, lang):
    """Jetons de la page journal.html : filtres par axe, cartes, compteur, données structurées."""
    e = lambda x: htmllib.escape(str(x or ""), quote=True)
    if not arts:
        return {"{{JOURNAL_FILTERS}}": "", "{{JOURNAL_CARDS}}": "", "{{JOURNAL_COUNT}}": "", "{{JOURNAL_JSONLD}}": ""}
    counts = {a: sum(1 for x in arts if a in x["axes"]) for a in AXES}
    chips = ['<button class="chip" type="button" data-axis="" aria-pressed="true">%s<span class="count">%d</span></button>' % (e(t["journal_all"]), len(arts))]
    chips += ['<button class="chip" type="button" data-axis="%s" aria-pressed="false">%s<span class="count">%d</span></button>' % (a, e(t["axes"][a]), counts[a])
              for a in AXES if counts[a]]
    blog = {"@context": "https://schema.org", "@type": "Blog", "name": t["journal_title"], "description": t["journal_desc"],
            "url": "%s/%s/journal.html" % (SITE_URL, lang), "inLanguage": lang, "publisher": ORG,
            "blogPost": [{"@type": "BlogPosting", "headline": a["title"], "url": "%s/%s/journal/%s.html" % (SITE_URL, lang, a["slug"]),
                          "datePublished": a["date"].isoformat()} for a in arts]}
    return {
        "{{JOURNAL_FILTERS}}": "\n      ".join(chips),
        "{{JOURNAL_CARDS}}": "\n".join(post_card(a, t, lang) for a in arts),
        "{{JOURNAL_COUNT}}": "%d %s" % (len(arts), t["journal_one"] if len(arts) == 1 else t["journal_many"]),
        "{{JOURNAL_JSONLD}}": jsonld(blog),
    }


def rss(arts, t, lang):
    e = lambda x: htmllib.escape(str(x or ""), quote=False)
    base = "%s/%s/" % (SITE_URL, lang)
    items = []
    for a in arts[:20]:
        pub = dt.datetime.combine(a["date"], dt.time(8, 0), tzinfo=TZ).strftime("%a, %d %b %Y %H:%M:%S %z")
        cats = "".join("<category>%s</category>" % e(t["axes"][x]) for x in a["axes"])
        img = '<enclosure url="%s/%s" type="image/%s" length="0"/>' % (SITE_URL, a["image"], "webp" if a["image"].endswith(".webp") else "jpeg") if a["image"] else ""
        items.append("<item><title>%s</title><link>%sjournal/%s.html</link><guid isPermaLink=\"true\">%sjournal/%s.html</guid>"
                     "<pubDate>%s</pubDate><description>%s</description>%s%s</item>"
                     % (e(a["title"]), base, a["slug"], base, a["slug"], pub, e(a["description"]), cats, img))
    return ('<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n<channel>\n'
            '<title>%s</title>\n<link>%sjournal.html</link>\n<atom:link href="%sjournal.xml" rel="self" type="application/rss+xml"/>\n'
            '<description>%s</description>\n<language>%s</language>\n%s\n</channel>\n</rss>\n'
            % (e(t["journal_title"]), base, base, e(t["journal_desc"]), {"fr": "fr-be", "nl": "nl-be", "en": "en"}[lang], "\n".join(items)))


# ---------- Mise en forme ----------

def typographie(html, lang):
    """Apostrophes typographiques partout ; espaces insécables à la française en fr.
    Ne touche qu'au texte visible (hors balises, scripts et styles)."""
    parts = re.split(r"(<script.*?</script>|<style.*?</style>|<[^>]+>)", html, flags=re.S)
    for i in range(0, len(parts), 2):
        s = parts[i].replace("'", "’")
        if lang == "fr":
            s = s.replace("« ", "« ")
            s = re.sub(r" (»)", " \\1", s)
            s = re.sub(r" ([:;?!])", " \\1", s)
        parts[i] = s
    return "".join(parts)


def lang_switch(t, lang, page, available, depth=0):
    """Sélecteur de langue : uniquement les langues où cette page existe."""
    langs = [l for l in LANGS if page in available[l]]
    if len(langs) < 2:
        return ""
    links = "".join(
        '<a href="%s%s/%s.html" hreflang="%s" lang="%s"%s>%s</a>'
        % ("../" * (depth + 1), l, page, l, l, ' aria-current="true"' if l == lang else "", l.upper())
        for l in langs
    )
    return '<nav class="langs" aria-label="%s">%s</nav>' % (htmllib.escape(t["lang_switch"]), links)


def hreflang(page, available):
    tags = [
        '<link rel="alternate" hreflang="%s" href="%s/%s/%s.html">' % (l, SITE_URL, l, page)
        for l in LANGS if page in available[l]
    ]
    if page in available[DEFAULT_LANG]:
        tags.append('<link rel="alternate" hreflang="x-default" href="%s/%s/%s.html">' % (SITE_URL, DEFAULT_LANG, page))
    return "\n".join(tags)


def parse_front_matter(text):
    """Lit un en-tête `<!-- clé: valeur -->` en tête de fichier."""
    meta = {}
    m = re.match(r"\s*<!--\s*(.*?)\s*-->\s*", text, re.S)
    if m:
        for line in m.group(1).splitlines():
            if ":" in line:
                k, v = line.split(":", 1)
                meta[k.strip().lower()] = v.strip()
        text = text[m.end():]
    return meta, text


# Charte éditoriale hoona : vocabulaire à bannir (contrôlé sur le français).
BANNED_FR = re.compile(
    r"\b(soigner|soigne|traiter|traitement|diagnostic|patients?|guérir|guérison|"
    r"ordonnance|convalescence|cours collectifs?|il faut)\b",
    re.I,
)
# Les mêmes interdits, transposés en anglais et en néerlandais.
# (« sound healing » reste toléré : c'est le nom de la pratique, employé tel quel en français.)
BANNED = {
    "fr": BANNED_FR,
    "en": re.compile(
        r"\b(treat\w*|cure[sd]?|curing|heal(s|ed)?|patients?|diagnos\w*|prescription\w*|"
        r"convalescen\w*|group class(es)?|you must|you have to)\b",
        re.I,
    ),
    "nl": re.compile(
        r"\b(behandel\w*|genez\w*|geneest|genees\w*|patiënt\w*|diagnos\w*|voorschrift\w*|"
        r"convalescentie|groepsles(sen)?|je moet|u moet)\b",
        re.I,
    ),
}


def page_jsonld(html, lang, depth):
    """FAQPage depuis les blocs <details> de la page, BreadcrumbList depuis le fil d'Ariane."""
    strip = lambda x: re.sub(r"\s+", " ", htmllib.unescape(re.sub(r"<[^>]+>", " ", x))).strip()
    out = []
    faqs = re.findall(r'<details>\s*<summary>(.*?)</summary>\s*<div class="answer">(.*?)</div>\s*</details>', html, re.S)
    if faqs:
        out.append(jsonld({"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [
            {"@type": "Question", "name": strip(q), "acceptedAnswer": {"@type": "Answer", "text": strip(a)}} for q, a in faqs]}))
    m = re.search(r'<ol class="crumbs"[^>]*>(.*?)</ol>', html, re.S)
    if m:
        items = []
        for li in re.findall(r"<li>(.*?)</li>", m.group(1), re.S):
            a = re.search(r'href="([^"]+)"', li)
            href = a.group(1) if a else None
            if href and not href.startswith("http"):
                href = "%s/%s/%s" % (SITE_URL, lang, re.sub(r"^(\.\./)+", "", href))
            item = {"@type": "ListItem", "position": len(items) + 1, "name": strip(li)}
            if href:
                item["item"] = href
            items.append(item)
        if len(items) > 1:
            out.append(jsonld({"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": items}))
    return "\n".join(out) + ("\n" if out else "")


def meta_desc(text, limit=160):
    """Une description qui tient dans les résultats de recherche : coupée à la dernière phrase complète sous la limite."""
    text = " ".join(str(text or "").split())
    if len(text) <= limit:
        return text
    cut = max(text.rfind(". ", 0, limit), text.rfind(" : ", 0, limit), text.rfind(", ", 0, limit))
    return (text[:cut + 1] if cut > 60 else text[:limit - 1]).rstrip(" ,:") + ("" if text[:cut + 1].endswith(".") and cut > 60 else "…")


def render_page(lang, t, page_id, meta, content, tokens, available, outpath, warnings, depth=0):
    """Habille un contenu du gabarit, remplace les jetons, corrige la typographie et contrôle la charte.
    `depth` : profondeur du fichier sous /<langue>/ (0 pour les pages, 1 pour journal/<slug>.html) ;
    les liens relatifs et les médias sont réécrits en conséquence."""
    html = LAYOUT.replace("{{CONTENT}}", content.rstrip() + "\n")
    html = html.replace("{{TITLE}}", meta.get("title", "hoona"))
    html = html.replace("{{DESC}}", meta.get("description", ""))
    html = html.replace("{{PAGE}}", page_id.replace("/", "-"))
    html = html.replace("{{HEADER}}", meta.get("header", "solid"))
    html = html.replace("{{ROBOTS}}", '<meta name="robots" content="noindex, nofollow">' if meta.get("noindex") == "true" else "")
    html = html.replace("{{CANONICAL}}", "%s/%s/%s.html" % (SITE_URL, lang, page_id))
    html = html.replace("{{HREFLANG}}", hreflang(page_id, available))
    html = html.replace("{{LANGSWITCH}}", lang_switch(t, lang, page_id, available, depth))
    active = meta.get("nav", "").upper()
    for key in NAV_KEYS:
        html = html.replace("{{CUR_%s}}" % key, 'aria-current="page"' if key == active else "")
    for group, members in NAV_GROUPS.items():
        html = html.replace("{{CUR_G_%s}}" % group, 'aria-current="page"' if active in members else "")
    for k, v in tokens.items():
        html = html.replace(k, v)
    html = re.sub(r"\{\{t:([a-z0-9_]+)\}\}", lambda m: htmllib.escape(t[m.group(1)], quote=True), html)
    # Les pages vivent dans /<langue>/ : les médias partagés sont un niveau plus haut.
    up = "../" * (depth + 1)
    html = re.sub(r'((?:src|href|data-src|data-src-webm|content)=")assets/', r"\g<1>%s" % up + "assets/", html)
    if depth:
        # Les liens internes sont écrits depuis la racine de la langue : on remonte d'autant.
        html = re.sub(r'(href=")((?:[a-z0-9-]+/)*[a-z0-9-]+\.html(?:[?#][^"]*)?")', r"\g<1>%s\g<2>" % ("../" * depth), html)
    html = html.replace("</main>", page_jsonld(html, lang, depth) + "</main>", 1)
    parts = re.split(r'(<script type="application/ld\+json">.*?</script>)', html, flags=re.S)
    html = "".join(x if x.startswith('<script type="application/ld+json">') else typographie(x, lang) for x in parts)

    name = "%s/%s.html" % (lang, page_id)
    missing = re.findall(r"\{\{[^}]+\}\}", html)
    if missing:
        warnings.append("%s : jetons non remplacés %s" % (name, sorted(set(missing))))
    for ch in ("—", "–"):
        if ch in html:
            warnings.append("%s : tiret long %r" % (name, ch))
    if lang in BANNED:
        visible = re.sub(r"<[^>]+>", " ", html)
        for m in BANNED[lang].finditer(visible):
            warnings.append("%s : « %s » (charte éditoriale)" % (name, m.group(0)))
    outpath.parent.mkdir(parents=True, exist_ok=True)
    outpath.write_text(html, encoding="utf-8")
    return name


def build():
    today = dt.date.today()
    articles = {l: load_articles(l, today) for l in LANGS}
    chemins = {l: (load_json(CONTENT / "chemins" / ("%s.json" % l)).get("chemins", []) if (CONTENT / "chemins" / ("%s.json" % l)).exists() else []) for l in LANGS}
    available = {
        l: ({p.stem for p in (SRC / "pages" / l).glob("*.html")} if (SRC / "pages" / l).is_dir() else set())
           | {"journal/%s" % a["slug"] for a in articles[l]} | {"chemin-%s" % c["slug"] for c in chemins[l]}
        for l in LANGS
    }
    for l in LANGS:
        if not articles[l]:
            available[l].discard("journal")
    if not available[DEFAULT_LANG]:
        sys.exit("src/pages/%s introuvable" % DEFAULT_LANG)

    built, warnings, sitemap = [], [], []
    langs_live = [l for l in LANGS if available[l]]

    for lang in langs_live:
        t = json.loads((SRC / "i18n" / ("%s.json" % lang)).read_text(encoding="utf-8"))
        outdir = ROOT / lang
        if outdir.exists():
            shutil.rmtree(outdir)
        outdir.mkdir()
        arts = articles[lang]

        tokens = {
            "{{SEJOUR_NEXT}}": render_next(t, lang, today),
            "{{SEJOURS_NEXT3}}": render_next3(t, lang, today),
            "{{SEJOURS_CALENDAR}}": render_calendar(
                t, lang, today,
                "reserver-sejour.html?sejour=%s" if "reserver-sejour" in available[lang] else "contact.html?sejour=%s#reserver"),
            "{{SEJOURS_OPTIONS}}": render_options(t, lang, today),
            "{{YEAR}}": str(today.year),
            "{{FLOWER}}": flower(lang),
            "{{LANG}}": lang,
            "{{JS_I18N}}": json.dumps(dict(t["js"], lang=lang), ensure_ascii=False),
            "{{JOURNAL_LI}}": '<li><a href="journal.html">%s</a></li>' % htmllib.escape(t["m_journal"], quote=True) if arts else "",
            "{{FOOT_PLUS_LI}}": "".join('<li><a href="%s.html">%s</a></li>' % (pg, htmllib.escape(t[key], quote=True))
                                        for pg, key in (("entreprises", "m_entreprises"), ("hoona-soutien", "m_soutien")) if pg in available[lang]),
            "{{RSS_LINK}}": ('<link rel="alternate" type="application/rss+xml" title="%s" href="%s/%s/journal.xml">'
                             % (htmllib.escape(t["journal_title"], quote=True), SITE_URL, lang)) if arts else "",
        }
        tokens.update(render_soins(t, lang))
        tokens.update(render_sessions(t, lang, today))
        tokens.update(render_journees(t, lang))
        tokens.update(render_temoignages(t, lang))
        tokens.update(render_journal(arts, t, lang))

        for page in sorted((SRC / "pages" / lang).glob("*.html")):
            meta, content = parse_front_matter(page.read_text(encoding="utf-8"))
            if page.stem == "journal" and not arts:
                continue  # pas d'article dans cette langue : pas de page Journal
            built.append(render_page(lang, t, page.stem, meta, content, tokens, available, outdir / page.name, warnings))
            if meta.get("noindex") != "true":
                sitemap.append(("%s/%s/%s.html" % (SITE_URL, lang, page.stem), today.isoformat(), page.stem, lang))

        for a in arts:
            meta = {"title": "%s | hoona" % a["title"], "description": meta_desc(a["description"]), "nav": "JOURNAL"}
            built.append(render_page(lang, t, "journal/%s" % a["slug"], meta, article_html(a, arts, t, lang), tokens, available,
                                     outdir / "journal" / ("%s.html" % a["slug"]), warnings, depth=1))
            sitemap.append(("%s/%s/journal/%s.html" % (SITE_URL, lang, a["slug"]), a["date"].isoformat(), "journal/%s" % a["slug"], lang))
        if arts:
            (outdir / "journal.xml").write_text(rss(arts, t, lang), encoding="utf-8")

        for c in chemins[lang]:
            meta = {"title": "%s | hoona" % c["titre"], "description": meta_desc(c["chapeau"]), "nav": "CHEMINS"}
            built.append(render_page(lang, t, "chemin-%s" % c["slug"], meta, chemin_html(c, chemins[lang], t, lang, arts), tokens, available,
                                     outdir / ("chemin-%s.html" % c["slug"]), warnings))
            sitemap.append(("%s/%s/chemin-%s.html" % (SITE_URL, lang, c["slug"]), today.isoformat(), "chemin-%s" % c["slug"], lang))

    # sitemap.xml : une entrée par page indexable, avec ses versions linguistiques.
    urls = []
    for loc, lastmod, page_id, lang in sitemap:
        alts = "".join('<xhtml:link rel="alternate" hreflang="%s" href="%s/%s/%s.html"/>' % (l, SITE_URL, l, page_id)
                       for l in LANGS if page_id in available[l])
        urls.append("<url><loc>%s</loc><lastmod>%s</lastmod>%s</url>" % (loc, lastmod, alts))
    (ROOT / "sitemap.xml").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n%s\n</urlset>\n'
        % "\n".join(urls), encoding="utf-8")

    # Aiguillage racine : la langue du navigateur si elle est publiée, sinon le français.
    (ROOT / "index.html").write_text(
        """<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>hoona</title>
<meta name="robots" content="noindex">
<link rel="canonical" href="%(site)s/%(d)s/index.html">
<script>(function(){var a=%(langs)s,n=navigator.languages||[navigator.language||""];
for(var i=0;i<n.length;i++){var l=(n[i]||"").slice(0,2).toLowerCase();if(a.indexOf(l)>-1){location.replace(l+"/index.html");return;}}
location.replace("%(d)s/index.html");})();</script>
<noscript><meta http-equiv="refresh" content="0; url=%(d)s/index.html"></noscript>
</head><body><p><a href="%(d)s/index.html">hoona</a></p></body></html>
""" % {"d": DEFAULT_LANG, "site": SITE_URL, "langs": json.dumps(langs_live)},
        encoding="utf-8",
    )

    print("Généré : " + ", ".join(built))
    if warnings:
        print("⚠ À vérifier :\n  " + "\n  ".join(warnings))

    # dist/ = ce qui part en ligne.
    if DIST.exists():
        shutil.rmtree(DIST)
    DIST.mkdir()
    shutil.copy2(ROOT / "index.html", DIST / "index.html")
    for lang in langs_live:
        shutil.copytree(ROOT / lang, DIST / lang)
    # symlinks=False : les médias partagés avec la v2 sont copiés en dur.
    shutil.copytree(ROOT / "assets", DIST / "assets", symlinks=False)
    for extra in ("_headers", "robots.txt", "sitemap.xml", "llms.txt"):
        if (ROOT / extra).exists():
            shutil.copy2(ROOT / extra, DIST / extra)
    print("dist/ prêt pour la mise en ligne")


def watch():
    """Reconstruit le site dès qu'un fichier de src/ ou content/ change (édition dans le CMS)."""
    def stamp():
        return max((f.stat().st_mtime for d in (SRC, CONTENT) for f in d.rglob("*") if f.is_file()), default=0)
    last = None
    print("Surveillance de src/ et content/ (Ctrl+C pour arrêter)…")
    while True:
        now = stamp()
        if now != last:
            last = now
            global LAYOUT
            LAYOUT = (SRC / "layout.html").read_text(encoding="utf-8")
            try:
                build()
            except Exception as exc:  # un JSON en cours d'écriture ne doit pas arrêter la surveillance
                print("⚠ build interrompu :", exc)
        time.sleep(1)


if __name__ == "__main__":
    watch() if "--watch" in sys.argv else build()
