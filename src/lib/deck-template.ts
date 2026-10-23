import type { Signature } from "./email-template";
import type { ProposalContent } from "./schemas";
import { esc, FLOWMINT_MARK } from "./site-template";

const AREA: Record<string, string> = {
  seo: "Search",
  design: "Design",
  ux: "Usability",
  mobile: "Mobile",
  conversion: "Bookings",
  content: "Content",
};

function chunk<T>(items: T[], size: number): T[][] {
  const groups: T[][] = [];
  for (let i = 0; i < items.length; i += size) groups.push(items.slice(i, i + size));
  return groups;
}

/** HTML for the proposal PDF. Each .slide prints as one 1280×720 page. */
export function renderDeck(input: {
  company: string;
  personName: string;
  personTitle: string | null;
  pageUrl: string;
  demoUrl: string;
  proposal: ProposalContent;
  homepageJpeg: string | null;
  demoJpeg: string | null;
  signature: Signature;
  date: Date;
}): string {
  const { proposal, signature } = input;
  const drawbacks = proposal.drawbacks.slice(0, 6);
  const improvements = proposal.improvements.slice(0, 6);
  const results = proposal.results.slice(0, 4);
  const host = input.pageUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const date = input.date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  let page = 1;
  const foot = () => {
    page += 1;
    return `<div class="foot"><span class="brand">${FLOWMINT_MARK}FlowMint</span><span>${esc(input.company)} · Website proposal</span><span>${page}</span></div>`;
  };

  return `<!doctype html>
<html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
@page{size:1280px 720px;margin:0}
*{box-sizing:border-box}
body{margin:0;font-family:Inter,system-ui,sans-serif;color:#16201f;-webkit-print-color-adjust:exact;print-color-adjust:exact}
h1,h2,h3{font-family:Fraunces,Georgia,serif;font-weight:600;margin:0;letter-spacing:-.01em;line-height:1.12}
.slide{width:1280px;height:720px;position:relative;overflow:hidden;page-break-after:always;padding:64px 72px 90px;background:#fbfaf7}
.slide:last-child{page-break-after:auto}
.kicker{font-size:13px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:#1a6b63;margin-bottom:14px}
.slide h2{font-size:42px;max-width:900px}
.lede{font-size:18px;color:#5b6765;margin:14px 0 0;max-width:860px;line-height:1.55}
.foot{position:absolute;left:72px;right:72px;bottom:32px;display:flex;justify-content:space-between;align-items:center;font-size:12px;color:#8a9694;border-top:1px solid #e3e8e7;padding-top:14px}
.foot .brand{display:flex;align-items:center;gap:6px;font-weight:600;color:#16201f}
.foot svg{width:18px;height:18px}
.cover{background:#070d13;color:#e8eef4;padding:72px}
.cover:before{content:"";position:absolute;width:760px;height:760px;right:-220px;top:-260px;border-radius:50%;background:radial-gradient(circle,rgba(43,179,163,.35),transparent 68%)}
.cover .mark{display:flex;align-items:center;gap:10px;font-weight:600;font-size:18px}
.cover .mark svg{width:34px;height:34px}
.cover h1{font-size:68px;margin-top:150px;max-width:940px;color:#fff}
.cover .for{margin-top:22px;font-size:20px;color:#9fb0bf}
.cover .meta{position:absolute;left:72px;bottom:64px;font-size:14px;color:#8a99a8}
.cover .accent{color:#3fc4b4}
.two{display:grid;grid-template-columns:1.1fr .9fr;gap:48px;margin-top:36px;align-items:start}
.shot{border-radius:14px;overflow:hidden;border:1px solid #dde3e2;box-shadow:0 24px 48px -28px rgba(7,13,19,.4);background:#fff}
.shot .bar{height:28px;background:#eef1f1;display:flex;align-items:center;gap:6px;padding:0 12px;font-size:11px;color:#7b8785}
.shot .bar i{width:9px;height:9px;border-radius:50%;background:#cfd6d5;display:inline-block}
.shot .bar span{margin-left:10px}
.shot img{display:block;width:100%;height:auto}
.shot.short img{height:380px;object-fit:cover;object-position:top}
.summary{font-size:19px;line-height:1.6;color:#2b3634}
.chip{display:inline-block;font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;padding:4px 10px;border-radius:999px;background:#fdecea;color:#a23b2c}
.chip.good{background:#e1f5f2;color:#1a6b63}
.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-top:34px}
.card{background:#fff;border:1px solid #e3e8e7;border-radius:16px;padding:20px 22px}
.card h3{font-size:19px;margin:12px 0 8px}
.card p{margin:0;font-size:14px;color:#5b6765;line-height:1.5;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:6;overflow:hidden}
.card h3{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}
.card .why{margin-top:10px;font-size:13px;color:#16201f;-webkit-line-clamp:4}
.card .why b{color:#a23b2c}
.list{margin-top:30px;display:grid;grid-template-columns:1fr 1fr;gap:16px 28px}
.item{display:flex;gap:16px;align-items:flex-start;background:#fff;border:1px solid #e3e8e7;border-radius:16px;padding:18px 20px}
.num{flex:none;width:34px;height:34px;border-radius:50%;background:#1a6b63;color:#fff;display:grid;place-items:center;font-weight:600;font-size:14px}
.item h3{font-size:18px;margin-bottom:6px}
.item p{margin:0;font-size:14px;color:#5b6765;line-height:1.5;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:4;overflow:hidden}
.item .fixes{margin-top:8px;font-size:12px;color:#1a6b63;font-weight:500}
.results{display:grid;grid-template-columns:repeat(2,1fr);gap:18px;margin-top:34px}
.result{background:#fff;border:1px solid #e3e8e7;border-left:4px solid #2bb3a3;border-radius:14px;padding:22px 24px}
.result h3{font-size:21px;margin-bottom:8px}
.result p{margin:0;font-size:15px;color:#5b6765;line-height:1.55;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:4;overflow:hidden}
.note{margin-top:20px;font-size:12px;color:#8a9694}
.link{display:inline-block;margin-top:22px;font-size:16px;font-weight:600;color:#1a6b63;word-break:break-all}
.steps{margin-top:36px;display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
.steps .item{flex-direction:column}
.contact{margin-top:40px;display:flex;gap:18px;align-items:center;background:#070d13;color:#e8eef4;border-radius:18px;padding:24px 28px}
.contact svg{width:40px;height:40px;flex:none}
.contact b{font-size:17px;color:#fff}.contact span{color:#9fb0bf;font-size:14px}
</style></head><body>

<section class="slide cover">
  <div class="mark">${FLOWMINT_MARK}FlowMint</div>
  <h1>A clearer website for <span class="accent">${esc(input.company)}</span></h1>
  <p class="for">Prepared for ${esc(input.personName)}${input.personTitle ? `, ${esc(input.personTitle)}` : ""}</p>
  <div class="meta">Website proposal · ${esc(date)} · flowmint.works</div>
</section>

<section class="slide">
  <div class="kicker">Where you are today</div>
  <h2>A look at ${esc(host)}</h2>
  <div class="two">
    ${
      input.homepageJpeg
        ? `<div class="shot short"><div class="bar"><i></i><i></i><i></i><span>${esc(host)}</span></div><img src="${input.homepageJpeg}"></div>`
        : `<div></div>`
    }
    <div>
      <p class="summary">${esc(proposal.summary)}</p>
      <p class="note">We reviewed the homepage as a first-time visitor would see it, on desktop. Nothing here needs access to your systems.</p>
    </div>
  </div>
  ${foot()}
</section>

${chunk(drawbacks, 3)
  .map(
    (group, index, all) => `<section class="slide">
  <div class="kicker">Current drawbacks${all.length > 1 ? ` · ${index + 1} of ${all.length}` : ""}</div>
  <h2>${index === 0 ? "What may be holding the site back" : "More of what may be holding it back"}</h2>
  <div class="cards">
    ${group
      .map(
        (item) => `<div class="card">
      <span class="chip">${esc(AREA[item.area] ?? item.area)}</span>
      <h3>${esc(item.title)}</h3>
      <p>${esc(item.detail)}</p>
      <p class="why"><b>Why it matters:</b> ${esc(item.impact)}</p>
    </div>`,
      )
      .join("")}
  </div>
  ${foot()}
</section>`,
  )
  .join("")}

${chunk(improvements, 4)
  .map(
    (group, index, all) => `<section class="slide">
  <div class="kicker">Proposed improvements${all.length > 1 ? ` · ${index + 1} of ${all.length}` : ""}</div>
  <h2>${index === 0 ? "What we would change" : "And what else we would change"}</h2>
  <div class="list">
    ${group
      .map(
        (item, i) => `<div class="item">
      <span class="num">${index * 4 + i + 1}</span>
      <div><h3>${esc(item.title)}</h3><p>${esc(item.detail)}</p>${item.fixes ? `<p class="fixes">Addresses: ${esc(item.fixes)}</p>` : ""}</div>
    </div>`,
      )
      .join("")}
  </div>
  ${foot()}
</section>`,
  )
  .join("")}

${
  results.length
    ? `<section class="slide">
  <div class="kicker">Expected results</div>
  <h2>What these changes should do for you</h2>
  <div class="results">
    ${results.map((item) => `<div class="result"><h3>${esc(item.title)}</h3><p>${esc(item.text)}</p></div>`).join("")}
  </div>
  <p class="note">These are the outcomes the changes are designed for. We don't promise specific numbers before we've seen your analytics.</p>
  ${foot()}
</section>`
    : ""
}

<section class="slide">
  <div class="kicker">The concept</div>
  <h2>We sketched the new homepage</h2>
  <div class="two">
    ${
      input.demoJpeg
        ? `<div class="shot short"><div class="bar"><i></i><i></i><i></i><span>Concept</span></div><img src="${input.demoJpeg}"></div>`
        : `<div></div>`
    }
    <div>
      <p class="summary">A working concept built from your current content, with the improvements applied. Open it on your phone or desktop and click around.</p>
      <a class="link" href="${esc(input.demoUrl)}">${esc(input.demoUrl)}</a>
      <p class="note">It's a private preview, hidden from search engines, and only shared with you.</p>
    </div>
  </div>
  ${foot()}
</section>

<section class="slide">
  <div class="kicker">Next steps</div>
  <h2>If this looks useful</h2>
  <div class="steps">
    <div class="item"><span class="num">1</span><div><h3>A short call</h3><p>Fifteen minutes to hear what matters most to you and what the site needs to do.</p></div></div>
    <div class="item"><span class="num">2</span><div><h3>Agree the scope</h3><p>We confirm which changes to make first, with a clear timeline and quote.</p></div></div>
    <div class="item"><span class="num">3</span><div><h3>Build and launch</h3><p>We build on your current platform or a new one, and hand everything over to you.</p></div></div>
  </div>
  <div class="contact">
    ${FLOWMINT_MARK}
    <div>
      <b>${esc(signature.name || "FlowMint")}</b>${signature.title ? ` <span>· ${esc(signature.title)}</span>` : ""}<br>
      <span>${esc([signature.email, signature.phone, signature.website.replace(/^https?:\/\//, "")].filter(Boolean).join("  ·  "))}</span>
    </div>
  </div>
  ${foot()}
</section>

</body></html>`;
}
