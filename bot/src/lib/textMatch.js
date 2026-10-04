// Turns Greek or greeklish text into one comparable form: lowercase Latin letters and single
// spaces, without accents. "Πού είναι τα παλιά θέματα;" and "pou einai ta palia 8emata" both
// become "pou einai ta palia themata". Ambiguous letters are merged on purpose (ξ and χ both
// become x, β and b both v): the result is only used for matching, never shown.

const DIGRAPHS = [["ου", "ou"], ["αι", "ai"], ["ει", "ei"], ["οι", "oi"], ["μπ", "b"], ["ντ", "d"], ["γκ", "g"]];
const TH = "\u0001";
const LETTERS = {
    α: "a", β: "v", γ: "g", δ: "d", ε: "e", ζ: "z", η: "i", θ: TH, ι: "i", κ: "k", λ: "l", μ: "m",
    ν: "n", ξ: "x", ο: "o", π: "p", ρ: "r", σ: "s", ς: "s", τ: "t", υ: "i", φ: "f", χ: "x", ψ: "ps", ω: "o",
};
// Greeklish habits, applied to everything so Greek and greeklish meet in the middle.
const GREEKLISH = [
    [/8/g, TH], [/th/g, TH], [/ch/g, "x"], [/ks/g, "x"], [/oy/g, "ou"], [/w/g, "o"], [/y/g, "i"],
    [/h/g, "i"], [/u/g, "ou"], [/oou/g, "ou"], [/mp/g, "b"], [/nt/g, "d"], [/gk/g, "g"], [/3/g, "e"], [/b/g, "v"],
];

function textToLatin(text) {
    let s = String(text ?? "").normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
    for (const [from, to] of DIGRAPHS) s = s.split(from).join(to);
    s = [...s].map((c) => LETTERS[c] ?? c).join("");
    for (const [re, to] of GREEKLISH) s = s.replace(re, to);
    return s.split(TH).join("th").replace(/[^a-z0-9]+/g, " ").trim();
}

module.exports = { textToLatin };
