/*
 * build-docs.js — render docs-src/*.md into the styled /docs section.
 *
 * Usage:   node build-docs.js        (or: npm run docs)
 *
 * Reads Markdown from ./docs-src, wraps each page in the site shell (header +
 * sidebar + footer, /docs/docs.css), and writes static HTML to ./docs.
 * Self-contained output: no client-side JS, no CDNs. Edit the Markdown in
 * docs-src/, re-run this, and commit the regenerated ./docs/*.html.
 */
const fs = require("fs");
const path = require("path");

// Resolve `marked` from a local install or the sibling vektes-contracts repo.
let marked;
for (const cand of [
  "marked",
  path.join(__dirname, "node_modules", "marked"),
  path.join(__dirname, "..", "vektes-contracts", "node_modules", "marked"),
]) {
  try { ({ marked } = require(cand)); break; } catch { /* try next */ }
}
if (!marked) {
  console.error("Could not find `marked`. Run `npm install` in this folder, or ensure ../vektes-contracts/node_modules/marked exists.");
  process.exit(1);
}

const SRC = path.join(__dirname, "docs-src");
const OUT = path.join(__dirname, "docs");

// Sidebar order + per-page metadata. `slug` drives the clean URL (/docs/<slug>).
const PAGES = [
  { file: "README.md",             slug: "",                   out: "index.html",             nav: "Overview",          desc: "Vektes protocol documentation — irrevocable settlement with dedup codes, scheduling, and recipient controls." },
  { file: "quick-start.md",        slug: "quick-start",        out: "quick-start.html",        nav: "Quick Start",       desc: "Send your first Vektes transfer — approve, send (instant or scheduled), claim." },
  { file: "protocol-reference.md", slug: "protocol-reference", out: "protocol-reference.html", nav: "Protocol Reference",desc: "Full function, event, and error reference for the deployed VektesProtocol contract." },
  { file: "fee-model.md",          slug: "fee-model",          out: "fee-model.html",          nav: "Fee Model",         desc: "Monthly-volume fee tiers, the maxFeeVek cap, and the current fee-free launch state." },
  { file: "integration-guide.md",  slug: "integration-guide",  out: "integration-guide.html",  nav: "Integration Guide", desc: "Build a payment flow on Vektes — ABI, events, error handling, and webhooks." },
  { file: "contracts.md",          slug: "contracts",          out: "contracts.html",          nav: "Contracts",         desc: "Mainnet contract addresses, configuration, and supported tokens." },
  { file: "security.md",           slug: "security",           out: "security.html",           nav: "Security",          desc: "Audit, access control, reentrancy, pausability, and fund-safety guarantees." },
  { file: "faq.md",                slug: "faq",                out: "faq.html",                nav: "FAQ",               desc: "Common questions about transfers, settlement, fees, claiming, and security." },
  { file: "incentives.md",         slug: "incentives",         out: "incentives.html",         nav: "Incentive Programs (RFC)", desc: "Draft RFC: transaction-mining, liquidity, developer-grant, and referral incentive programs for $VEK." },
];

const FAVICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='20' fill='%230C8F6B'/%3E%3Ctext x='50' y='72' font-size='64' text-anchor='middle' fill='white' font-family='monospace' font-weight='bold'%3EV%3C/text%3E%3C/svg%3E";
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const slugify = (s) => s.toLowerCase().replace(/<[^>]+>/g, "").replace(/&[a-z]+;/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function convert(md) {
  // Rewrite internal doc links: ./X.md(#anchor) -> /docs/X(#anchor); README.md -> /docs/
  md = md.replace(/\((?:\.\/)?([A-Za-z0-9_-]+)\.md(#[A-Za-z0-9-]+)?\)/g, (m, name, anchor) => {
    const a = anchor || "";
    return name.toLowerCase() === "readme" ? `(/docs/${a})` : `(/docs/${name}${a})`;
  });
  let html = marked.parse(md, { mangle: false, headerIds: false });
  html = html.replace(/<h([1-3])>([\s\S]*?)<\/h\1>/g, (m, l, inner) => `<h${l} id="${slugify(inner)}">${inner}</h${l}>`);
  html = html.replace(/<table>/g, '<div class="table-wrap"><table>').replace(/<\/table>/g, "</table></div>");
  return html;
}

const firstH1 = (html) => {
  const m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  return m ? m[1].replace(/<[^>]+>/g, "") : "Docs";
};

const sidebar = (active) =>
  PAGES.map((p) => `      <a href="/docs/${p.slug}"${p.slug === active ? ' aria-current="page"' : ""}>${p.nav}</a>`).join("\n");

function shell(p, contentHtml) {
  const title = firstH1(contentHtml);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)} — Vektes Docs</title>
<meta name="description" content="${esc(p.desc)}" />
<meta name="theme-color" content="#0c8f6b" />
<link rel="canonical" href="https://vektes.com/docs/${p.slug}" />
<link rel="icon" href="${FAVICON}" />
<link rel="stylesheet" href="/docs/docs.css" />
</head>
<body>
<header>
  <div class="wrap nav">
    <a class="brand" href="/"><span class="dot"></span>VEKTES</a>
    <span class="spacer"></span>
    <a class="link" href="/features.html">Features</a>
    <a class="link" href="/docs/">Docs</a>
    <a class="link" href="/vesting">Vesting</a>
    <a class="link" href="https://app.vektes.com" target="_blank" rel="noopener">App ↗</a>
  </div>
</header>
<div class="wrap docs-layout">
  <aside class="sidebar">
    <div class="side-label">Documentation</div>
    <nav>
${sidebar(p.slug)}
    </nav>
  </aside>
  <main class="doc-content">
${contentHtml}
  </main>
</div>
<footer>
  <div class="wrap">
    <div class="foot">
      <a class="brand" href="/"><span class="dot"></span>VEKTES</a>
      <div class="links">
        <a href="/docs/">Docs</a>
        <a href="/features.html">Features</a>
        <a href="/vesting">Vesting</a>
        <a href="/terms">Terms</a>
        <a href="/privacy">Privacy</a>
        <a href="/risks">Risks</a>
      </div>
    </div>
    <p class="disc"><b>Reference documentation for the deployed Vektes protocol.</b> Contract behavior is authoritative — always verify against the source-verified contracts on Etherscan. Nothing here is financial, investment, legal, or tax advice. © 2026 Vektes.</p>
  </div>
</footer>
</body>
</html>
`;
}

if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
for (const p of PAGES) {
  const md = fs.readFileSync(path.join(SRC, p.file), "utf8");
  const html = shell(p, convert(md));
  fs.writeFileSync(path.join(OUT, p.out), html);
  console.log(`wrote docs/${p.out}  (${(html.length / 1024).toFixed(1)} KB)`);
}
console.log(`done: ${PAGES.length} pages. (docs/docs.css is not generated — edit it directly.)`);
