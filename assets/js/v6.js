/* hoona v6 : mouvement. Observateurs d'intersection uniquement, jamais d'écouteur de défilement. */
(function () {
  "use strict";
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Hero : chaque mot du titre monte à son tour ---------- */
  var title = document.querySelector("[data-split-words]");
  if (title && !reduce) {
    var words = title.textContent.trim().split(/\s+/);
    title.textContent = "";
    var line = document.createElement("span"); line.className = "fold__line";
    words.forEach(function (w, i) {
      var s = document.createElement("span");
      s.className = "fold__word"; s.style.setProperty("--i", i); s.textContent = w;
      line.appendChild(s);
      if (i < words.length - 1) line.appendChild(document.createTextNode(" "));
    });
    title.appendChild(line);
  }

  /* ---------- Révélation en cascade : les enfants d'un conteneur se suivent ---------- */
  var reveals = [].slice.call(document.querySelectorAll(".reveal"));
  [].forEach.call(document.querySelectorAll("[data-stagger]"), function (parent) {
    [].forEach.call(parent.children, function (child, i) {
      child.classList.add("reveal"); child.style.setProperty("--i", i);
      reveals.push(child);
    });
  });
  if (reveals.length && "IntersectionObserver" in window && !reduce) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); } });
    }, { rootMargin: "0px 0px -12% 0px", threshold: 0.08 });
    reveals.forEach(function (r) { io.observe(r); });
    window.setTimeout(function () { reveals.forEach(function (r) { r.classList.add("is-in"); }); }, 3000);
  } else {
    reveals.forEach(function (r) { r.classList.add("is-in"); });
  }

  /* ---------- Chemins : un volet s'ouvre au survol, au clavier ou au toucher ---------- */
  var paths = document.querySelector("[data-paths]");
  if (paths) {
    var items = [].slice.call(paths.querySelectorAll(".path"));
    function open(target) { items.forEach(function (p) { p.classList.toggle("is-open", p === target); }); }
    items.forEach(function (p) {
      var t = p.querySelector(".path__toggle");
      if (t) t.addEventListener("click", function () {
        var link = p.querySelector(".path__go a, h3 a");
        if (p.classList.contains("is-open") && link) { window.location.href = link.getAttribute("href"); return; }
        open(p);
      });
      p.addEventListener("mouseenter", function () { open(p); });
    });
  }

  /* ---------- Parcours : l'anneau qui correspond à l'étape visible s'allume ---------- */
  var journey = document.querySelector("[data-journey]");
  if (journey && "IntersectionObserver" in window) {
    var steps = [].slice.call(journey.querySelectorAll(".journey__step"));
    var setStep = function (k) {
      journey.setAttribute("data-step", k);
      steps.forEach(function (s) { s.classList.toggle("is-active", s.getAttribute("data-step") === k); });
    };
    var jo = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) setStep(en.target.getAttribute("data-step")); });
    }, { rootMargin: "-40% 0px -45% 0px", threshold: 0 });
    steps.forEach(function (s) { jo.observe(s); });
    setStep("1");
  }

  /* ---------- Bloc final : les arcs se dessinent quand il entre dans l'écran ---------- */
  var strata = document.querySelector(".strata[data-draw]");
  if (strata && "IntersectionObserver" in window) {
    var so = new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) { strata.classList.add("is-in"); so.disconnect(); }
    }, { threshold: 0.25 });
    so.observe(strata);
  }
})();
