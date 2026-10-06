// Sets the visitor's chosen appearance on <html> before the first paint, so a page in dark mode never flashes light
// while the app loads. A classic script from our own origin, as the content security policy allows. The key and the
// values are those of src/shell/appearance.tsx, whose Theme takes over once the app runs.
(function () {
  try {
    var appearance = window.localStorage.getItem("anbudsklar.utseende");
    if (appearance === "light" || appearance === "dark") {
      document.documentElement.setAttribute("data-theme", appearance);
    }
  } catch (error) {
    // Storage can be blocked: the page then follows the device's setting.
  }
})();
