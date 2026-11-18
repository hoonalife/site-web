/* hoona v6 : comportements du site. Aucune dépendance. */
(function () {
  "use strict";
  var doc = document.documentElement;
  var head = document.getElementById("site-head");
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  /* Textes de l'interface, injectés par build.py depuis src/i18n/<langue>.json */
  var T = window.HOONA_I18N || {};
  var LOCALE = { fr: "fr-BE", nl: "nl-BE", en: "en-GB" }[T.lang] || "fr-BE";

  /* ---------- En-tête : fond plein dès qu'on quitte le haut de page ---------- */
  var sentinel = document.querySelector("[data-scroll-sentinel]");
  if (head && sentinel && "IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      head.classList.toggle("is-scrolled", !entries[0].isIntersecting);
    }).observe(sentinel);
  }

  /* v6 : le repli du bandeau suit la sentinelle (classe is-scrolled), sans écouteur de défilement. */
  var bannerClose = document.querySelector("[data-banner-close]");
  if (bannerClose) {
    bannerClose.addEventListener("click", function () {
      doc.classList.add("is-banner-dismissed");
      try { localStorage.setItem("hoona-banner", "closed"); } catch (e) {}
    });
  }

  /* ---------- Menu plein écran ---------- */
  /* Sous-menus de la barre : le chevron ouvre au toucher et au clavier, Échap et un clic ailleurs referment. */
  var subs = [].slice.call(document.querySelectorAll("[data-submenu]"));
  var closeSubs = function (except) {
    subs.forEach(function (s) {
      if (s === except) return;
      s.classList.remove("is-open");
      var b = s.querySelector(".menu-item__toggle"); if (b) b.setAttribute("aria-expanded", "false");
    });
  };
  subs.forEach(function (s) {
    var b = s.querySelector(".menu-item__toggle");
    if (!b) return;
    b.addEventListener("click", function (e) {
      e.stopPropagation();
      s.classList.remove("is-closed");
      var open = !s.classList.contains("is-open");
      closeSubs(s);
      s.classList.toggle("is-open", open);
      b.setAttribute("aria-expanded", String(open));
      if (open) { var first = s.querySelector(".submenu a"); if (first) first.focus(); }
    });
    s.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { closeSubs(); s.classList.add("is-closed"); b.focus(); }
    });
    s.addEventListener("focusout", function () {
      window.setTimeout(function () { if (!s.contains(document.activeElement)) { closeSubs(); s.classList.remove("is-closed"); } }, 0);
    });
  });
  if (subs.length) document.addEventListener("click", function (e) { if (!e.target.closest("[data-submenu]")) closeSubs(); });

  var burger = document.querySelector(".burger");
  var drawer = document.getElementById("drawer");
  function setMenu(open) {
    burger.setAttribute("aria-expanded", String(open));
    drawer.classList.toggle("is-open", open);
    document.body.classList.toggle("menu-open", open);
    if (open) { var first = drawer.querySelector("a"); if (first) first.focus(); }
  }
  if (burger && drawer) {
    burger.addEventListener("click", function () { setMenu(burger.getAttribute("aria-expanded") !== "true"); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && drawer.classList.contains("is-open")) { setMenu(false); burger.focus(); }
    });
  }

  /* ---------- Vidéo plein cadre de l'accueil ----------
     L'affiche est peinte d'abord. La vidéo ne se télécharge que sur grand écran,
     hors mode économie de données et sans préférence « mouvement réduit ». */
  var video = document.querySelector("[data-hero-video]");
  var toggle = document.querySelector("[data-media-toggle]");
  if (video) {
    var conn = navigator.connection || {};
    /* v5 : la vidéo joue aussi sur mobile (fichier ré-encodé, ~4 Mo), sauf économie de données ou mouvement réduit. */
    var allowed = !reduce && !conn.saveData && !/(^|-)2g$/.test(conn.effectiveType || "") && window.matchMedia("(min-width: 48rem)").matches;
    if (allowed) {
      var webm = video.getAttribute("data-src-webm");
      if (webm && video.canPlayType("video/webm") ) {
        var s1 = document.createElement("source"); s1.src = webm; s1.type = "video/webm"; video.appendChild(s1);
      }
      var s2 = document.createElement("source"); s2.src = video.getAttribute("data-src"); s2.type = "video/mp4"; video.appendChild(s2);
      video.load();
      video.addEventListener("playing", function () { video.classList.add("is-playing"); });
      var p = video.play(); if (p && p.catch) p.catch(function () {});
      if (toggle) {
        toggle.hidden = false;
        toggle.addEventListener("click", function () {
          var paused = toggle.getAttribute("aria-pressed") === "true";
          if (paused) { video.play(); toggle.setAttribute("aria-pressed", "false"); toggle.setAttribute("aria-label", T.pause); }
          else { video.pause(); toggle.setAttribute("aria-pressed", "true"); toggle.setAttribute("aria-label", T.play); }
        });
      }
      if ("IntersectionObserver" in window) {
        new IntersectionObserver(function (entries) {
          var userPaused = toggle && toggle.getAttribute("aria-pressed") === "true";
          if (!entries[0].isIntersecting) video.pause();
          else if (!userPaused) video.play().catch(function () {});
        }, { threshold: 0.15 }).observe(video);
      }
    }
  }


  /* ---------- Panneau « Réserver » dans la barre ---------- */
  var panel = document.querySelector("[data-bookpanel]");
  if (panel) {
    var pBtn = panel.querySelector("[data-bookpanel-toggle]");
    var pMenu = panel.querySelector(".bookpanel__menu");
    function setPanel(open) {
      pBtn.setAttribute("aria-expanded", String(open));
      pMenu.hidden = !open;
      if (open) { var f = pMenu.querySelector("a"); if (f) f.focus(); }
    }
    pBtn.addEventListener("click", function () { setPanel(pMenu.hidden); });
    document.addEventListener("click", function (e) { if (!pMenu.hidden && !panel.contains(e.target)) setPanel(false); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !pMenu.hidden) { setPanel(false); pBtn.focus(); } });
  }

  /* ---------- Parcours en trois temps : la strate active s'allume ---------- */
  var journey = document.querySelector("[data-journey]");
  if (journey) {
    var jSteps = [].slice.call(journey.querySelectorAll(".journey__step"));
    var strates = [].slice.call(journey.querySelectorAll(".strate"));
    function jActivate(step) {
      journey.toggleAttribute("data-active", step !== null);
      jSteps.forEach(function (li) { li.classList.toggle("is-active", li.getAttribute("data-step") === step); });
      strates.forEach(function (c) { c.classList.toggle("is-active", c.classList.contains("strate--" + step)); });
    }
    jSteps.forEach(function (li) {
      var k = li.getAttribute("data-step");
      li.addEventListener("mouseenter", function () { jActivate(k); });
      li.addEventListener("focusin", function () { jActivate(k); });
      li.addEventListener("mouseleave", function () { jActivate(null); });
      li.addEventListener("focusout", function () { jActivate(null); });
    });
  }

  /* ---------- Fleur des 7 axes : un axe s'allume, ses voisins se teintent ---------- */
  var flower = document.querySelector("[data-flower]");
  if (flower) {
    var petals = [].slice.call(flower.querySelectorAll(".petal"));
    var legend = [].slice.call(flower.querySelectorAll("[data-axis-item]"));
    var n = petals.length;
    function activate(i) {
      flower.toggleAttribute("data-active", i !== null);
      petals.forEach(function (p, k) {
        var on = k === i;
        var near = i !== null && (k === (i + 1) % n || k === (i + n - 1) % n);
        p.classList.toggle("is-active", on);
        p.classList.toggle("is-near", near);
      });
      legend.forEach(function (li, k) { li.classList.toggle("is-active", k === i); });
    }
    function bind(el, i) {
      el.addEventListener("mouseenter", function () { activate(i); });
      el.addEventListener("focusin", function () { activate(i); });
      el.addEventListener("mouseleave", function () { activate(null); });
      el.addEventListener("focusout", function () { activate(null); });
    }
    petals.forEach(bind);
    legend.forEach(bind);
  }

  /* ---------- Lot 4 : fleur, éclosion, tracé et pulsation (accueil, [data-fleur-anim]) ----------
     Toute l'animation est en CSS (hoona.css). Ici : .is-anim à la première entrée du bloc dans l'écran
     (ou au chargement s'il est déjà visible), .is-paused quand il en sort, retirée au retour.
     L'éclosion ne démarre que si la page est réellement affichée : un onglet en arrière-plan ne reçoit pas
     les rappels d'IntersectionObserver, d'où aussi le contrôle direct au chargement et au retour sur l'onglet.
     « Réduire les animations » ou pas d'IntersectionObserver : .is-still, fleur affichée et immobile. */
  var fleur = document.querySelector("[data-fleur-anim]");
  if (fleur) {
    if (!("IntersectionObserver" in window) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      fleur.classList.add("is-still");
    } else {
      var fleurInView = function () {
        var r = fleur.getBoundingClientRect();
        return r.height > 0 && r.top < window.innerHeight * 0.9 && r.bottom > window.innerHeight * 0.1;
      };
      var fleurStart = function () { if (!document.hidden) fleur.classList.add("is-anim"); };
      new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) fleurStart();
          fleur.classList.toggle("is-paused", !e.isIntersecting);
        });
      }, { threshold: 0.1, rootMargin: "0px 0px -10% 0px" }).observe(fleur);
      if (fleurInView()) fleurStart();
      document.addEventListener("visibilitychange", function () { if (fleurInView()) fleurStart(); });
    }
  }

  /* ---------- Dates passées : masquées en direct si la page date d'un ancien build ---------- */
  var today = new Date(); today.setHours(0, 0, 0, 0);
  [].forEach.call(document.querySelectorAll("[data-start]"), function (el) {
    var d = new Date(el.getAttribute("data-start") + "T00:00:00");
    if (d <= today) el.classList.add("is-past");
  });
  [].forEach.call(document.querySelectorAll(".cal__month"), function (m) {
    if (!m.querySelector("[data-start]:not(.is-past)")) m.hidden = true;
  });

  /* ---------- Catalogues (soins, sessions) : axes, recherche, compteurs ---------- */
  var catalogue = document.querySelector("[data-catalogue]");
  if (catalogue) {
    var isSessions = catalogue.hasAttribute("data-sessions");
    var input = catalogue.querySelector("[data-search]");
    var items = [].slice.call(catalogue.querySelectorAll(".item"));
    var groups = [].slice.call(catalogue.querySelectorAll(".cat-group"));
    var status = catalogue.querySelector("[data-status]");
    var empty = catalogue.querySelector("[data-empty]");
    var picker = catalogue.querySelector("[data-axes-picker]");
    var axisBtns = picker ? [].slice.call(picker.querySelectorAll("[data-axis]")) : [];
    var axisStatus = picker && picker.querySelector("[data-axes-status]");
    var axisClear = picker && picker.querySelector("[data-axes-clear]");
    var axisNames = {};
    axisBtns.forEach(function (b) { var t = b.querySelector(".t"); if (t) axisNames[b.getAttribute("data-axis")] = t.textContent; });
    var norm = function (s) { return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); };
    items.forEach(function (it) { it._text = norm(it.textContent + " " + (it.getAttribute("data-alias") || "")); it._axes = (it.getAttribute("data-axes") || "").split(" "); });
    /* compteur par axe, d'après les lignes présentes */
    axisBtns.forEach(function (b) {
      var c = b.querySelector("[data-axis-count]");
      if (c) c.textContent = items.filter(function (it) { return it._axes.indexOf(b.getAttribute("data-axis")) !== -1; }).length;
    });
    var activeAxes = function () {
      var out = [];
      axisBtns.forEach(function (b) { var a = b.getAttribute("data-axis"); if (b.getAttribute("aria-pressed") === "true" && out.indexOf(a) === -1) out.push(a); });
      return out;
    };
    var unit = function (n) { return isSessions ? (n > 1 ? T.session_many : T.session_one) : (n > 1 ? T.many : T.one); };
    /* Lot 4 : onglets collants. Les onglets de rubriques, reliés à leur .cat-group par l'ancre (voir plus bas : aria-current). */
    var tabs = [].slice.call(catalogue.querySelectorAll(".toolbar .tab"));
    var tabsSync = null;
    tabs.forEach(function (tb) {
      var id = (tb.getAttribute("href") || "").slice(1);
      tb._group = groups.filter(function (g) { return g.id === id; })[0] || null;
    });

    function apply() {
      var q = norm((input && input.value || "").trim());
      var axes = activeAxes();
      var shown = 0;
      items.forEach(function (it) {
        var okText = !q || it._text.indexOf(q) !== -1;
        var okAxes = !axes.length || axes.some(function (a) { return it._axes.indexOf(a) !== -1; });
        it.hidden = !(okText && okAxes);
        if (!it.hidden) shown++;
      });
      groups.forEach(function (g) { g.hidden = !g.querySelector(".item:not([hidden])"); });
      /* Soins après consultation (accordéon) : compteur à jour, masqué sans résultat, ouvert quand la recherche y trouve un soin. */
      [].forEach.call(catalogue.querySelectorAll("details.cat-locked"), function (d) {
        var n = d.querySelectorAll(".item:not([hidden])").length, c = d.querySelector("[data-locked-count]");
        if (c) c.textContent = n;
        d.hidden = !n;
        if (q && n) d.open = true;
      });
      /* Lot 4 : onglets collants. Le compteur n'apparaît que pendant un filtrage (champ non vide ou axe choisi) ; un onglet disparaît avec sa rubrique. */
      if (status) { status.textContent = shown + " " + unit(shown); status.hidden = !(q || axes.length); }
      tabs.forEach(function (tb) { tb.hidden = !!tb._group && tb._group.hidden; });
      if (tabsSync) tabsSync();
      if (empty) empty.hidden = shown !== 0;
      if (axisStatus) {
        axisStatus.textContent = (axes.length ? axes.map(function (a) { return axisNames[a] || a; }).join(" + ") : (picker.getAttribute("data-all") || axisStatus.getAttribute("data-all") || axisStatus._all))
          + " · " + shown + " " + unit(shown);
      }
      if (axisClear) axisClear.hidden = !axes.length;
    }
    if (axisStatus) axisStatus._all = axisStatus.textContent;
    axisBtns.forEach(function (b) {
      b.addEventListener("click", function (e) {
        e.preventDefault();
        var a = b.getAttribute("data-axis");
        var on = b.getAttribute("aria-pressed") !== "true";
        axisBtns.forEach(function (o) { if (o.getAttribute("data-axis") === a) o.setAttribute("aria-pressed", String(on)); });
        apply();
      });
    });
    if (axisClear) axisClear.addEventListener("click", function () {
      axisBtns.forEach(function (o) { o.setAttribute("aria-pressed", "false"); });
      apply();
    });
    var axisToggle = picker && picker.querySelector("[data-axes-toggle]");
    if (axisToggle) axisToggle.addEventListener("click", function () {
      var open = !picker.classList.contains("is-open");
      picker.classList.toggle("is-open", open);
      axisToggle.setAttribute("aria-expanded", String(open));
      axisToggle.textContent = open ? axisToggle.getAttribute("data-hide") : axisToggle.getAttribute("data-show");
    });
    if (input) input.addEventListener("input", apply);

    /* Lot 4 : onglets collants. La loupe ouvre le champ de recherche (focus) ; Échap le vide et le referme, la perte de focus le referme s'il est vide. */
    var searchBox = catalogue.querySelector("[data-search-box]");
    var searchToggle = catalogue.querySelector("[data-search-toggle]");
    if (input && searchBox && searchToggle) {
      var searchOpen = function (open, focus) {
        searchBox.classList.toggle("is-open", open);
        searchToggle.setAttribute("aria-expanded", String(open));
        if (open && focus) input.focus();
      };
      searchToggle.addEventListener("mousedown", function (e) { if (document.activeElement === input) e.preventDefault(); });
      searchToggle.addEventListener("click", function () {
        var open = searchBox.classList.contains("is-open");
        if (open && !input.value) searchOpen(false);
        else searchOpen(true, true);
      });
      input.addEventListener("keydown", function (e) {
        if (e.key !== "Escape") return;
        input.value = "";
        apply();
        searchOpen(false);
        searchToggle.focus();
      });
      input.addEventListener("blur", function () { if (!input.value) searchOpen(false); });
      if (input.value) searchOpen(true);
    }

    /* Lot 4 : onglets collants. L'onglet de la rubrique qui traverse la bande 40 % à 45 % de l'écran porte aria-current ; au chargement, le premier. */
    if (tabs.length) {
      var tabsBar = tabs[0].parentNode;
      var current = null;
      var setCurrent = function (tb) {
        if (!tb || tb === current) return;
        current = tb;
        tabs.forEach(function (o) { if (o === tb) o.setAttribute("aria-current", "true"); else o.removeAttribute("aria-current"); });
        /* Sur mobile, la ligne d'onglets défile pour garder l'onglet courant visible (sans toucher au défilement de la page). */
        if (tabsBar.scrollWidth > tabsBar.clientWidth) {
          var left = tb.offsetLeft - tabsBar.offsetLeft - 16;
          tabsBar.scrollTo({ left: left, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
        }
      };
      var firstTab = function () { return tabs.filter(function (tb) { return !tb.hidden; })[0]; };
      tabsSync = function () { if (!current || current.hidden) { current = null; setCurrent(firstTab()); } };
      setCurrent(firstTab());
      if ("IntersectionObserver" in window) {
        var tabIo = new IntersectionObserver(function (entries) {
          entries.forEach(function (en) {
            if (!en.isIntersecting) return;
            var tb = tabs.filter(function (t) { return t._group === en.target; })[0];
            if (tb && !tb.hidden) setCurrent(tb);
          });
        }, { rootMargin: "-40% 0px -55% 0px" });
        groups.forEach(function (g) { tabIo.observe(g); });
      }
      tabs.forEach(function (tb) { tb.addEventListener("click", function () { setCurrent(tb); }); });
    }

    /* Sur mobile, chaque soin se replie sur son titre, sa durée et son prix ; le toucher déplie la description et les boutons. */
    if (catalogue.hasAttribute("data-collapsible")) {
      var mq = window.matchMedia("(max-width: 59.99rem)");
      var collapsible = function (on) {
        items.forEach(function (it) {
          var title = it.querySelector(".row__title");
          if (!title) return;
          var btn = title.querySelector(".row__toggle"), link = title.querySelector(".row__link");
          if (on && !btn) {
            btn = document.createElement("button");
            btn.type = "button"; btn.className = "row__toggle"; btn.setAttribute("aria-expanded", "false");
            if (link) {
              /* Le titre est un lien vers la page dédiée : il reste cliquable, seul le chevron déplie. */
              btn.className += " row__toggle--icon";
              btn.setAttribute("aria-label", { fr: "Détails", nl: "Details", en: "Details" }[document.documentElement.lang] || "Détails");
            } else {
              while (title.firstChild) btn.appendChild(title.firstChild);
            }
            title.appendChild(btn);
            it.classList.add("is-collapsed");
            btn.addEventListener("click", function () {
              btn.setAttribute("aria-expanded", String(!it.classList.toggle("is-collapsed")));
            });
          } else if (!on && btn) {
            while (btn.firstChild) title.appendChild(btn.firstChild);
            btn.parentNode.removeChild(btn);
            it.classList.remove("is-collapsed");
          }
        });
      };
      collapsible(mq.matches);
      (mq.addEventListener ? mq.addEventListener("change", function (ev) { collapsible(ev.matches); }) : mq.addListener(function (ev) { collapsible(ev.matches); }));
    }

    /* Un lien vers une ligne (agenda, article) : la ligne est filtrée ou repliée ? On la rend visible avant d'y aller. */
    var reveal = function () {
      var id = window.location.hash.slice(1);
      var el = id && document.getElementById(id);
      if (!el || !catalogue.contains(el)) return;
      if (el.hidden) {
        if (input) input.value = "";
        axisBtns.forEach(function (o) { o.setAttribute("aria-pressed", "false"); });
        apply();
      }
      var box = el.closest && el.closest("details");
      if (box) box.open = true;
      var tg = el.querySelector(".row__toggle");
      if (tg && el.classList.contains("is-collapsed")) tg.click();
      el.scrollIntoView({ block: "start" });
    };
    window.addEventListener("hashchange", reveal);
    var reset = catalogue.querySelector("[data-reset]");
    if (reset) reset.addEventListener("click", function () {
      if (input) input.value = "";
      axisBtns.forEach(function (o) { o.setAttribute("aria-pressed", "false"); });
      apply();
      if (input) input.focus();
    });
    apply();
    if (window.location.hash) reveal();
  }

  /* ---------- Témoignages vidéo : l'affiche d'abord, la vidéo au clic ---------- */
  [].forEach.call(document.querySelectorAll(".vt__play[data-video]"), function (btn) {
    btn.addEventListener("click", function () {
      var video = document.createElement("video");
      video.src = btn.getAttribute("data-video"); video.controls = true; video.playsInline = true; video.preload = "metadata";
      var img = btn.querySelector("img"); if (img) video.poster = img.getAttribute("src");
      btn.parentNode.replaceChild(video, btn);
      video.play().catch(function () {});
    });
  });

  /* ---------- Bande d'avis : flèches précédent / suivant ---------- */
  [].forEach.call(document.querySelectorAll("[data-quotes]"), function (wrap) {
    var strip = wrap.querySelector(".quotes"), prev = wrap.querySelector("[data-prev]"), next = wrap.querySelector("[data-next]");
    if (!strip || !prev || !next) return;
    function step() { var card = strip.querySelector(".quote"); return card ? card.getBoundingClientRect().width + 16 : strip.clientWidth; }
    function sync() {
      wrap.classList.toggle("has-nav", strip.scrollWidth > strip.clientWidth + 4);
      prev.disabled = strip.scrollLeft <= 2;
      next.disabled = strip.scrollLeft + strip.clientWidth >= strip.scrollWidth - 2;
    }
    prev.addEventListener("click", function () { strip.scrollBy({ left: -step(), behavior: "smooth" }); });
    next.addEventListener("click", function () { strip.scrollBy({ left: step(), behavior: "smooth" }); });
    strip.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync);
    sync();
  });

  /* ---------- Journal : un axe à la fois, ou tous ---------- */
  var journal = document.querySelector("[data-journal]");
  if (journal) {
    var jChips = [].slice.call(journal.querySelectorAll(".chip[data-axis]"));
    var jItems = [].slice.call(journal.querySelectorAll(".item"));
    var jCount = journal.querySelector("[data-journal-count]");
    var jEmpty = journal.querySelector("[data-empty]");
    jChips.forEach(function (chip) {
      chip.addEventListener("click", function () {
        var axis = chip.getAttribute("data-axis");
        jChips.forEach(function (c) { c.setAttribute("aria-pressed", String(c === chip)); });
        var shown = 0;
        jItems.forEach(function (it) {
          var ok = !axis || (" " + it.getAttribute("data-axes") + " ").indexOf(" " + axis + " ") !== -1;
          it.hidden = !ok;
          if (ok) shown++;
        });
        if (jCount) jCount.textContent = shown + " " + (shown === 1 ? T.article_one : T.article_many);
        if (jEmpty) jEmpty.hidden = shown !== 0;
      });
    });
  }

  /* ---------- Dates de séjour : une date passée disparaît d'elle-même, même si le site n'a pas été reconstruit ---------- */
  var todayISO = new Date().toISOString().slice(0, 10);
  [].forEach.call(document.querySelectorAll("[data-start]"), function (el) {
    if (el.getAttribute("data-start") < todayISO) {
      var month = el.closest(".cal__month");
      el.parentNode.removeChild(el);
      if (month && !month.querySelector("[data-start]")) month.parentNode.removeChild(month);
    }
  });

  /* ---------- Formulaire de contact : préremplit le séjour choisi ---------- */
  var params = new URLSearchParams(window.location.search);
  var sejour = params.get("sejour");
  var subject = document.getElementById("c-sujet");
  var message = document.getElementById("c-message");
  var sujet = params.get("sujet");
  if (sujet && subject && subject.querySelector('option[value="' + sujet.replace(/[^a-z]/g, "") + '"]')) {
    subject.value = sujet;
  }
  if (sejour && subject && /^\d{4}-\d{2}-\d{2}$/.test(sejour)) {
    subject.value = "sejour";
    var d0 = new Date(sejour + "T00:00:00");
    if (message && !message.value) {
      message.value = T.prefill + d0.toLocaleDateString(LOCALE, { day: "numeric", month: "long", year: "numeric" }) + ".";
    }
  }

  /* ---------- Formulaires en démonstration (aucun envoi réel) ---------- */
  [].forEach.call(document.querySelectorAll("form[data-demo]"), function (form) {
    var out = form.querySelector(".form__status");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var firstBad = null;
      [].forEach.call(form.querySelectorAll("[required]"), function (f) {
        var bad = !f.checkValidity();
        f.setAttribute("aria-invalid", String(bad));
        var err = document.getElementById(f.id + "-err");
        if (err) err.textContent = bad ? (f.type === "email" ? T.bad_email : T.required) : "";
        if (bad && !firstBad) firstBad = f;
      });
      if (firstBad) { firstBad.focus(); return; }
      var btn = form.querySelector("[type=submit]");
      btn.setAttribute("data-state", "loading"); btn.disabled = true;
      window.setTimeout(function () {
        btn.removeAttribute("data-state"); btn.disabled = false;
        form.reset();
        if (out) { out.setAttribute("data-state", "success"); out.textContent = form.getAttribute("data-success") || T.thanks; }
      }, 600);
    });
  });

  /* ---------- Révélation discrète, avec filet de sécurité ---------- */
  var reveals = document.querySelectorAll(".reveal");
  if (reveals.length && "IntersectionObserver" in window && !reduce) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); } });
    }, { rootMargin: "0px 0px -10% 0px" });
    [].forEach.call(reveals, function (r) { io.observe(r); });
    window.setTimeout(function () { [].forEach.call(reveals, function (r) { r.classList.add("is-in"); }); }, 2500);
  } else {
    [].forEach.call(reveals, function (r) { r.classList.add("is-in"); });
  }
})();

