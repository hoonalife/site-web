/* hoona v7 : module de réservation du séjour immersif (reserver-sejour.html).
   Aucune dépendance. Sans JavaScript, le formulaire reste un formulaire : dates et chambres en boutons radio,
   participants en champ numérique, envoi natif vers l'adresse `action`. */
(function () {
  "use strict";
  var form = document.querySelector("form[data-rsv]");
  if (!form) return;

  var DEPOSIT = parseInt(form.getAttribute("data-deposit"), 10) || 30;
  var MAX = parseInt(form.getAttribute("data-max-people"), 10) || 8;
  var people = form.querySelector("#rsv-personnes");
  var status = form.querySelector("[data-status]");
  var submit = form.querySelector("[data-submit]");
  var recap = {};
  [].forEach.call(form.querySelectorAll("[data-recap]"), function (el) { recap[el.getAttribute("data-recap")] = el; });
  var hidden = {};
  [].forEach.call(form.querySelectorAll("[data-h]"), function (el) { hidden[el.getAttribute("data-h")] = el; });

  function eur(n) { return n.toLocaleString("fr-BE") + " €"; }
  function count() { return Math.min(MAX, Math.max(1, parseInt(people.value, 10) || 1)); }
  function checked(name) { return form.querySelector('input[name="' + name + '"]:checked'); }
  function setError(key, msg) {
    var el = form.querySelector('[data-err="' + key + '"]') || document.getElementById("rsv-" + key + "-err");
    if (el) el.textContent = msg || "";
  }

  /* ---------- Dates : une date passée disparaît, la date demandée dans l'URL est présélectionnée ---------- */
  var todayISO = new Date().toISOString().slice(0, 10);
  var dates = [].slice.call(form.querySelectorAll(".rsv__date"));
  dates = dates.filter(function (l) {
    if (l.getAttribute("data-start") < todayISO) { l.parentNode.removeChild(l); return false; }
    return true;
  });
  var none = form.querySelector("[data-none]");
  if (none && !dates.length) none.hidden = false;
  var wanted = new URLSearchParams(window.location.search).get("sejour");
  if (wanted) {
    var r = form.querySelector('input[name="sejour"][value="' + wanted.replace(/[^0-9-]/g, "") + '"]');
    if (r && !r.disabled) r.checked = true;
  }

  /* ---------- Participants ---------- */
  [].forEach.call(form.querySelectorAll("[data-step]"), function (b) {
    b.addEventListener("click", function () {
      people.value = Math.min(MAX, Math.max(1, count() + parseInt(b.getAttribute("data-step"), 10)));
      update();
    });
  });

  /* ---------- Chambres : la chambre partagée demande deux participants ---------- */
  function rooms() {
    var n = count();
    [].forEach.call(form.querySelectorAll(".rsv__room[data-min-people]"), function (room) {
      var min = parseInt(room.getAttribute("data-min-people"), 10);
      var input = room.querySelector("input");
      var off = n < min;
      room.classList.toggle("is-off", off);
      input.disabled = off;
      if (off && input.checked) input.checked = false;
    });
  }

  /* ---------- Récapitulatif et champs transmis ---------- */
  function update() {
    rooms();
    var n = count();
    var stay = checked("sejour");
    var room = checked("chambre");
    var unit = room ? parseInt(room.getAttribute("data-price"), 10) : 0;
    var total = unit * n;
    var deposit = Math.round(total * DEPOSIT / 100);

    recap.sejour.textContent = stay ? stay.getAttribute("data-label") : "à choisir";
    recap.personnes.textContent = n + (n > 1 ? " personnes" : " personne");
    recap.chambre.textContent = room ? room.getAttribute("data-label") : "à choisir";
    recap.unit.textContent = room ? eur(unit) : "·";
    recap.total.textContent = room ? eur(total) : "·";
    recap.deposit.textContent = room
      ? "Acompte de " + DEPOSIT + " % à la réservation : " + eur(deposit) + ". Solde de " + eur(total - deposit) + " avant le séjour."
      : "Un acompte de " + DEPOSIT + " % confirme la réservation. Le solde se règle avant le séjour.";

    hidden.sejour_libelle.value = stay ? stay.getAttribute("data-label") : "";
    hidden.chambre_libelle.value = room ? room.getAttribute("data-label") : "";
    hidden.prix_par_personne.value = room ? unit : "";
    hidden.total.value = room ? total : "";
    hidden.acompte.value = room ? deposit : "";
    hidden.solde.value = room ? total - deposit : "";
    if (stay) setError("sejour", "");
    if (room) setError("chambre", "");
  }
  form.addEventListener("change", update);
  people.addEventListener("input", update);

  /* ---------- Origine de la visite, pour relier la demande à la campagne ---------- */
  var q = new URLSearchParams(window.location.search);
  ["utm_source", "utm_medium", "utm_campaign", "utm_content", "gclid", "fbclid"].forEach(function (k) {
    var v = q.get(k);
    if (v && hidden[k]) hidden[k].value = v.slice(0, 200);
  });
  if (hidden.page) hidden.page.value = window.location.pathname + (document.referrer ? " ← " + document.referrer.slice(0, 200) : "");

  /* ---------- Envoi ---------- */
  function validate() {
    var ok = true, first = null;
    if (!checked("sejour")) { setError("sejour", "Choisissez une date de séjour."); ok = false; first = form.querySelector(".rsv__dates"); }
    if (!checked("chambre")) { setError("chambre", "Choisissez une chambre."); ok = false; first = first || form.querySelector(".rsv__rooms"); }
    [].forEach.call(form.querySelectorAll(".field[required], #rsv-cg"), function (f) {
      var bad = !f.checkValidity();
      f.setAttribute("aria-invalid", String(bad));
      setError(f.id.replace(/^rsv-/, ""), bad
        ? (f.type === "email" ? "Vérifiez l'adresse e-mail." : f.type === "checkbox" ? "Merci de confirmer avoir lu les conditions." : "Ce champ est nécessaire.")
        : "");
      if (bad) { ok = false; first = first || f; }
    });
    if (first) (first.focus ? first : first.querySelector("input")).focus({ preventScroll: false });
    return ok;
  }

  function thanks() {
    var stay = checked("sejour"), room = checked("chambre");
    var p = new URLSearchParams();
    if (stay) p.set("sejour", stay.value);
    if (room) p.set("chambre", room.value);
    p.set("personnes", count());
    if (hidden.acompte.value) p.set("acompte", hidden.acompte.value);
    return form.getAttribute("action") + "?" + p.toString();
  }

  form.addEventListener("submit", function (e) {
    if (!validate()) { e.preventDefault(); return; }
    update();
    var endpoint = form.getAttribute("data-endpoint");
    var local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname) || window.location.protocol === "file:";
    if (!endpoint && !local) return; /* envoi natif : l'hébergeur (Netlify Forms) reçoit le POST puis redirige vers `action` */
    e.preventDefault();
    submit.disabled = true; submit.setAttribute("data-state", "loading");
    status.textContent = "Envoi en cours…";
    var done = function () { window.location.href = thanks(); };
    var fail = function () {
      submit.disabled = false; submit.removeAttribute("data-state");
      status.setAttribute("data-state", "error");
      status.textContent = "L'envoi n'a pas abouti. Réessayez, ou écrivez-nous à hello@hoona.life.";
    };
    if (!endpoint) { window.setTimeout(done, 500); return; } /* aperçu local : aucun envoi */
    fetch(endpoint, { method: "POST", body: new FormData(form), mode: "cors" })
      .then(function (r) { if (r.ok) done(); else fail(); })
      .catch(fail);
  });

  update();
})();
