/* Status page: applies the saved theme before paint, and wires the optional «back to the bot» link
   and «close» button. An external file, so the page needs no inline script under the CSP. */
(function () {
  "use strict";

  var THEME_KEY = "shieldray-theme";
  var CANVAS = { light: "#F0F0F1", dark: "#0E0D0E" };

  function savedTheme() {
    try {
      var saved = localStorage.getItem(THEME_KEY);
      if (saved === "light" || saved === "dark") return saved;
    } catch (e) {
      /* storage blocked: follow the system setting */
    }
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  var theme = savedTheme();
  document.documentElement.setAttribute("data-theme", theme);

  function ready() {
    var meta = document.getElementById("meta-theme-color");
    if (meta) meta.setAttribute("content", CANVAS[theme]);

    var back = document.getElementById("panel-status-bot-return");
    if (back) {
      back.addEventListener("click", function (event) {
        var https = back.getAttribute("data-https") || "";
        var href = back.getAttribute("href") || "";
        try {
          var app = window.Telegram && window.Telegram.WebApp;
          if (app && typeof app.openTelegramLink === "function" && https.indexOf("https://t.me/") === 0) {
            event.preventDefault();
            app.openTelegramLink(https);
            return;
          }
        } catch (e) {
          /* not inside Telegram */
        }
        // tg:// hands off to the Telegram app; if the page is still visible, fall back to https://t.me.
        if (href.indexOf("tg:") === 0 && https) {
          setTimeout(function () {
            if (!document.hidden) window.location.href = https;
          }, 900);
        }
      });
    }

    var close = document.getElementById("panel-status-close");
    if (close) {
      close.addEventListener("click", function () {
        try {
          var app = window.Telegram && window.Telegram.WebApp;
          if (app && typeof app.close === "function") {
            app.close();
            return;
          }
        } catch (e) {
          /* not inside Telegram */
        }
        try {
          window.close();
        } catch (e) {
          /* the browser may refuse */
        }
        if (history.length > 1) history.back();
      });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ready);
  else ready();
})();