/* ---- Lot 4 S1 : recherche globale ---- */
/* La loupe de l'en-tête (ou « / », ou Ctrl/Cmd+K) ouvre un calque plein écran. L'index assets/search-<langue>.json,
   écrit par build.py, n'est chargé qu'à la première ouverture. Tous les mots tapés doivent se trouver, en début de mot,
   dans le titre, les intertitres, la description ou le texte ; le titre pèse le plus. */
(function () {
  "use strict";
  var layer = document.querySelector("[data-search-layer]");
  var openers = [].slice.call(document.querySelectorAll("[data-search-open]"));
  if (!layer || !openers.length || !window.fetch) return;
  var input = layer.querySelector("input");
  var form = layer.querySelector("[data-search-form]");
  var list = layer.querySelector("[data-search-results]");
  var hint = layer.querySelector("[data-search-hint]");
  var status = layer.querySelector("[data-search-status]");
  var closeBtn = layer.querySelector("[data-search-close]");
  var veil = layer.querySelector("[data-search-veil]");
  var hintText = hint.textContent;
  var lang = (document.documentElement.lang || "fr").slice(0, 2);
  /* Même base que la feuille de script : hoona.js vit dans <racine>/assets/js/, quelle que soit la profondeur de la page. */
  var script = document.querySelector('script[src*="assets/js/hoona.js"]');
  var base = script ? script.src : window.location.href;
  var indexUrl = new URL("../search-" + lang + ".json", base).href;
  var langRoot = new URL("../../" + lang + "/", base).href;
  var MAX = 8, data = null, loading = null, failed = false, lastFocus = null, timer = 0;

  var msg = function (key, n, q) { return (layer.getAttribute("data-" + key) || "").replace("{n}", n).replace("{q}", q); };
  var norm = function (s) {
    return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/œ/g, "oe").replace(/æ/g, "ae");
  };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var isWordChar = function (c) { return /[a-z0-9]/.test(c || ""); };
  /* Position du terme en début de mot, -1 sinon. */
  var find = function (hay, term, from) {
    var i = hay.indexOf(term, from || 0);
    while (i !== -1) {
      if (i === 0 || !isWordChar(hay.charAt(i - 1))) return i;
      i = hay.indexOf(term, i + 1);
    }
    return -1;
  };
  var count = function (hay, term) { var n = 0, i = find(hay, term); while (i !== -1 && n < 6) { n++; i = find(hay, term, i + term.length); } return n; };
  /* Texte normalisé + correspondance vers les positions du texte d'origine (pour l'extrait et le surlignage). */
  var mapped = function (s) {
    var out = "", map = [];
    for (var i = 0; i < s.length; i++) { var n = norm(s.charAt(i)); for (var k = 0; k < n.length; k++) { out += n.charAt(k); map.push(i); } }
    map.push(s.length);
    return { n: out, map: map };
  };
  var highlight = function (s, terms) {
    var m = mapped(s), ranges = [];
    terms.forEach(function (term) {
      var i = find(m.n, term);
      while (i !== -1) {
        var j = i + term.length;
        while (isWordChar(m.n.charAt(j))) j++;  /* le mot entier : « gongs » pour « gong » */
        ranges.push([m.map[i], m.map[j - 1] + 1]);
        i = find(m.n, term, j);
      }
    });
    if (!ranges.length) return esc(s);
    ranges.sort(function (a, b) { return a[0] - b[0]; });
    var html = "", pos = 0;
    ranges.forEach(function (r) {
      if (r[0] < pos) return;
      html += esc(s.slice(pos, r[0])) + "<mark>" + esc(s.slice(r[0], r[1])) + "</mark>";
      pos = r[1];
    });
    return html + esc(s.slice(pos));
  };
  var excerpt = function (e, terms) {
    var sources = [e.description, e.text, (e.headings || []).join(" · ")];
    for (var s = 0; s < sources.length; s++) {
      var src = sources[s] || "";
      var m = mapped(src);
      for (var t = 0; t < terms.length; t++) {
        var i = find(m.n, terms[t]);
        if (i === -1) continue;
        var at = m.map[i];
        if (src.length <= 170) return src;
        var start = Math.max(0, at - 60);
        if (start > 0) { var sp = src.indexOf(" ", start); start = sp !== -1 && sp < at ? sp + 1 : start; }
        var end = Math.min(src.length, start + 160);
        if (end < src.length) { var sp2 = src.lastIndexOf(" ", end); if (sp2 > at) end = sp2; }
        return (start > 0 ? "…" : "") + src.slice(start, end).replace(/[\s,;:]+$/, "") + (end < src.length ? "…" : "");
      }
    }
    var d = e.description || e.text || "";
    return d.length > 170 ? d.slice(0, d.lastIndexOf(" ", 160)) + "…" : d;
  };

  function prepare(entries) {
    return entries.map(function (e, k) {
      e._k = k;
      e._t = norm(e.title);
      e._h = norm((e.headings || []).join(" · "));
      e._d = norm(e.description);
      e._x = norm(e.text);
      e._u = norm((e.url || "").replace(/\.html.*$/, "").replace(/^.*\//, ""));
      return e;
    });
  }

  function score(e, terms, phrase) {
    var total = 0;
    for (var i = 0; i < terms.length; i++) {
      var term = terms[i], s = 0;
      var pt = find(e._t, term);
      if (pt !== -1) {
        s += 12 + 6 * (1 - pt / Math.max(e._t.length, 1));  /* plus le mot vient tôt dans le titre, mieux c'est */
        if (!isWordChar(e._t.charAt(pt + term.length))) s += 2;  /* mot entier */
        if (e.item) s += 5;  /* un soin ou une session nommé : on va droit à la ligne */
      }
      if (find(e._h, term) !== -1) s += 6;
      if (find(e._d, term) !== -1) s += 4;
      var nx = count(e._x, term);
      if (nx) s += 1 + nx * 0.6;
      var pu = find(e._u, term);
      if (pu !== -1) s += pu === 0 ? 6 : 3;  /* page dédiée : sejours.html pour « séjour », bain-de-gongs.html pour « gong » */
      if (!s) return 0;  /* tous les mots sont requis */
      total += s;
    }
    if (terms.length > 1 && e._t.indexOf(phrase) !== -1) total += 10;
    return total;
  }

  function render(q) {
    var phrase = norm(q).replace(/[^a-z0-9]+/g, " ").trim();
    var terms = phrase.split(" ").filter(Boolean);
    if (terms.length > 1) terms = terms.filter(function (t) { return t.length > 1; });
    var hits = [];
    data.forEach(function (e) { var s = score(e, terms, phrase); if (s) hits.push([s, e]); });
    hits.sort(function (a, b) { return b[0] - a[0] || a[1].title.length - b[1].title.length || a[1]._k - b[1]._k; });
    var top = hits.slice(0, MAX);
    list.innerHTML = top.map(function (h) {
      var e = h[1];
      return '<li><a class="search-hit" href="' + esc(langRoot + e.url) + '">'
        + (e.section ? '<span class="insert search-hit__section">' + esc(e.section) + "</span>" : "")
        + '<span class="search-hit__title">' + highlight(e.title, terms) + "</span>"
        + '<span class="search-hit__excerpt">' + highlight(excerpt(e, terms), terms) + "</span></a></li>";
    }).join("");
    if (!hits.length) {
      hint.textContent = msg("empty", 0, q); hint.hidden = false;
      status.textContent = hint.textContent;
    } else {
      hint.hidden = true;
      status.textContent = hits.length === 1 ? msg("one", 1, q) : msg(hits.length > MAX ? "top" : "many", hits.length, q);
    }
  }

  function run() {
    var q = input.value.trim();
    if (norm(q).replace(/[^a-z0-9]/g, "").length < 2) {
      list.innerHTML = ""; hint.textContent = hintText; hint.hidden = false; status.textContent = "";
      return;
    }
    if (data) render(q);
    else if (failed) { hint.textContent = msg("error"); hint.hidden = false; status.textContent = hint.textContent; }
    else load();
  }

  function load() {
    if (data || loading) return loading;
    failed = false;
    /* L'index arrive par une balise <script> (assets/search-<langue>.js) : cela marche sur un serveur comme
       pour une page ouverte en local (file://), où fetch() est refusé. */
    loading = new Promise(function (resolve, reject) {
      var ready = window.hoonaSearchIndex && window.hoonaSearchIndex[lang];
      if (ready) return resolve(ready);
      var s = document.createElement("script");
      s.src = indexUrl.replace(/\.json$/, ".js"); s.async = true;
      s.onload = function () { var d = window.hoonaSearchIndex && window.hoonaSearchIndex[lang]; if (d) resolve(d); else reject(new Error("index")); };
      s.onerror = function () { reject(new Error("index")); };
      document.head.appendChild(s);
    })
      .then(function (d) { data = prepare(d); loading = null; if (!layer.hidden) run(); })
      .catch(function () { loading = null; failed = true; if (!layer.hidden) run(); failed = false; });
    return loading;
  }

  var focusables = function () { return [input, closeBtn].concat([].slice.call(list.querySelectorAll("a"))); };

  function open(trigger) {
    if (!layer.hidden) { input.focus(); return; }
    lastFocus = trigger || document.activeElement;
    /* Ouvert depuis le menu plein écran (ou loupe masquée sous 360 px) : le focus reviendra sur le bouton du menu. */
    if (lastFocus && (!lastFocus.offsetParent || (lastFocus.closest && lastFocus.closest("#drawer")))) lastFocus = document.querySelector(".burger") || lastFocus;
    /* Le menu plein écran est ouvert ? On le referme d'abord. */
    var burger = document.querySelector(".burger[aria-expanded='true']");
    if (burger) burger.click();
    layer.hidden = false;
    document.body.classList.add("search-open");
    openers.forEach(function (b) { b.setAttribute("aria-expanded", "true"); });
    input.focus();
    input.select();
    load();
    run();
  }

  function close(restore) {
    if (layer.hidden) return;
    window.clearTimeout(timer);
    layer.hidden = true;
    document.body.classList.remove("search-open");
    openers.forEach(function (b) { b.setAttribute("aria-expanded", "false"); });
    if (restore !== false && lastFocus && lastFocus.focus) lastFocus.focus();
  }

  openers.forEach(function (b) { b.addEventListener("click", function () { open(b); }); });
  closeBtn.addEventListener("click", function () { close(); });
  veil.addEventListener("click", function () { close(); });
  layer.addEventListener("click", function (e) {
    if (e.target === layer) close();
    /* Un résultat qui pointe vers une ancre de la page courante : le calque se ferme aussi. */
    if (e.target.closest && e.target.closest(".search-hit")) close(false);
  });
  input.addEventListener("input", function () { window.clearTimeout(timer); timer = window.setTimeout(run, 120); });
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    window.clearTimeout(timer);
    run();
    var first = list.querySelector("a");
    if (first) first.click();
  });

  layer.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); return; }
    var links = [].slice.call(list.querySelectorAll("a"));
    var at = links.indexOf(document.activeElement);
    if (e.key === "ArrowDown" && links.length) {
      e.preventDefault();
      links[at === -1 ? 0 : Math.min(at + 1, links.length - 1)].focus();
    } else if (e.key === "ArrowUp" && at !== -1) {
      e.preventDefault();
      if (at === 0) input.focus(); else links[at - 1].focus();
    } else if (e.key === "Tab") {
      /* Focus piégé dans le calque. */
      var f = focusables(), i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    }
  });

  document.addEventListener("keydown", function (e) {
    var tgt = e.target, typing = tgt && (/^(input|textarea|select)$/i.test(tgt.tagName) || tgt.isContentEditable);
    if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey) && !e.altKey) {
      e.preventDefault();
      if (layer.hidden) open(openers[0]); else close();
    } else if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey && !e.altKey && layer.hidden) {
      e.preventDefault();
      open(openers[0]);
    }
  });
})();

