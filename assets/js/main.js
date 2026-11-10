/* Igorin Autohuolto – sivun toiminnot. Ei riippuvuuksia.
   Jokainen toiminto käynnistetään erikseen, jotta yhden virhe ei kaada muita. */
(() => {
  "use strict";

  const EMAIL = "igor@igorinautohuolto.fi";
  const PHONE_DISPLAY = "050 305 8726";
  const OPEN_HOUR = 8;
  const CLOSE_HOUR = 17;
  const loadedAt = Date.now();

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const run = (name, fn) => { try { fn(); } catch (err) { console.error(`[${name}]`, err); } };

  /* ---------- Aukiolo: Suomen aika ja arkipyhät ---------- */

  function helsinkiNow() {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Helsinki",
      year: "numeric", month: "numeric", day: "numeric",
      hour: "numeric", minute: "numeric", hourCycle: "h23",
    }).formatToParts(new Date());
    const get = (t) => Number(parts.find((p) => p.type === t).value);
    return { y: get("year"), m: get("month"), d: get("day"), h: get("hour"), min: get("minute") };
  }

  // Gregoriaaninen pääsiäislaskenta (Meeus/Jones/Butcher)
  function easterSunday(y) {
    const a = y % 19, b = Math.floor(y / 100), c = y % 100;
    const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(Date.UTC(y, month - 1, day));
  }

  const holidayCache = {};
  function holidays(y) {
    if (holidayCache[y]) return holidayCache[y];
    const map = new Map();
    const key = (dt) => dt.toISOString().slice(0, 10);
    const add = (dt, name) => map.set(key(dt), name);
    const ymd = (m, d) => new Date(Date.UTC(y, m - 1, d));
    const shift = (dt, days) => new Date(dt.getTime() + days * 86400000);
    add(ymd(1, 1), "uudenvuodenpäivä");
    add(ymd(1, 6), "loppiainen");
    const easter = easterSunday(y);
    add(shift(easter, -2), "pitkäperjantai");
    add(shift(easter, 1), "toinen pääsiäispäivä");
    add(shift(easter, 39), "helatorstai");
    add(ymd(5, 1), "vappu");
    for (let d = 19; d <= 25; d++) {
      const dt = ymd(6, d);
      if (dt.getUTCDay() === 5) add(dt, "juhannusaatto");
    }
    add(ymd(12, 6), "itsenäisyyspäivä");
    add(ymd(12, 24), "jouluaatto");
    add(ymd(12, 25), "joulupäivä");
    add(ymd(12, 26), "tapaninpäivä");
    holidayCache[y] = map;
    return map;
  }

  const isoDay = (dt) => ((dt.getUTCDay() + 6) % 7) + 1; // ma = 1 … su = 7
  const holidayName = (dt) => holidays(dt.getUTCFullYear()).get(dt.toISOString().slice(0, 10));
  const isWorkday = (dt) => isoDay(dt) <= 5 && !holidayName(dt);
  const ADESSIVE = ["", "maanantaina", "tiistaina", "keskiviikkona", "torstaina", "perjantaina", "lauantaina", "sunnuntaina"];

  function updateStatus() {
    const now = helsinkiNow();
    const today = new Date(Date.UTC(now.y, now.m - 1, now.d));
    const minutes = now.h * 60 + now.min;
    const holiday = holidayName(today);

    const el = $("#aukiolo-tila");
    if (el) {
      let state, html;
      if (isWorkday(today) && minutes >= OPEN_HOUR * 60 && minutes < CLOSE_HOUR * 60) {
        state = "open";
        html = `<strong>Avoinna nyt</strong>, suljemme klo ${CLOSE_HOUR}`;
      } else {
        state = "closed";
        let next = today;
        let offset = 0;
        if (!(isWorkday(today) && minutes < OPEN_HOUR * 60)) {
          do { offset++; next = new Date(today.getTime() + offset * 86400000); } while (!isWorkday(next) && offset < 14);
        }
        const when = offset === 0 ? "tänään" : offset === 1 ? "huomenna" : ADESSIVE[isoDay(next)];
        const lead = holiday && isoDay(today) <= 5 ? `<strong>Suljettu tänään</strong> (${holiday})` : "<strong>Suljettu nyt</strong>";
        html = `${lead}, avaamme ${when} klo ${OPEN_HOUR}`;
      }
      const text = $(".status__text", el);
      el.dataset.state = state;
      if (text.innerHTML !== html) text.innerHTML = html; // ei turhia ilmoituksia ruudunlukijalle
    }

    const day = isoDay(today);
    $$("#aukioloajat [data-days]").forEach((row) => {
      const [from, to] = row.dataset.days.split("-").map(Number);
      const weekdayHoliday = from === 1 && Boolean(holiday);
      row.classList.toggle("is-today", day >= from && day <= to && !weekdayHoliday);
    });
  }

  run("status", () => {
    updateStatus();
    setInterval(updateStatus, 60000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) updateStatus(); });
  });

  /* ---------- Yläpalkki ---------- */

  run("header", () => {
    const header = $(".site-header");
    const onScroll = () => header.classList.toggle("is-scrolled", window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  });

  /* ---------- Aktiivinen navigaatiolinkki ---------- */

  run("nav", () => {
    const navLinks = $$(".nav a");
    if (!("IntersectionObserver" in window) || !navLinks.length) return;
    const byId = new Map(navLinks.map((a) => [a.getAttribute("href").slice(1), a]));
    const sections = Array.from(byId.keys()).map((id) => document.getElementById(id)).filter(Boolean);
    const visible = new Map();
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => visible.set(e.target.id, e.isIntersecting ? e.intersectionRatio : 0));
      let best = null;
      let bestRatio = 0;
      visible.forEach((ratio, id) => { if (ratio > bestRatio) { best = id; bestRatio = ratio; } });
      navLinks.forEach((a) => a.classList.toggle("is-active", best !== null && a === byId.get(best)));
    }, { rootMargin: "-35% 0px -55% 0px", threshold: [0, 0.01, 0.5, 1] });
    sections.forEach((s) => io.observe(s));
  });

  /* ---------- Pikatoimintopalkki: näkyy, kun heron painikkeet ovat poistuneet näkyvistä ---------- */

  run("actionbar", () => {
    const actionbar = $(".actionbar");
    const heroActions = $(".hero__actions");
    if (!actionbar || !heroActions || !("IntersectionObserver" in window)) return;
    let past = false;
    let typing = false;
    const sync = () => {
      const on = past && !typing;
      actionbar.classList.toggle("is-visible", on);
      actionbar.inert = !on; // piilossa oleva palkki ei saa kohdistusta
    };
    sync();
    new IntersectionObserver(([e]) => {
      past = !e.isIntersecting && e.boundingClientRect.top < 0;
      sync();
    }, { threshold: 0 }).observe(heroActions);
    document.addEventListener("focusin", (e) => { typing = !!e.target.closest("input, textarea, select"); sync(); });
    document.addEventListener("focusout", () => { typing = false; setTimeout(sync, 50); });
  });

  /* ---------- Galleria ---------- */

  run("gallery", () => {
    const dialog = $("#lightbox");
    const tiles = $$("#galleria button");
    if (!dialog || !tiles.length || typeof dialog.showModal !== "function") return;
    const img = $("#lightbox-img");
    const avif = $("#lightbox-avif");
    const webp = $("#lightbox-webp");
    const caption = $("#lightbox-caption");
    let index = 0;
    let opener = null;

    const show = (i) => {
      index = (i + tiles.length) % tiles.length;
      const t = tiles[index];
      avif.srcset = t.dataset.avif;
      webp.srcset = t.dataset.webp;
      img.src = t.dataset.jpg;
      img.alt = t.querySelector("img").alt;
      caption.textContent = t.dataset.caption;
    };

    tiles.forEach((t, i) => t.addEventListener("click", () => {
      opener = t;
      show(i);
      dialog.showModal();
    }));

    dialog.addEventListener("click", (e) => {
      const action = e.target.closest("[data-lightbox]")?.dataset.lightbox;
      if (action === "prev") show(index - 1);
      else if (action === "next") show(index + 1);
      else if (action === "close" || e.target === dialog) dialog.close();
    });
    dialog.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft") { e.preventDefault(); show(index - 1); }
      if (e.key === "ArrowRight") { e.preventDefault(); show(index + 1); }
    });
    dialog.addEventListener("close", () => opener?.focus());

    let startX = null;
    dialog.addEventListener("pointerdown", (e) => { startX = e.clientX; });
    dialog.addEventListener("pointercancel", () => { startX = null; });
    dialog.addEventListener("pointerup", (e) => {
      if (startX === null) return;
      const dx = e.clientX - startX;
      startX = null;
      if (Math.abs(dx) > 50 && e.pointerType !== "mouse") show(index + (dx < 0 ? 1 : -1));
    });
  });

  /* ---------- Hinta-arviolomake ---------- */

  run("form", () => {
    const form = $("#tarjouslomake");
    if (!form) return;
    form.hidden = false; // ilman JavaScriptiä lomake pysyy piilossa ja tilalla näkyvät yhteystiedot

    const endpoint = form.dataset.endpoint || "";
    const sitekey = form.dataset.sitekey || "";
    const live = Boolean(endpoint && sitekey);
    const submitBtn = $("#laheta", form);
    const result = $("#lomake-tulos", form);
    const fieldset = $("#tyot", form);
    const plate = $("#rekisteri", form);
    const plateHint = $("#rekisteri-vihje", form);
    const noPlate = $("#ei-rekisteria", form);
    const car = $("#auto", form);
    const carOpt = $("#auto-valinnainen", form);
    const kmInput = $("#km", form);
    const kmHint = $("#km-vihje", form);
    const kmOpt = $("#km-valinnainen", form);
    const axleField = $("#akseli-kentta", form);
    const tyreField = $("#renkaat-kentta", form);
    const notes = $("#lisatiedot", form);
    const hintList = $("#lisatiedot-vihje", form);
    const needs = $("#tarvitaan", form);
    const needsList = $(".needs__list", needs);
    const needsLead = $(".needs__lead", needs);

    /* Poistumisen (blur) muutokset tehdään vasta, kun painallus on päättynyt. Muuten esiin tuleva
       virhe siirtää asettelua, ja klikkaus osuu ohi esimerkiksi lähetyspainikkeesta.
       Kosketusnäytöllä pointerup tulee ennen kuin fokus siirtyy (mousedown), joten painallus päättyy
       vasta napautuksen click-tapahtumaan tai varalta 600 ms:n kuluttua (napautus ilman clickiä). */
    let pressing = false;
    let afterPress = [];
    let releaseTimer = 0;
    const release = () => {
      clearTimeout(releaseTimer);
      pressing = false;
      const fns = afterPress;
      afterPress = [];
      if (fns.length) setTimeout(() => fns.forEach((fn) => fn()), 0);
    };
    document.addEventListener("pointerdown", () => {
      clearTimeout(releaseTimer);
      pressing = true;
    }, true);
    document.addEventListener("pointerup", (e) => {
      if (e.pointerType === "mouse") return release();
      clearTimeout(releaseTimer);
      releaseTimer = setTimeout(release, 600);
    }, true);
    document.addEventListener("pointercancel", release, true);
    document.addEventListener("click", release, true);
    const onLeave = (el, fn) => el.addEventListener("blur", () => (pressing ? afterPress.push(fn) : fn()));

    /* Rekisterinumero: suomalainen kilpi on 1–3 kirjainta ja 1–3 numeroa. "abc 123", "ABC123", "abc–123",
       "FIN ABC-123" ja "ABC-1O3" (O-kirjain numerona) -> "ABC-123". Muut tunnukset jätetään sellaisinaan. */
    const PLATE = /^[A-ZÅÄÖ]{1,3}-\d{1,3}$/;
    const formatPlate = (v) => {
      const s = v.toUpperCase().replace(/[\s_.–—]+/g, "").replace(/[^A-ZÅÄÖ0-9-]/g, "");
      const fit = (x) => {
        const m = x.match(/^([A-ZÅÄÖ]{1,3})-?(?=[\dO]*\d)([\dO]{1,3})$/);
        return m ? `${m[1]}-${m[2].replace(/O/g, "0")}` : "";
      };
      return fit(s) || (s.startsWith("FIN") && fit(s.slice(3).replace(/^-/, ""))) || s;
    };
    const PLATE_HINT = plateHint.textContent;
    const checkPlate = () => {
      plate.value = formatPlate(plate.value);
      plateHint.textContent = plate.value && !PLATE.test(plate.value)
        ? "Suomalainen kilpi on muotoa ABC-123. Ulkomaisen kilven voit kirjoittaa sellaisenaan."
        : PLATE_HINT;
    };
    onLeave(plate, checkPlate);

    /* Mittarilukema: "152 000", "152000 km", "152 tkm", "152 t.km", "152t", "152,5 tkm" -> 152000.
       Likimääräiset kelpaavat: "noin 150 000", "n. 150 tkm", "yli 200 tkm", "~150000", "150 000 km?".
       Pelkkä 1–999 tulkitaan tuhansiksi, ja siitä kerrotaan kentän alla. */
    function parseKm(raw) {
      let s = String(raw || "").toLowerCase().replace(/[\s  ]/g, "");
      if (!s) return null;
      s = s.replace(/^(noin|n\.?|yli|alle|ca\.?|~|≈)/, "").replace(/[?!]+$/, "").replace(/(kilometri[aä]?|km)\.?$/, "");
      const thousands = /(tuhatta|t\.?|k)$/.test(s);
      s = s.replace(/(tuhatta|t\.?|k)$/, "");
      if (/^\d{1,3}([.,]\d{3})+$/.test(s)) s = s.replace(/[.,]/g, "");
      if (!/^\d+([.,]\d+)?$/.test(s)) return { km: NaN, guessed: false };
      let n = Number(s.replace(",", "."));
      let guessed = false;
      if (thousands) n *= 1000;
      else if (n > 0 && n < 1000) { n *= 1000; guessed = true; }
      n = Math.round(n);
      return n <= 2000000 ? { km: n, guessed } : { km: NaN, guessed: false };
    }
    const fmtKm = (n) => n.toLocaleString("fi-FI");
    const KM_HINT = kmHint.textContent;
    // Tunnistamaton lukema ei estä lähettämistä: se näytetään virheenä ja lähetetään tekstinä (values: kmText).
    const checkKm = () => {
      const r = parseKm(kmInput.value);
      kmHint.textContent = KM_HINT;
      if (r && Number.isNaN(r.km)) { setError(kmInput, "Tarkista lukema. Kirjoita se numeroina, esim. 152 000.", true); return; }
      setError(kmInput, "");
      if (!r) return;
      kmInput.value = fmtKm(r.km);
      if (r.guessed) kmHint.textContent = `Muutimme lukeman muotoon ${fmtKm(r.km)} km. Korjaa, jos se on väärin.`;
    };
    onLeave(kmInput, checkKm);

    /* Tarkentavat kentät näkyvät vain valittujen töiden mukaan. Piilossa olevat kentät
       ovat pois käytöstä, joten niiden arvoja ei lähetetä. */
    const KM_NEEDED = ["Määräaikaishuolto", "Jakohihna"]; // näissä lukema tarvitaan hinta-arvioon
    const KM_REQUIRED = "Määräaikaishuolto"; // huollon sisältö ja hinta riippuvat lukemasta: pakollinen
    const KM_MISSING = "Kirjoita mittarilukema. Likimääräinen lukema riittää, esim. 150 000.";
    const reveal = (block, on) => {
      block.hidden = !on;
      $$("input", block).forEach((el) => { el.disabled = !on; });
    };
    function syncJobs() {
      const jobs = $$('input[name="tyo"]:checked', form).map((el) => el.value);
      reveal(axleField, jobs.includes("Jarrut"));
      reveal(tyreField, jobs.includes("Renkaat"));
      // Mittarilukema näkyy aina: valinnainen, paitsi määräaikaishuollossa.
      const kmRequired = jobs.includes(KM_REQUIRED);
      kmOpt.hidden = kmRequired;
      kmInput.setAttribute("aria-required", String(kmRequired));
      if (!kmRequired && $("#km-virhe", form).textContent === KM_MISSING) setError(kmInput, ""); // ehto ensin: setError määritellään myöhemmin
    }

    // Ilman rekisterinumeroa auton merkki ja malli on pakollinen.
    function syncPlate() {
      const none = noPlate.checked;
      plate.disabled = none;
      plate.required = !none;
      car.required = none;
      carOpt.hidden = none;
      setError(none ? "rekisteri" : "auto", "");
    }

    /* Ohjaus: vihje ja esimerkki lisätietoihin valittujen töiden mukaan sekä lista siitä,
       mitä hinta-arvioon vielä tarvitaan. Lista ei estä lähettämistä. */
    const HINTS = {
      "Määräaikaishuolto": ["kerro, milloin auto on viimeksi huollettu.", "Esim. edellinen huolto noin vuosi sitten, huoltovalo palaa."],
      "Öljynvaihto": ["kerro, milloin öljy on viimeksi vaihdettu.", "Esim. öljy vaihdettiin viimeksi noin vuosi sitten."],
      "Katsastushuolto": ["kerro katsastuspäivä ja mahdolliset huomautukset tai hylkäyksen syyt.", "Esim. katsastus ensi kuussa. Viimeksi tuli huomautus etupyörän laakerista."],
      "Vianhaku": ["kerro, mitä oireita on, milloin ne ilmenevät ja palaako jokin merkkivalo.", "Esim. moottorin merkkivalo syttyi eilen, ja auto nykii kylmänä."],
      "Jarrut": ["kerro, mitä jarruttaessa kuuluu tai tuntuu, esimerkiksi vinkunaa, kolinaa tai tärinää.", "Esim. edestä kuuluu vinkunaa jarruttaessa, ja ohjauspyörä tärisee."],
      "Renkaat": ["", "Esim. talvirenkaat ovat jo vanteilla."], // tarkennus kysytään valinnoilla
      "Jakohihna": ["kerro, onko hihna vaihdettu aiemmin ja millä mittarilukemalla.", "Esim. hihna vaihdettiin viimeksi, kun mittarissa oli 90 000 km."],
      "Sähkötyöt": ["kerro, mikä ei toimi tai mitä pitäisi asentaa.", "Esim. vasen takavalo ei pala."],
      "Muu korjaus": ["kerro, mitä pitäisi korjata ja miten vika ilmenee.", "Esim. pakoputki kolisee alustaa vasten."],
    };
    const HINT_DEFAULT = hintList.textContent.trim();
    const PLACEHOLDER_DEFAULT = notes.placeholder;
    const KM_IN_TEXT = /\d\s*(t\.?\s*)?km\b|\d\s*(tkm|tuhatta)/i;
    const AXLE_IN_TEXT = /(^|[^a-zåäö])(etu|edes|taka|molem)/i;
    const SYMPTOM_JOBS = ["Vianhaku", "Sähkötyöt", "Muu korjaus"];
    const BRAKES = { etujarrut: "etujarrut", takajarrut: "takajarrut", molemmat: "etu- ja takajarrut", "en tiedä": "jarrut" };
    let lastChip = "";
    let started = false;
    let needsKey = null;

    function missing(v) {
      const has = (t) => v.tyot.includes(t);
      const out = [];
      if (!v.tyot.length && !v.lisatiedot) out.push(["tyot", "valittu työ tai vian kuvaus"]);
      if (!v.eiRekisteria && !v.rekisteri) out.push(["rekisteri", "rekisterinumero"]);
      if (v.eiRekisteria && !v.auto) out.push(["auto", "auton merkki ja malli"]);
      if (KM_NEEDED.some(has) && v.km === null && !KM_IN_TEXT.test(v.lisatiedot)) {
        out.push(["km", "mittarilukema"]);
      }
      if (has("Jarrut") && !v.akseli && !AXLE_IN_TEXT.test(v.lisatiedot)) out.push(["akseli", "tieto etu- tai takajarruista"]);
      if (has("Renkaat") && !v.renkaat.length && v.lisatiedot.length < 20) out.push(["renkaat", "tieto rengastyöstä"]);
      if (SYMPTOM_JOBS.some(has) && v.lisatiedot.length < 20) out.push(["lisatiedot", "lyhyt kuvaus viasta tai työstä"]);
      return out;
    }

    function guide(e) {
      const t = e?.target;
      if (t?.name === "tyo") lastChip = t.checked ? t.value : (lastChip === t.value ? "" : lastChip);
      const v = values();
      if (!t || t.name === "tyo") {
        const hinted = v.tyot.filter((j) => HINTS[j]?.[0]);
        hintList.innerHTML = hinted.length
          ? hinted.map((j) => `<li><b>${j}:</b> ${HINTS[j][0]}</li>`).join("")
          : `<li>${HINT_DEFAULT}</li>`;
        const ex = HINTS[lastChip] ? lastChip : v.tyot.find((j) => HINTS[j]);
        notes.placeholder = ex ? HINTS[ex][1] : PLACEHOLDER_DEFAULT;
      }
      if (!started) return;
      const list = missing(v);
      const key = list.map(([id]) => id).join();
      if (key === needsKey) return; // ei turhaa uudelleenpiirtoa kirjoittaessa
      needsKey = key;
      needs.hidden = false;
      needs.toggleAttribute("data-done", !list.length);
      needsLead.textContent = list.length ? "Tarkkaan hinta-arvioon tarvitaan vielä:" : "Tiedot riittävät hinta-arvioon.";
      needsList.innerHTML = list.map(([id, label]) => `<li><button type="button" data-goto="${id}">${label}</button></li>`).join("");
    }

    needsList.addEventListener("click", (e) => {
      const id = e.target.closest("[data-goto]")?.dataset.goto;
      if (!id) return;
      const target = id === "tyot" ? $('input[name="tyo"]', form)
        : id === "akseli" || id === "renkaat" ? $(`#${id} input`, form)
        : $(`#${id}`, form);
      target?.focus();
    });

    /* Yksi yhteinen ilmoitusalue ruudunlukijalle: kentästä poistuttaessa näkyviin tuleva virhe luetaan hetken
       päästä, jottei se puhu seuraavan kentän päälle. Lähetyksessä kohdistus siirtyy virheelliseen kenttään,
       jolloin virhe luetaan kentän kuvauksena (aria-describedby), eikä sitä ilmoiteta erikseen. */
    const announcer = $("#lomake-ilmoitus", form);
    let announceTimer = null;
    let announcedFor = null;
    const announce = (input, message) => {
      if (!announcer) return;
      clearTimeout(announceTimer);
      if (!message) {
        if (announcedFor === input) { announcer.textContent = ""; announcedFor = null; }
        return;
      }
      const label = input.labels?.[0]?.firstChild?.textContent?.trim() || "";
      announcedFor = input;
      announcer.textContent = "";
      announceTimer = setTimeout(() => { announcer.textContent = label ? `${label}: ${message}` : message; }, 500);
    };

    const setError = (field, message, spoken = false) => {
      const input = typeof field === "string" ? $(`#${field}`, form) : field;
      const isSet = input.tagName === "FIELDSET";
      const err = $(`#${isSet ? "tyot" : input.id}-virhe`, form);
      const targets = isSet ? $$('input[name="tyo"]', input) : [input];
      targets.forEach((el) => el.setAttribute("aria-invalid", message ? "true" : "false"));
      if (err) err.textContent = message || "";
      if (spoken || !message) announce(input, message);
      return !message;
    };

    /* Näkymättömät suunta- ja muotoilumerkit (esim. puhelimen yhteystiedoista kopioidussa numerossa)
       pois ennen tarkistusta. Lomakkeen vastaanotin poistaa samat merkit. */
    const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g;

    // FormData ohittaa pois käytöstä olevat kentät: piilotetut tarkennukset ja rekisterinumeron, kun sitä ei ole.
    const values = () => {
      const data = new FormData(form);
      const kmRaw = (data.get("km") || "").trim();
      const km = parseKm(kmRaw);
      return {
        nimi: (data.get("nimi") || "").trim(),
        puhelin: (data.get("puhelin") || "").replace(INVISIBLE, "").trim(),
        sahkoposti: (data.get("sahkoposti") || "").trim(),
        rekisteri: formatPlate((data.get("rekisteri") || "").trim()),
        eiRekisteria: noPlate.checked,
        auto: (data.get("auto") || "").trim(),
        tyot: data.getAll("tyo"),
        km: km && !Number.isNaN(km.km) ? km.km : null,
        kmText: km && Number.isNaN(km.km) ? kmRaw : "", // tunnistamaton lukema sellaisenaan
        akseli: data.get("akseli") || "",
        renkaat: data.getAll("renkaat"),
        lisatiedot: (data.get("lisatiedot") || "").trim(),
        ajankohta: data.get("ajankohta") || "",
        website: (data.get("website") || "").trim(),
      };
    };

    /* Puhelinnumero: numerot, välilyönnit, yhdysmerkit ja sulkeet, + vain alussa, 6–15 numeroa.
       Vastaanotin tarkistaa saman säännön. */
    const PHONE = /^\+?(?:[\s()-]*\d){6,15}[\s()-]*$/;
    const PHONE_CHARS = /^\+?[\d\s()-]*$/;
    // Sähköposti kuten vastaanottimessa: selaimen tarkistus hyväksyy myös pisteettömän verkkotunnuksen (nimi@gmailcom).
    const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

    // Kenttäkohtaiset tarkistukset: virheteksti tai "". Käytetään lähetettäessä ja kentästä poistuttaessa.
    const CHECKS = {
      rekisteri: (v) => (v.eiRekisteria || v.rekisteri.replace(/[^A-ZÅÄÖ0-9]/g, "").length >= 2
        ? "" : "Kirjoita rekisterinumero tai rastita sen alla oleva kohta."),
      auto: (v) => (!v.eiRekisteria || v.auto ? "" : "Kirjoita auton merkki ja malli."),
      nimi: (v) => (v.nimi ? "" : "Kirjoita nimesi."),
      puhelin: (v) => {
        if (PHONE.test(v.puhelin)) return "";
        return PHONE_CHARS.test(v.puhelin) && v.puhelin.replace(/\D/g, "").length < 6
          ? "Kirjoita koko puhelinnumero, johon voimme soittaa."
          : "Tarkista puhelinnumero. Kirjoita se numeroina, esim. 040 123 4567.";
      },
      sahkoposti: (v) => (!v.sahkoposti || ($("#sahkoposti", form).checkValidity() && EMAIL_RE.test(v.sahkoposti))
        ? "" : "Tarkista sähköpostiosoite (esim. nimi@esimerkki.fi) tai jätä kenttä tyhjäksi."),
    };
    const CHECKED = Object.keys(CHECKS);

    /* Määräaikaishuollossa lukema on pakollinen. Lukema lisätiedoissa ("n. 180 tkm") tai tunnistamaton
       teksti kentässä (lähetetään sellaisenaan) kelpaa. true = lukema puuttuu. */
    const kmMissing = (v) => v.tyot.includes(KM_REQUIRED) && v.km === null && !v.kmText && !KM_IN_TEXT.test(v.lisatiedot);

    function validate(v) {
      if (!kmMissing(v) && $("#km-virhe", form).textContent === KM_MISSING) setError(kmInput, "");
      const checks = [
        setError(fieldset, v.tyot.length || v.lisatiedot
          ? "" : "Valitse vähintään yksi työ tai kerro lisätiedoissa, mitä autolle pitäisi tehdä."),
        ...(kmMissing(v) ? [setError(kmInput, KM_MISSING)] : []),
        ...CHECKED.map((id) => setError(id, CHECKS[id](v))),
      ];
      return checks.every(Boolean);
    }

    // Puhelinnumerosta näkymättömät merkit pois myös kentästä, jottei sama virhe toistu.
    const phoneInput = $("#puhelin", form);
    phoneInput.addEventListener("blur", () => {
      const v = phoneInput.value.replace(INVISIBLE, "");
      if (v !== phoneInput.value) phoneInput.value = v;
    });

    // Kenttä tarkistetaan, kun siitä poistutaan, mutta vasta kun siihen on kirjoitettu.
    const touched = new Set();
    CHECKED.forEach((id) => {
      const el = $(`#${id}`, form);
      onLeave(el, () => { if (touched.has(id)) setError(el, CHECKS[id](values()), true); });
    });

    const lower = (s) => s.charAt(0).toLowerCase() + s.slice(1);
    const jobLine = (t, v) => {
      if (t === "Jarrut" && v.akseli) return BRAKES[v.akseli];
      if (t === "Renkaat" && v.renkaat.length) return `renkaat: ${v.renkaat.map(lower).join(", ")}`;
      return lower(t);
    };

    function compose(v) {
      const carText = [v.rekisteri, v.auto].filter(Boolean).join(", ");
      const subject = `Hinta-arviopyyntö${carText ? ` – ${carText}` : ""}`;
      const lines = [];
      if (v.tyot.length) {
        lines.push("Hei,", "", "pyydän hinta-arviota seuraavista töistä:");
        v.tyot.forEach((t) => lines.push(`– ${jobLine(t, v)}`));
      } else {
        lines.push("Hei,", "", "pyydän hinta-arviota autoni korjauksesta.");
      }
      if (v.lisatiedot) lines.push("", "Lisätiedot:", v.lisatiedot);
      lines.push("");
      if (v.auto) lines.push(`Auto: ${v.auto}`);
      if (v.eiRekisteria) lines.push("Rekisterinumero: ei tiedossa");
      else if (v.rekisteri) lines.push(`Rekisterinumero: ${v.rekisteri}`);
      if (v.km !== null) lines.push(`Mittarilukema: ${fmtKm(v.km)} km`);
      else if (v.kmText) lines.push(`Mittarilukema: ${v.kmText}`);
      lines.push(`Toivottu ajankohta: ${lower(v.ajankohta)}`, "");
      lines.push(`Nimi: ${v.nimi}`, `Puhelin: ${v.puhelin}`);
      if (v.sahkoposti) lines.push(`Sähköposti: ${v.sahkoposti}`);
      return { subject, body: lines.join("\n") };
    }

    const mailtoHref = (msg) =>
      `mailto:${EMAIL}?subject=${encodeURIComponent(msg.subject)}&body=${encodeURIComponent(msg.body.replace(/\n/g, "\r\n"))}`;

    function showResult(tone, html) {
      result.dataset.tone = tone;
      result.innerHTML = html;
      result.hidden = false;
      setTimeout(() => result.focus({ preventScroll: false }), 50);
    }

    function fallbackPanel(msg, lead) {
      showResult("error", `
        <p><b>${lead}</b></p>
        <p>Lähetä pyyntö omalla sähköpostiohjelmallasi tai soita numeroon ${PHONE_DISPLAY}.</p>
        <div class="result__actions">
          <a class="btn btn--sm btn--dark" href="${mailtoHref(msg)}">Avaa valmis sähköpostiviesti</a>
          <button class="btn btn--sm btn--outline" type="button" data-copy>Kopioi viesti</button>
        </div>`);
    }

    /* Turnstile ladataan vasta, kun lomaketta aletaan täyttää. */
    let turnstileToken = "";
    let turnstileWidget = null;
    let turnstileLoading = null;
    function loadTurnstile() {
      if (!live) return Promise.resolve(false);
      if (turnstileLoading) return turnstileLoading;
      turnstileLoading = new Promise((resolve) => {
        window.onTurnstileLoad = () => {
          turnstileWidget = window.turnstile.render("#turnstile", {
            sitekey,
            language: "fi",
            appearance: "interaction-only",
            callback: (t) => { turnstileToken = t; },
            "expired-callback": () => { turnstileToken = ""; },
            "error-callback": () => { turnstileToken = ""; },
          });
          resolve(true);
        };
        const s = document.createElement("script");
        s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onTurnstileLoad";
        s.async = true;
        s.onerror = () => resolve(false);
        document.head.append(s);
      });
      return turnstileLoading;
    }
    if (live) form.addEventListener("focusin", () => { loadTurnstile(); }, { once: true });

    const waitForToken = async (ms) => {
      const until = Date.now() + ms;
      while (!turnstileToken && Date.now() < until) await new Promise((r) => setTimeout(r, 200));
      return turnstileToken;
    };

    // Lähetyksen jälkeen lomake palautetaan alkutilaan: kentät, vihjeet ja muistilista.
    function resetForm() {
      form.reset();
      touched.clear();
      plateHint.textContent = PLATE_HINT;
      kmHint.textContent = KM_HINT;
      setError(kmInput, "");
      started = false;
      needsKey = null;
      needs.hidden = true;
      lastChip = "";
      syncJobs();
      syncPlate();
      guide();
    }

    let lastMessage = null;

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const v = values();
      if (!validate(v)) {
        // Ensimmäinen estävä virhe sivun järjestyksessä. Lukeman muotovirhe ei estä, puuttuva lukema estää.
        $(`[aria-invalid="true"]${kmMissing(v) ? "" : ":not(#km)"}`, form)?.focus();
        return;
      }
      const msg = compose(v);
      lastMessage = msg;

      if (!live) {
        window.location.href = mailtoHref(msg);
        showResult("info", `
          <p><b>Viesti on valmiina sähköpostiohjelmassasi.</b> Muista vielä lähettää viesti.</p>
          <p>Eikö viesti avautunut? Kopioi viesti ja lähetä se osoitteeseen <a href="mailto:${EMAIL}">${EMAIL}</a> tai soita numeroon ${PHONE_DISPLAY}.</p>
          <div class="result__actions"><button class="btn btn--sm btn--dark" type="button" data-copy>Kopioi viesti</button></div>`);
        return;
      }

      submitBtn.disabled = true;
      const label = $("span", submitBtn);
      const original = label.textContent;
      label.textContent = "Lähetetään…";
      try {
        const loaded = await loadTurnstile();
        const token = loaded ? await waitForToken(15000) : "";
        if (!token) throw new Error("captcha");
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nimi: v.nimi, puhelin: v.puhelin, sahkoposti: v.sahkoposti, rekisteri: v.rekisteri, auto: v.auto,
            tyot: v.tyot, ajankohta: v.ajankohta,
            // Vastaanotin hyväksyy lukeman vain numerona: tunnistamaton lukema lisätietojen perään.
            lisatiedot: v.kmText ? [v.lisatiedot, `Mittarilukema: ${v.kmText}`].filter(Boolean).join("\n\n") : v.lisatiedot,
            km: v.km, akseli: v.akseli, renkaat: v.renkaat, eiRekisteria: v.eiRekisteria,
            website: v.website, t: Date.now() - loadedAt, turnstile: token,
          }),
        });
        const out = await res.json().catch(() => ({}));
        if (!res.ok || !out.ok) throw new Error(out.error || "send");
        resetForm();
        showResult("ok", `
          <p><b>Kiitos! Hinta-arviopyyntö on lähetetty.</b></p>
          <p>Vastaamme arkipäivisin mahdollisimman pian. Kiireellisissä asioissa soita numeroon ${PHONE_DISPLAY}.</p>`);
      } catch (err) {
        const lead = err.message === "rate" || err.message === "daily_cap"
          ? "Lomakkeella on juuri nyt paljon lähetyksiä, eikä pyyntö mennyt perille."
          : "Pyyntö ei mennyt perille.";
        fallbackPanel(msg, lead);
      } finally {
        submitBtn.disabled = false;
        label.textContent = original;
        turnstileToken = "";
        if (turnstileWidget !== null && window.turnstile) window.turnstile.reset(turnstileWidget);
      }
    });

    form.addEventListener("input", (e) => {
      started = true;
      const t = e.target;
      if (CHECKED.includes(t.id)) touched.add(t.id);
      if (t.name === "tyo") syncJobs();
      if (t === noPlate) syncPlate();
      guide(e);
      if (t.name === "tyo" || t.name === "lisatiedot") setError(fieldset, "");
      else if (t.getAttribute("aria-invalid") === "true") setError(t, "");
    });

    // Selain voi palauttaa valinnat, kun sivulle palataan.
    syncJobs();
    syncPlate();
    guide();

    result.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-copy]");
      if (!btn) return;
      const msg = lastMessage || compose(values());
      const text = `${msg.subject}\n\n${msg.body}`;
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.append(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
      }
      btn.textContent = "Kopioitu";
      setTimeout(() => { btn.textContent = "Kopioi viesti"; }, 2500);
    });
  });
})();
