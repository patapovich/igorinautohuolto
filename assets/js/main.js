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
    const plate = $("#rekisteri", form);
    const fieldset = $("fieldset", form);

    const formatPlate = (v) => {
      const s = v.toUpperCase().replace(/[\s_.]+/g, "").replace(/[^A-ZÅÄÖ0-9-]/g, "");
      const m = s.match(/^([A-ZÅÄÖ]{1,3})-?(\d{1,3})$/);
      return m ? `${m[1]}-${m[2]}` : s;
    };
    plate.addEventListener("blur", () => { plate.value = formatPlate(plate.value); });

    const setError = (field, message) => {
      const input = typeof field === "string" ? $(`#${field}`, form) : field;
      const isSet = input.tagName === "FIELDSET";
      const err = $(`#${isSet ? "tyot" : input.id}-virhe`, form);
      const targets = isSet ? $$("input", input) : [input];
      targets.forEach((el) => el.setAttribute("aria-invalid", message ? "true" : "false"));
      if (err) err.textContent = message || "";
      return !message;
    };

    const values = () => {
      const data = new FormData(form);
      return {
        nimi: (data.get("nimi") || "").trim(),
        puhelin: (data.get("puhelin") || "").trim(),
        sahkoposti: (data.get("sahkoposti") || "").trim(),
        rekisteri: formatPlate((data.get("rekisteri") || "").trim()),
        auto: (data.get("auto") || "").trim(),
        tyot: data.getAll("tyo"),
        lisatiedot: (data.get("lisatiedot") || "").trim(),
        ajankohta: data.get("ajankohta") || "",
        website: (data.get("website") || "").trim(),
      };
    };

    function validate(v) {
      const checks = [
        setError("nimi", v.nimi ? "" : "Kirjoita nimesi."),
        setError("puhelin", v.puhelin.replace(/\D/g, "").length >= 6 ? "" : "Kirjoita koko puhelinnumero, johon voimme soittaa."),
        setError(fieldset, v.tyot.length || v.lisatiedot
          ? "" : "Valitse vähintään yksi työ tai kerro lisätiedoissa, mitä autolle pitäisi tehdä."),
        setError("sahkoposti", !v.sahkoposti || $("#sahkoposti", form).checkValidity()
          ? "" : "Tarkista sähköpostiosoite (esim. nimi@esimerkki.fi) tai jätä kenttä tyhjäksi."),
      ];
      return checks.every(Boolean);
    }

    const lower = (s) => s.charAt(0).toLowerCase() + s.slice(1);

    function compose(v) {
      const car = [v.rekisteri, v.auto].filter(Boolean).join(", ");
      const subject = `Hinta-arviopyyntö${car ? ` – ${car}` : ""}`;
      const lines = [];
      if (v.tyot.length) {
        lines.push("Hei,", "", "pyydän hinta-arviota seuraavista töistä:");
        v.tyot.forEach((t) => lines.push(`– ${lower(t)}`));
      } else {
        lines.push("Hei,", "", "pyydän hinta-arviota autoni korjauksesta.");
      }
      if (v.lisatiedot) lines.push("", "Lisätiedot:", v.lisatiedot);
      lines.push("");
      if (v.auto) lines.push(`Auto: ${v.auto}`);
      if (v.rekisteri) lines.push(`Rekisterinumero: ${v.rekisteri}`);
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

    let lastMessage = null;

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const v = values();
      if (!validate(v)) {
        $('[aria-invalid="true"]', form)?.focus(); // ensimmäinen virhe sivun järjestyksessä
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
            tyot: v.tyot, lisatiedot: v.lisatiedot, ajankohta: v.ajankohta,
            website: v.website, t: Date.now() - loadedAt, turnstile: token,
          }),
        });
        const out = await res.json().catch(() => ({}));
        if (!res.ok || !out.ok) throw new Error(out.error || "send");
        form.reset();
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
      const t = e.target;
      if (t.name === "tyo" || t.name === "lisatiedot") setError(fieldset, "");
      else if (t.getAttribute("aria-invalid") === "true") setError(t, "");
    });

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
