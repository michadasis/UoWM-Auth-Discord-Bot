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

  // Live previews: <textarea data-live-preview="/url" data-preview-target="#id">. The endpoint
  // gets the text (as "template" and "text") and answers { html, length?, maxLength? }.
  document.querySelectorAll("textarea[data-live-preview]").forEach((editor) => {
    const preview = document.querySelector(editor.dataset.previewTarget || ".preview");
    const count = editor.form.querySelector("[data-count]");
    const csrf = editor.form.querySelector("input[name=csrf]").value;
    if (!preview) return;
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
            body: new URLSearchParams({ csrf, template: editor.value, text: editor.value }),
          });
          if (!res.ok || ticket !== latest) return;
          const data = await res.json();
          preview.innerHTML = data.html;
          if (count && typeof data.length === "number") {
            count.textContent = data.length + " / " + data.maxLength + " χαρακτήρες" + (data.length > data.maxLength ? " · πάνω από το όριο" : "");
            count.classList.toggle("over", data.length > data.maxLength);
          }
        } catch (err) {
          // Offline or logged out: saving still shows the result.
        }
      }, 300);
    });
  });

  // Filter box for a table: <input data-filter="#table"> hides rows that do not match.
  document.querySelectorAll("input[data-filter]").forEach((input) => {
    const table = document.querySelector(input.dataset.filter);
    if (!table) return;
    const rows = [...table.querySelectorAll("tr[data-row]")];
    const fold = (t) => t.normalize("NFKD").replace(/\\p{M}/gu, "").toLocaleLowerCase("el");
    input.addEventListener("input", () => {
      const q = fold(input.value.trim());
      rows.forEach((row) => { row.hidden = q !== "" && !fold(row.textContent).includes(q); });
    });
  });

  // Plain text that mirrors a field as you type: <input data-live-text="#id">.
  document.querySelectorAll("[data-live-text]").forEach((input) => {
    const target = document.querySelector(input.dataset.liveText);
    if (!target) return;
    input.addEventListener("input", () => {
      target.textContent = input.value;
      target.hidden = input.value.trim() === "";
    });
  });

  // Warn before leaving a form with unsaved changes: <form data-unsaved>.
  let dirty = false;
  document.querySelectorAll("form[data-unsaved]").forEach((form) => {
    form.addEventListener("input", () => { dirty = true; });
    form.addEventListener("change", () => { dirty = true; });
    form.addEventListener("submit", () => { dirty = false; });
  });
  window.addEventListener("beforeunload", (event) => {
    if (!dirty) return;
    event.preventDefault();
    event.returnValue = "";
  });
})();`;

module.exports = { CLIENT_JS };
