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
    items.forEach(function (it) { it._text = norm(it.textContent); it._axes = (it.getAttribute("data-axes") || "").split(" "); });
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
      if (status) status.textContent = shown + " " + unit(shown);
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
