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

  // Daily chart on the stats page: the "σήμερα" marker follows the cursor and shows that day.
  const MONTHS = ["Ιαν", "Φεβ", "Μαρ", "Απρ", "Μαΐ", "Ιουν", "Ιουλ", "Αυγ", "Σεπ", "Οκτ", "Νοε", "Δεκ"];
  document.querySelectorAll("svg.activity-chart").forEach((svg) => {
    const g = svg.querySelector("g.cursor");
    if (!g) return;
    const line = g.querySelector("line");
    const label = g.querySelector("text");
    const year = Number(svg.dataset.year);
    const left = Number(svg.dataset.left);
    const slot = Number(svg.dataset.slot);
    const right = Number(svg.dataset.plotRight);
    const counts = svg.dataset.counts.split(",").map(Number);
    const vbWidth = svg.viewBox.baseVal.width;

    function place(x, text) {
      line.setAttribute("x1", x);
      line.setAttribute("x2", x);
      label.setAttribute("x", x);
      label.textContent = text;
      label.setAttribute("text-anchor", x > right - 110 ? "end" : x < left + 110 ? "start" : "middle");
    }
    function reset() {
      if (g.dataset.home) {
        g.removeAttribute("visibility");
        place(Number(g.dataset.home), "σήμερα");
      } else {
        g.setAttribute("visibility", "hidden");
      }
    }
    svg.addEventListener("pointermove", (event) => {
      const box = svg.getBoundingClientRect();
      const x = (event.clientX - box.left) * (vbWidth / box.width);
      const i = Math.floor((x - left) / slot);
      if (i < 0 || i >= counts.length) return reset();
      const d = new Date(Date.UTC(year, 0, 1 + i));
      const date = d.getUTCDate() + " " + MONTHS[d.getUTCMonth()];
      const n = counts[i];
      const text = n < 0 ? date + " · χωρίς καταμέτρηση" : date + " · " + n.toLocaleString("el-GR") + (n === 1 ? " μήνυμα" : " μηνύματα");
      g.removeAttribute("visibility");
      place(left + (i + 0.5) * slot, text);
    });
    svg.addEventListener("pointerleave", reset);
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
