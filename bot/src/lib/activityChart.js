// Bar chart of messages per day for one calendar year, for /stats activity.
// Built as SVG and rendered to PNG with resvg (prebuilt binaries, no native build step), using the
// bundled Noto Sans so Greek text renders the same on every host.

const path = require("path");
const { Resvg } = require("@resvg/resvg-js");
const { periodFor } = require("./messageStats");

const FONT_DIR = path.join(__dirname, "..", "..", "assets", "fonts");
const FONT_FILES = [path.join(FONT_DIR, "NotoSans-Regular.ttf")];

const WIDTH = 1040;
const HEIGHT = 470;
const PAD = { left: 76, right: 24, top: 84, bottom: 56 };
const MONTHS = ["Ιαν", "Φεβ", "Μαρ", "Απρ", "Μάι", "Ιούν", "Ιούλ", "Αύγ", "Σεπ", "Οκτ", "Νοέ", "Δεκ"];

const COLORS = {
    background: "#2b2d31",
    grid: "#3f4147",
    axisText: "#949ba4",
    text: "#dbdee1",
    today: "#dbdee1",
    semester: "#4fb8ba",
    exams: "#f4a11c",
    break: "#8b8f96",
    outside: "#5c5f66",
};

const LEGEND = [
    ["semester", "Εξάμηνο"],
    ["exams", "Εξεταστική"],
    ["break", "Διακοπές, διάλειμμα"],
    ["outside", "Εκτός περιόδων"],
];

// The colour of a day comes from the name of its period. Breaks are checked first, so that
// "Διάλειμμα πριν την εξεταστική" is a break and not an exam session.
function kindOf(period) {
    if (!period) return "outside";
    if (/διακοπ|διάλειμμα|καλοκαίρι/i.test(period.name)) return "break";
    if (/εξεταστικ/i.test(period.name)) return "exams";
    return "semester";
}

const escapeXml = (text) => String(text).replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]);

// Top of the y axis: four grid steps of 1, 2, 3, 4 or 5 times a power of ten, so the grid lines land
// on round numbers just above the busiest day.
function niceMax(value) {
    if (value <= 4) return 4;
    const rough = value / 4;
    const magnitude = 10 ** Math.floor(Math.log10(rough));
    const step = [1, 2, 3, 4, 5, 10].find((m) => m * magnitude >= rough) * magnitude;
    return step * 4;
}

const dayIndex = (year, day) => Math.round((Date.UTC(year, Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10))) - Date.UTC(year, 0, 1)) / 86400000);

// days: [{ day: "YYYY-MM-DD", count }] inside the year. today: "YYYY-MM-DD", drawn as a marker when in the year.
function buildActivitySvg({ year, days, periods, today }) {
    const daysInYear = dayIndex(year, `${year}-12-31`) + 1;
    const plotW = WIDTH - PAD.left - PAD.right;
    const plotH = HEIGHT - PAD.top - PAD.bottom;
    const slot = plotW / daysInYear;
    const maxY = niceMax(Math.max(1, ...days.map((d) => d.count)));
    const x = (index) => PAD.left + index * slot;
    const y = (value) => PAD.top + plotH - (value / maxY) * plotH;

    const parts = [`<rect width="${WIDTH}" height="${HEIGHT}" fill="${COLORS.background}"/>`];

    for (let i = 0; i <= 4; i++) {
        const value = (maxY / 4) * i;
        parts.push(`<line x1="${PAD.left}" x2="${WIDTH - PAD.right}" y1="${y(value)}" y2="${y(value)}" stroke="${COLORS.grid}" stroke-width="1"/>`);
        parts.push(`<text x="${PAD.left - 10}" y="${y(value) + 7}" font-size="20" fill="${COLORS.axisText}" text-anchor="end">${value}</text>`);
    }

    MONTHS.forEach((label, month) => {
        const index = dayIndex(year, `${year}-${String(month + 1).padStart(2, "0")}-01`);
        const nextIndex = month === 11 ? daysInYear : dayIndex(year, `${year}-${String(month + 2).padStart(2, "0")}-01`);
        parts.push(`<line x1="${x(index)}" x2="${x(index)}" y1="${PAD.top + plotH}" y2="${PAD.top + plotH + 6}" stroke="${COLORS.grid}" stroke-width="1"/>`);
        parts.push(`<text x="${(x(index) + x(nextIndex)) / 2}" y="${HEIGHT - 18}" font-size="20" fill="${COLORS.axisText}" text-anchor="middle">${label}</text>`);
    });

    const barWidth = Math.max(1, slot * 0.8);
    for (const { day, count } of days) {
        if (!count) continue;
        const top = y(count);
        const color = COLORS[kindOf(periodFor(periods, day))];
        parts.push(`<rect x="${(x(dayIndex(year, day)) + (slot - barWidth) / 2).toFixed(2)}" y="${top.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${(PAD.top + plotH - top).toFixed(2)}" fill="${color}"/>`);
    }

    if (today && today.startsWith(`${year}-`)) {
        const tx = x(dayIndex(year, today) + 0.5);
        parts.push(`<line x1="${tx}" x2="${tx}" y1="${PAD.top - 4}" y2="${PAD.top + plotH}" stroke="${COLORS.today}" stroke-width="1.5" stroke-dasharray="4 4" opacity="0.7"/>`);
        const anchor = tx > WIDTH - 90 ? "end" : "middle";
        parts.push(`<text x="${tx}" y="${PAD.top - 12}" font-size="18" fill="${COLORS.today}" text-anchor="${anchor}">σήμερα</text>`);
    }

    let lx = PAD.left;
    for (const [kind, label] of LEGEND) {
        parts.push(`<rect x="${lx}" y="22" width="18" height="18" rx="4" fill="${COLORS[kind]}"/>`);
        parts.push(`<text x="${lx + 26}" y="38" font-size="20" fill="${COLORS.text}">${escapeXml(label)}</text>`);
        lx += 26 + label.length * 9.6 + 30;
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" font-family="Noto Sans">${parts.join("")}</svg>`;
}

function renderPng(svg) {
    const resvg = new Resvg(svg, {
        font: { fontFiles: FONT_FILES, loadSystemFonts: false, defaultFontFamily: "Noto Sans" },
        fitTo: { mode: "width", value: WIDTH },
    });
    return resvg.render().asPng();
}

module.exports = { buildActivitySvg, renderPng, kindOf, niceMax };
