/* Adarsh Projects — plain JavaScript for the static site.
 * Handles: lead forms (→ Google Apps Script), image gallery lightbox,
 * click-to-load Google Maps and YouTube, analytics after first interaction.
 * Edit the CONFIG block before going live.
 */
(function () {
  "use strict";

  var CONFIG = {
    // Google Apps Script web-app URL (see docs/apps-script-lead-webhook.gs)
    LEAD_WEBHOOK_URL: "https://script.google.com/macros/s/AKfycbwcvCjzoXzMXK6iqnyzMqIjJJkdEjlk2FcBqCSZfiPcImDB681Zh-QwQ2HVNSe8pBFxGg/exec",
    // MSG91 OTP widget (MSG91 dashboard → OTP → Widget). Leave blank to skip OTP.
    // Both values are safe to publish: the secret authkey stays in Apps Script.
    MSG91_WIDGET_ID: "366971686f50373435313031",
    MSG91_TOKEN_AUTH: "563888TYocxF1g6aaba1c3P1",
    // Optional: Google Tag Manager and Microsoft Clarity IDs
    GTM_ID: "",
    CLARITY_ID: "",
  };

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  /* ---------------- MSG91 OTP widget ---------------- */
  var otpReady = null;
  function msgOf(x) {
    if (!x) return "";
    if (typeof x === "string") return x;
    return x.message || x.msg || x.error || (x.type ? x.type : "") || JSON.stringify(x);
  }
  function loadOtpWidget() {
    if (otpReady) return otpReady;
    otpReady = new Promise(function (resolve, reject) {
      if (window.location.protocol === "file:") return reject(new Error("Open the site through a web server (http://…), not by double-clicking the file."));
      var s = document.createElement("script");
      s.src = "https://verify.msg91.com/otp-provider.js";
      s.async = true;
      s.onload = function () {
        if (typeof window.initSendOTP !== "function") return reject(new Error("MSG91 widget script loaded but initSendOTP is missing."));
        try {
          window.initSendOTP({
            widgetId: CONFIG.MSG91_WIDGET_ID,
            tokenAuth: CONFIG.MSG91_TOKEN_AUTH,
            exposeMethods: true,
            captchaRenderId: "msg91-captcha",
            success: function (d) { console.info("[msg91] success", d); },
            failure: function (e) { console.warn("[msg91] failure", e); },
          });
        } catch (e) { return reject(e); }
        // the widget attaches sendOtp/verifyOtp asynchronously — wait for them
        var tries = 0;
        (function wait() {
          if (typeof window.sendOtp === "function" && typeof window.verifyOtp === "function") return resolve();
          if (++tries > 50) return reject(new Error("MSG91 widget did not initialise. Check the Widget ID and Token."));
          setTimeout(wait, 100);
        })();
      };
      s.onerror = function () { reject(new Error("Could not load the MSG91 widget script (blocked by an ad-blocker or network?).")); };
      document.head.appendChild(s);
    });
    otpReady.catch(function () { otpReady = null; });
    return otpReady;
  }
  function otpEnabled() { return !!(CONFIG.MSG91_WIDGET_ID && CONFIG.MSG91_TOKEN_AUTH); }
  var captchaHome = null; // the form that holds the captcha
  function captchaBox(form) {
    var cap = document.getElementById("msg91-captcha");
    if (!cap) { cap = document.createElement("div"); cap.id = "msg91-captcha"; cap.className = "otp-captcha"; }
    // Only move it before the widget has drawn into it (moving a drawn captcha breaks it)
    if (!captchaHome || !cap.hasChildNodes()) {
      var btn = form.querySelector("button");
      if (cap.parentNode !== form) form.insertBefore(cap, btn);
      captchaHome = form;
    }
    return cap;
  }
  function captchaNeeded() { return typeof window.isCaptchaVerified === "function" && !window.isCaptchaVerified(); }
  // Resolves once the visitor has ticked the captcha (or at once if the widget has no captcha)
  function waitForCaptcha(form, onWaiting) {
    return new Promise(function (resolve, reject) {
      if (!captchaNeeded()) return resolve();
      var cap = captchaBox(form);
      onWaiting(captchaHome === form
        ? "Tick the security check above to get your OTP."
        : "Tick the security check in the form where it appears, then press the button there.");
      cap.scrollIntoView({ behavior: "smooth", block: "center" });
      var waited = 0;
      (function poll() {
        if (!captchaNeeded()) return resolve();
        if ((waited += 400) > 180000) return reject(new Error("The security check timed out. Please try again."));
        setTimeout(poll, 400);
      })();
    });
  }
  // Ask for the OTP inside the form; resolves with the MSG91 access token.
  function runOtp(form, phone, onWaiting) {
    captchaBox(form); // captcha (if enabled on the widget) renders inside this form
    return loadOtpWidget()
      .then(function () { return waitForCaptcha(form, onWaiting); })
      .then(function () {
      return new Promise(function (resolve, reject) {
        onWaiting("");
        window.sendOtp("91" + phone, function (data) {
          console.info("[msg91] OTP sent", data);
          var box = document.createElement("div");
          box.className = "otp-box";
          box.innerHTML =
            '<p class="text-sm">Enter the OTP sent to +91 ' + phone + '</p>' +
            '<input class="field otp-input" inputmode="numeric" autocomplete="one-time-code" maxlength="6" aria-label="OTP">' +
            '<button type="button" class="btn btn-gold w-full otp-verify">Verify OTP</button>' +
            '<button type="button" class="otp-resend">Resend OTP</button>' +
            '<p class="text-sm text-alert otp-err" hidden></p>';
          Array.prototype.forEach.call(form.children, function (c) { c.hidden = true; });
          form.appendChild(box);
          var input = box.querySelector(".otp-input"), err = box.querySelector(".otp-err");
          input.focus();
          box.querySelector(".otp-verify").addEventListener("click", function () {
            window.verifyOtp(input.value.trim(), function (d) {
              console.info("[msg91] verified", d);
              resolve((d && (d.message || d.token || d["access-token"])) || "");
            }, function (e) {
              console.warn("[msg91] verify failed", e);
              err.textContent = "Wrong or expired OTP. " + msgOf(e);
              err.hidden = false;
            });
          });
          box.querySelector(".otp-resend").addEventListener("click", function () {
            window.retryOtp(null, function () { err.textContent = "OTP sent again."; err.hidden = false; },
              function (e) { err.textContent = "Could not resend: " + msgOf(e); err.hidden = false; });
          });
        }, function (e) {
          console.warn("[msg91] sendOtp failed", e);
          reject(new Error(msgOf(e) || "MSG91 did not send the OTP."));
        });
      });
      });
  }

  /* ---------------- Lead forms ---------------- */
  function initLeadForms() {
    $$("form[data-leadform]").forEach(function (form) {
      var err = document.createElement("p");
      err.setAttribute("role", "alert");
      err.className = "text-sm text-alert";
      err.hidden = true;
      var btn = form.querySelector("button");
      form.insertBefore(err, btn);
      var note = document.createElement("p");
      note.className = "text-sm otp-note";
      note.hidden = true;
      form.insertBefore(note, btn);
      var setNote = function (msg) { note.textContent = msg; note.hidden = !msg; };

      // Load the OTP widget as soon as the visitor starts filling the form,
      // so any security check is already on screen before they press the button.
      form.addEventListener("focusin", function () {
        if (!otpEnabled()) return;
        captchaBox(form);
        loadOtpWidget().catch(function (e) { console.warn("[msg91] preload failed", e); });
      }, { once: true });

      form.addEventListener("submit", function (e) {
        e.preventDefault();
        err.hidden = true;
        var name = (form.querySelector('input[autocomplete="name"]') || {}).value || "";
        var phoneEl = form.querySelector('input[inputmode="numeric"]');
        var phone = (phoneEl ? phoneEl.value : "").replace(/\D/g, "").slice(-10);
        var selects = form.querySelectorAll("select");
        var project = form.dataset.project || "";
        var bestTime = "";
        selects.forEach(function (s) {
          if (s.getAttribute("aria-label") === "Project") project = s.value;
          if (s.getAttribute("aria-label") === "Best time to call") bestTime = s.value;
        });
        var dateEl = form.querySelector('input[type="date"]');
        var consent = form.querySelector('input[type="checkbox"]');

        if (!name.trim()) return showErr("Please enter your name.");
        if (!/^[6-9]\d{9}$/.test(phone)) return showErr("Enter a valid 10-digit mobile number.");
        if (consent && !consent.checked) return showErr("Please accept the consent to be contacted.");

        var params = new URLSearchParams(window.location.search);
        var utm = {};
        params.forEach(function (v, k) { if (k.indexOf("utm_") === 0 || k === "gclid" || k === "fbclid") utm[k] = v; });

        var lead = {
          name: name.trim().slice(0, 80),
          phone: "+91" + phone,
          project: project,
          intent: form.dataset.intent || "site-visit",
          bestTime: bestTime,
          visitDate: dateEl ? dateEl.value : "",
          page: window.location.pathname,
          utm: utm,
          createdAt: new Date().toISOString(),
          source: "adarshprojects.com",
        };

        btn.disabled = true;
        btn.textContent = "Sending…";

        var send = function (otpToken) {
          lead.otpToken = otpToken || "";
          lead.otpVerified = !!otpToken;
          submit();
        };
        if (otpEnabled()) {
          btn.textContent = "Sending OTP…";
          runOtp(form, phone, setNote).then(send).catch(function (e) {
            setNote("");
            btn.disabled = false;
            btn.textContent = "Verify mobile & continue";
            showErr("We could not send the OTP: " + ((e && e.message) || "unknown error") + " — or call us.");
          });
        } else {
          send("");
        }

        function submit() {
        var done = function () {
          if (form.dataset.brochure) window.open(form.dataset.brochure, "_blank", "noopener");
          window.location.href = "/thank-you/?p=" + encodeURIComponent(project) + "&i=" + encodeURIComponent(lead.intent);
        };

        if (!CONFIG.LEAD_WEBHOOK_URL) {
          console.warn("[lead] LEAD_WEBHOOK_URL is not set in assets/js/site.js — lead not stored", lead);
          return done();
        }
        // Apps Script accepts text/plain without a CORS preflight
        fetch(CONFIG.LEAD_WEBHOOK_URL, { method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(lead) })
          .then(done)
          .catch(function () {
            btn.disabled = false;
            btn.textContent = "Try again";
            showErr("We could not send your request. Please call or WhatsApp us.");
          });
        }

        function showErr(msg) { err.textContent = msg; err.hidden = false; }
      });

      function showErr(msg) { err.textContent = msg; err.hidden = false; }
    });
  }

  /* ---------------- Gallery lightbox ---------------- */
  function initGalleries() {
    var galleries = $$("[data-gallery]");
    if (!galleries.length) return;
    var box = document.createElement("div");
    box.className = "lightbox";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-label", "Image viewer");
    box.hidden = true;
    box.innerHTML =
      '<div class="lightbox-bar"><span class="lightbox-count"></span><button type="button" class="lightbox-close" aria-label="Close">✕ Close</button></div>' +
      '<div class="lightbox-stage"><img alt=""></div>' +
      '<div class="lightbox-nav"><button type="button" class="btn btn-ghost" data-dir="-1">← Prev</button><button type="button" class="btn btn-ghost" data-dir="1">Next →</button></div>';
    document.body.appendChild(box);
    var img = $("img", box), count = $(".lightbox-count", box);
    var items = [], idx = 0;

    function show(i) {
      idx = (i + items.length) % items.length;
      img.src = items[idx].src;
      img.alt = items[idx].alt;
      count.textContent = (idx + 1) + " / " + items.length + " · " + items[idx].alt;
    }
    function close() { box.hidden = true; document.body.style.overflow = ""; }

    galleries.forEach(function (g) {
      var buttons = $$("button[data-full]", g);
      buttons.forEach(function (b, i) {
        b.addEventListener("click", function () {
          items = buttons.map(function (x) { return { src: x.dataset.full, alt: x.dataset.alt || "" }; });
          show(i);
          box.hidden = false;
          document.body.style.overflow = "hidden";
        });
      });
    });
    box.addEventListener("click", function (e) {
      var dir = e.target.getAttribute && e.target.getAttribute("data-dir");
      if (dir) { show(idx + Number(dir)); return; }
      if (e.target === box || e.target.classList.contains("lightbox-close") || e.target.classList.contains("lightbox-stage")) close();
    });
    document.addEventListener("keydown", function (e) {
      if (box.hidden) return;
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") show(idx + 1);
      if (e.key === "ArrowLeft") show(idx - 1);
    });
  }

  /* ---------------- Click-to-load map & video ---------------- */
  function initEmbeds() {
    $$("[data-map-src]").forEach(function (el) {
      var b = el.querySelector("button");
      if (!b) return;
      b.addEventListener("click", function () {
        el.innerHTML = '<iframe src="' + el.dataset.mapSrc + '" title="' + (el.dataset.mapTitle || "Map") +
          '" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen style="width:100%;height:100%;border:0"></iframe>';
      });
    });
    $$("[data-video-id]").forEach(function (el) {
      var b = el.querySelector("button");
      if (!b) return;
      b.addEventListener("click", function () {
        el.innerHTML = '<iframe src="https://www.youtube-nocookie.com/embed/' + el.dataset.videoId +
          '?autoplay=1&rel=0" title="' + (el.dataset.videoTitle || "Video") +
          '" allow="accelerometer; autoplay; encrypted-media; picture-in-picture" allowfullscreen style="width:100%;height:100%;border:0"></iframe>';
      });
    });
  }

  /* ---------------- Thank-you page conversion event ---------------- */
  function initThankYou() {
    if (window.location.pathname.indexOf("/thank-you") !== 0) return;
    var q = new URLSearchParams(window.location.search);
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: "generate_lead", project: q.get("p"), intent: q.get("i") });
  }

  /* ---------------- Analytics after first interaction ---------------- */
  function initAnalytics() {
    if (!CONFIG.GTM_ID && !CONFIG.CLARITY_ID) return;
    var loaded = false;
    function load() {
      if (loaded) return;
      loaded = true;
      if (CONFIG.GTM_ID) {
        window.dataLayer = window.dataLayer || [];
        window.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });
        addScript("https://www.googletagmanager.com/gtm.js?id=" + CONFIG.GTM_ID);
      }
      if (CONFIG.CLARITY_ID) addScript("https://www.clarity.ms/tag/" + CONFIG.CLARITY_ID);
    }
    function addScript(src) { var s = document.createElement("script"); s.async = true; s.src = src; document.head.appendChild(s); }
    ["scroll", "pointerdown", "keydown", "touchstart"].forEach(function (ev) { window.addEventListener(ev, load, { once: true, passive: true }); });
    setTimeout(load, 8000);
  }

  function init() {
    initLeadForms();
    initGalleries();
    initEmbeds();
    initThankYou();
    initAnalytics();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
