// Small progressive enhancements for the panel, served as /panel.js (CSP: script-src 'self').
// Every page works without it.

const CLIENT_JS = `(() => {
  "use strict";

  // Confirmation before destructive actions: <form data-confirm="...">.
  document.querySelectorAll("form[data-confirm]").forEach((form) => {
    form.addEventListener("submit", (event) => {
      if (!window.confirm(form.dataset.confirm)) event.preventDefault();
    });
  });

  // A filter box above long role lists.
  document.querySelectorAll(".checks").forEach((list) => {
    const labels = [...list.querySelectorAll("label")];
    if (labels.length < 8) return;
    const input = document.createElement("input");
    input.type = "search";
    input.className = "filter";
    input.placeholder = "Αναζήτηση ρόλου...";
    input.setAttribute("aria-label", "Αναζήτηση ρόλου");
    list.before(input);
    input.addEventListener("input", () => {
      const q = input.value.trim().toLocaleLowerCase("el");
      labels.forEach((label) => {
        label.hidden = q !== "" && !label.textContent.toLocaleLowerCase("el").includes(q);
      });
    });
  });

  // Live preview for the verify message editor.
  const editor = document.querySelector("textarea[data-live-preview]");
  if (editor) {
    const preview = document.querySelector(".preview");
    const count = document.querySelector("[data-count]");
    const csrf = editor.form.querySelector("input[name=csrf]").value;
    let timer = null;
    let latest = 0;
    editor.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const ticket = ++latest;
        try {
          const res = await fetch(editor.dataset.livePreview, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ csrf, template: editor.value }),
          });
          if (!res.ok || ticket !== latest) return;
          const data = await res.json();
          preview.innerHTML = data.html;
          count.textContent = data.length + " / " + data.maxLength + " χαρακτήρες" + (data.length > data.maxLength ? " · πάνω από το όριο" : "");
          count.classList.toggle("over", data.length > data.maxLength);
        } catch (err) {
          // Offline or logged out: the Προεπισκόπηση button still works.
        }
      }, 300);
    });
  }
})();`;

module.exports = { CLIENT_JS };
