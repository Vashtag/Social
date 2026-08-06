/* ==========================================================================
   Shared anonymous global stats for the Anatomy Social Games.

   Counts, across ALL visitors' devices:
     • how many different people have opened each game ("players")
     • how many different people have completed/solved each game

   How it works: each device gets a random id and, the first time it opens or
   completes a game, it bumps a public counter once (guarded in localStorage so
   the same device is only counted once). No personal data is sent — just an
   anonymous increment.

   Backend: a free public counter service (Abacus). To use your OWN backend
   instead (more robust/private), change COUNTER_BASE to a URL that implements:
       GET  <base>/hit/<namespace>/<key>  -> { "value": <number> }   (increment)
       GET  <base>/get/<namespace>/<key>  -> { "value": <number> }   (read)
   e.g. a small Cloudflare Worker + KV. Everything else keeps working.
   ========================================================================== */
(function () {
  var NS = "vashtag-social-v1";
  var COUNTER_BASE = "https://abacus.jasoncameron.dev";

  function lget(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lset(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  function deviceId() {
    var id = lget("vash-device");
    if (!id) {
      id = (self.crypto && crypto.randomUUID)
        ? crypto.randomUUID()
        : (Date.now().toString(36) + Math.random().toString(36).slice(2));
      lset("vash-device", id);
    }
    return id;
  }

  function hit(key) {
    return fetch(COUNTER_BASE + "/hit/" + NS + "/" + key, { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { return j && typeof j.value === "number" ? j.value : null; })
      .catch(function () { return null; });
  }
  function get(key) {
    return fetch(COUNTER_BASE + "/get/" + NS + "/" + key, { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { return j && typeof j.value === "number" ? j.value : null; })
      .catch(function () { return null; });
  }

  // Run fn only once per device (tracked by a localStorage flag).
  function once(flag, fn) {
    if (lget(flag)) return;
    lset(flag, "1");
    fn();
  }

  var VashStats = {
    APPS: ["unscramble", "wordle", "connections", "hangman"],

    // Call on game load: counts this device as a player of <app> (and of the site).
    countVisit: function (app) {
      deviceId();
      once("vs-user-" + app, function () { hit(app + "-users"); });
      once("vs-user-site", function () { hit("site-users"); });
    },

    // Call when the player solves/completes <app>.
    countCompletion: function (app) {
      once("vs-done-" + app, function () { hit(app + "-completions"); });
      once("vs-done-site", function () { hit("site-completions"); });
    },

    // Read one app's { users, completions } (null if unavailable).
    getApp: function (app) {
      return Promise.all([get(app + "-users"), get(app + "-completions")])
        .then(function (a) { return { users: a[0], completions: a[1] }; });
    },

    // Read site-wide unique { users, completions } (null if unavailable).
    getSite: function () {
      return Promise.all([get("site-users"), get("site-completions")])
        .then(function (a) { return { users: a[0], completions: a[1] }; });
    },
  };

  window.VashStats = VashStats;
})();