/* ---- Lot 4 S5 : carrousel ---- */
/* Bande à défilement natif (scroll-snap) : le script ajoute flèches, compteur et flèches du clavier. */
(function () {
  "use strict";
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  [].forEach.call(document.querySelectorAll("[data-carousel]"), function (box) {
    var track = box.querySelector(".carousel__track");
    var slides = track ? [].slice.call(track.children) : [];
    var prev = box.querySelector("[data-carousel-prev]"), next = box.querySelector("[data-carousel-next]");
    var out = box.querySelector("[data-carousel-current]");
    if (slides.length < 2 || !prev || !next) return;
    var current = 0, target = null, timer = 0;

    function left(i) { return slides[i].offsetLeft - slides[0].offsetLeft; }
    function index() {
      var max = track.scrollWidth - track.clientWidth;
      if (track.scrollLeft >= max - 2) return slides.length - 1;
      var best = 0, dist = Infinity;
      slides.forEach(function (s, i) { var d = Math.abs(left(i) - track.scrollLeft); if (d < dist) { dist = d; best = i; } });
      return best;
    }
    function render(i) {
      current = i;
      if (out) out.textContent = String(i + 1);
      prev.setAttribute("aria-disabled", String(i === 0));
      next.setAttribute("aria-disabled", String(i === slides.length - 1));
    }
    /* Pendant un défilement lancé par les flèches, le compteur garde la cible ; sinon il suit la position. */
    function sync() {
      var i = index();
      if (target !== null) { if (i !== target) return; target = null; }
      if (i !== current) render(i);
    }
    function go(i) {
      i = Math.max(0, Math.min(slides.length - 1, i));
      target = i; render(i);
      window.clearTimeout(timer);
      timer = window.setTimeout(function () { target = null; sync(); }, 900);
      track.scrollTo({ left: left(i), behavior: reduce.matches ? "instant" : "smooth" });
    }
    prev.addEventListener("click", function () { if (current > 0) go(current - 1); });
    next.addEventListener("click", function () { if (current < slides.length - 1) go(current + 1); });
    box.addEventListener("keydown", function (e) {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      var k = e.key;
      if (k === "ArrowLeft" || k === "ArrowRight" || k === "Home" || k === "End") {
        e.preventDefault();
        go(k === "ArrowLeft" ? current - 1 : k === "ArrowRight" ? current + 1 : k === "Home" ? 0 : slides.length - 1);
      }
    });
    track.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", function () { target = null; sync(); });
    box.classList.add("is-ready");
    render(index());
  });
})();
