/* Runs before first paint: apply the saved theme (shared with the app). */
(function () {
  try {
    var t = localStorage.getItem('shieldray-theme');
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  } catch (e) {}
})();
