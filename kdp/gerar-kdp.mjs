import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "kdp");
const htmlPath = path.join(root, "index.html");
const bookHtml = fs.readFileSync(htmlPath, "utf8");

const PAGE_COUNT = 154; // dedicatória + verso + 38 cenas (história + verso + colorir + verso)
const PAPER = 0.002252;
const SPINE = +(PAGE_COUNT * PAPER).toFixed(6);
const TRIM = 8.5;
const BLEED = 0.125;
const PAGE_W = TRIM + BLEED;
const PAGE_H = TRIM + BLEED * 2;
const COVER_W = BLEED + TRIM + SPINE + TRIM + BLEED;
const COVER_H = PAGE_H;

function article(id) {
  const match = bookHtml.match(new RegExp(`<article[^>]*id="${id}"[\\s\\S]*?</article>`));
  if (!match) throw new Error("Página não encontrada: " + id);
  return match[0];
}

function field(block, className) {
  const match = block.match(new RegExp(`<p class="${className}">([\\s\\S]*?)</p>`));
  if (!match) return "";
  return match[1]
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function imageSrc(block, preferClass) {
  if (preferClass) {
    const scoped = block.match(
      new RegExp(`<(?:figure|div)[^>]*class="[^"]*${preferClass}[^"]*"[^>]*>[\\s\\S]*?src="(ilustracoes\\/[^\"]+)"`)
    );
    if (scoped) return scoped[1].replace(/\//g, "\\");
  }
  // Prefer story/coloring art over QR thumbnails
  const art = block.match(/src="(ilustracoes\/luna-(?:cena|colorir|pagina)-[^"]+)"/);
  if (art) return art[1].replace(/\//g, "\\");
  const match = block.match(/src="(ilustracoes\/[^"]+)"/);
  if (!match) throw new Error("Ilustração ausente");
  return match[1].replace(/\//g, "\\");
}

function lines(text) {
  return text.split("\n").map((line) => line.trim()).filter(Boolean);
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function verse(text) {
  return lines(text).map((line) => escapeHtml(line)).join("<br>");
}

const dedication = bookHtml.match(/<blockquote>([\s\S]*?)<\/blockquote>/)[1].trim();

const scenes = [];
for (let n = 1; n <= 38; n += 1) {
  const story = article("pagina-" + n);
  const coloring = article("colorir-" + n);
  scenes.push({
    n,
    poem: field(story, "poem"),
    fala: field(story, "fala"),
    fim: /<p class="kicker">Fim<\/p>|<p class="kicker">FIM<\/p>/i.test(story),
    storyImage: imageSrc(story, "story-art"),
    colorImage: imageSrc(coloring, "coloring-art")
  });
}

const musicByPage = {
  9: {
    qr: "ilustracoes/qr-anunciacao.png",
    title: "Anunciação",
    artist: "Mariana Nolasco",
    note: "Quando ela canta “tu vens”, só consigo imaginar o Senhor Jesus vindo nos buscar desse mundo tão cruel."
  },
  34: {
    qr: "ilustracoes/qr-curado-para-curar.png",
    title: "Curado Para Curar",
    artist: "Nayara Rosa",
    note: ""
  },
  38: {
    qr: "ilustracoes/qr-cordas-de-amor.png",
    title: "Cordas de Amor",
    artist: "Nayara Rosa",
    note: "JESUS ESTA VOLTANDO",
    author: "Robertta Loryn Begui"
  }
};

function musicBlock(scene) {
  const m = musicByPage[scene.n];
  if (!m) return "";
  const note = m.note
    ? `<p class="music-note${scene.n === 38 ? " shout" : ""}">${escapeHtml(m.note)}</p>`
    : "";
  const author = m.author
    ? `<p class="music-author">${escapeHtml(m.author)}</p>`
    : "";
  return `<div class="qr-print">
      <img src="../${m.qr.replace(/\//g, "\\")}" alt="">
      <p class="qr-caption"><strong>${escapeHtml(m.title)}</strong><br>${escapeHtml(m.artist)} · YouTube</p>
    </div>
    ${note}
    ${author}`;
}

function storyPage(scene) {
  const count = lines(scene.poem).length + lines(scene.fala).length;
  const hasMusic = Boolean(musicByPage[scene.n]);
  const dense = count > 10 || hasMusic ? " dense" : "";
  // Página 38: cena alta (céu + ceia) — contain para não cortar Jesus nem as cadeiras
  const fitClass = scene.n === 38 ? " fit-contain final" : "";
  return `<section class="page story${dense}${fitClass}">
    <img src="../${scene.storyImage}" alt="">
    <div class="text">
      <p class="kicker">Página ${scene.n}</p>
      <p class="poem">${verse(scene.poem)}</p>
      <p class="fala">${verse(scene.fala)}</p>
      ${musicBlock(scene)}
      ${scene.fim ? '<p class="fim">Fim</p>' : ""}
    </div>
  </section>`;
}

function colorPage(scene) {
  return `<section class="page coloring">
    <img src="../${scene.colorImage}" alt="">
    <p class="label">Para colorir · ${scene.n}</p>
  </section>`;
}

function blankPage() {
  return `<section class="page blank"></section>`;
}

const interiorPages = [dedicationPage(), blankPage()];
for (const scene of scenes) {
  interiorPages.push(storyPage(scene), blankPage(), colorPage(scene), blankPage());
}

function dedicationPage() {
  return `<section class="page dedication">
    <p class="heart">♥</p>
    <p class="kicker">Dedicatória</p>
    <blockquote>${escapeHtml(dedication)}</blockquote>
  </section>`;
}

const interior = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Luna e o Quintal das Histórias — miolo KDP</title>
  <style>
    @page { size: ${PAGE_W}in ${PAGE_H}in; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; }
    .page {
      width: ${PAGE_W}in;
      height: ${PAGE_H}in;
      overflow: hidden;
      background: #fff;
      page-break-after: always;
      break-after: page;
      position: relative;
    }
    .page:last-child { page-break-after: auto; break-after: auto; }
    .story img {
      display: block;
      width: ${PAGE_W}in;
      height: 4.95in;
      object-fit: cover;
      object-position: center 32%;
    }
    .story.dense img { height: 4.15in; }
    .story.fit-contain {
      background: #fff8ef;
    }
    .story.fit-contain img {
      height: 4.35in;
      object-fit: contain;
      object-position: center center;
      background: #fff8ef;
    }
    .story.dense.fit-contain img { height: 3.85in; }
    .story.final img,
    .story.final.fit-contain img,
    .story.dense.final.fit-contain img {
      height: 5.35in;
      object-fit: contain;
      object-position: center top;
      background: #fff8ef;
    }
    .story.final .text { padding-top: 0.08in; padding-bottom: 0.28in; }
    .text {
      padding: 0.16in 0.55in 0.5in 0.42in;
      color: #3e2a22;
      font-family: Georgia, "Palatino Linotype", serif;
    }
    .kicker {
      margin: 0 0 0.06in;
      font-family: "Segoe UI", sans-serif;
      font-size: 9pt;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #c48a22;
    }
    .poem {
      margin: 0;
      font-size: 13.5pt;
      line-height: 1.28;
    }
    .dense .poem, .dense .fala { font-size: 12pt; line-height: 1.24; }
    .fala {
      margin: 0.1in 0 0;
      padding: 0.08in 0.1in 0.08in 0.12in;
      border-left: 3.5pt solid #c24b43;
      background: #fff6f2;
      font-family: "Segoe UI", sans-serif;
      font-size: 12.5pt;
      font-weight: 600;
      line-height: 1.28;
      color: #234628;
    }
    .dense .fala { font-size: 11.5pt; }
    .fim {
      margin: 0.08in 0 0;
      font-family: "Segoe UI", sans-serif;
      font-size: 9pt;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: #c48a22;
    }
    .qr-print {
      display: flex;
      align-items: center;
      gap: 0.12in;
      margin: 0.1in 0 0;
      padding: 0.08in 0.1in;
      border: 1pt solid rgba(211, 154, 58, 0.4);
      border-radius: 0.1in;
      background: #fff8ef;
    }
    .qr-print img {
      width: 0.85in !important;
      height: 0.85in !important;
      object-fit: contain !important;
      flex: 0 0 auto;
    }
    .qr-caption {
      margin: 0;
      font-family: "Segoe UI", sans-serif;
      font-size: 9.5pt;
      font-weight: 700;
      line-height: 1.25;
      color: #3e2a22;
    }
    .qr-caption strong {
      color: #234628;
      font-size: 11pt;
    }
    .music-note {
      margin: 0.08in 0 0;
      font-family: Georgia, "Palatino Linotype", serif;
      font-style: italic;
      font-size: 9.5pt;
      line-height: 1.3;
      color: #6d4c3d;
    }
    .music-note.shout {
      font-style: normal;
      font-family: "Segoe UI", sans-serif;
      font-weight: 800;
      font-size: 12pt;
      letter-spacing: 0.04em;
      color: #c24b43;
    }
    .music-author {
      margin: 0.04in 0 0;
      font-family: Georgia, "Palatino Linotype", serif;
      font-style: italic;
      font-size: 11pt;
      font-weight: 700;
      color: #3e2a22;
    }
    .story.dense .poem, .story.dense .fala { font-size: 11.5pt; line-height: 1.22; }
    .dedication {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 0.7in 0.85in 0.7in 0.7in;
    }
    .heart { margin: 0; font-size: 22pt; color: #c24b43; }
    .dedication blockquote {
      margin: 0.18in 0 0;
      max-width: 5.8in;
      font-family: Georgia, "Palatino Linotype", serif;
      font-style: italic;
      font-size: 18pt;
      line-height: 1.4;
      color: #234628;
    }
    .coloring img {
      position: absolute;
      left: 0.48in;
      right: 0.58in;
      top: 0.48in;
      bottom: 0.62in;
      width: calc(100% - 1.06in);
      height: calc(100% - 1.1in);
      object-fit: contain;
      object-position: center;
    }
    .label {
      position: absolute;
      left: 0.42in;
      right: 0.52in;
      bottom: 0.4in;
      margin: 0;
      text-align: center;
      font-family: "Segoe UI", sans-serif;
      font-size: 8pt;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #8a8178;
    }
  </style>
</head>
<body>
${interiorPages.join("\n")}
</body>
</html>`;

fs.writeFileSync(path.join(outDir, "miolo.html"), interior, "utf8");

const cover = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Capa KDP</title>
  <style>
    @page { size: ${COVER_W}in ${COVER_H}in; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; background: #fff; }
    .wrap {
      width: ${COVER_W}in;
      height: ${COVER_H}in;
      display: flex;
      overflow: hidden;
      page-break-after: avoid;
    }
    .back {
      width: ${BLEED + TRIM}in;
      height: ${COVER_H}in;
      background: #234628;
      color: #fffaf4;
      position: relative;
      padding: 0.7in 0.55in 1.9in 0.55in;
      font-family: Georgia, "Palatino Linotype", serif;
    }
    .back h2 {
      margin: 0.35in 0 0;
      font-size: 22pt;
      line-height: 1.05;
      font-weight: 700;
    }
    .back .sub {
      margin: 0.16in 0 0;
      font-family: "Segoe UI", sans-serif;
      font-size: 12pt;
      font-weight: 600;
      line-height: 1.35;
      max-width: 16em;
    }
    .back blockquote {
      margin: 0.35in 0 0;
      font-style: italic;
      font-size: 13pt;
      line-height: 1.4;
      max-width: 22em;
    }
    .barcode {
      position: absolute;
      left: 6.25in;
      bottom: 0.5in;
      width: 2in;
      height: 1.2in;
      background: #fff;
    }
    .spine {
      width: ${SPINE}in;
      height: ${COVER_H}in;
      background: #1b3a22;
    }
    .front {
      width: ${TRIM + BLEED}in;
      height: ${COVER_H}in;
      position: relative;
      background: #e7f3cc;
    }
    .front img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: center 40%;
      display: block;
    }
    .title {
      position: absolute;
      left: 0.45in;
      right: 0.5in;
      top: 0.42in;
      text-align: center;
      background: rgba(255, 250, 244, 0.92);
      border-radius: 14px;
      padding: 0.16in 0.18in 0.18in;
      color: #234628;
    }
    .title p { margin: 0; }
    .title h1 {
      margin: 0.04in 0 0;
      font-family: Georgia, "Palatino Linotype", serif;
      font-size: 28pt;
      line-height: 0.98;
    }
    .title .sub {
      margin-top: 0.08in;
      font-family: "Segoe UI", sans-serif;
      font-size: 11pt;
      font-weight: 700;
      color: #6d4c3d;
    }
    .title .name {
      margin-top: 0.06in;
      font-family: Georgia, serif;
      font-style: italic;
      font-size: 13pt;
      color: #c24b43;
    }
    .title .edition {
      margin-top: 0.05in;
      font-family: "Segoe UI", sans-serif;
      font-size: 10pt;
      font-weight: 700;
      color: #6d4c3d;
    }
  </style>
</head>
<body>
  <div class="wrap">
    <section class="back">
      <p class="heart" style="margin:0;font-size:20pt;color:#f0c14a;">♥</p>
      <h2>Luna e o Quintal das Histórias</h2>
      <p class="sub">Um livro para pequenos corações que amam Jesus e bichinhos.</p>
      <p class="sub" style="margin-top:0.12in">1ª edição</p>
      <blockquote>${escapeHtml(dedication)}</blockquote>
      <div class="barcode"></div>
    </section>
    <section class="spine"></section>
    <section class="front">
      <img src="../ilustracoes/luna-pagina-1.jpg" alt="">
      <div class="title">
        <p style="font-size:16pt;">🌼</p>
        <h1>Luna e o Quintal das Histórias</h1>
        <p class="sub">Um livro para pequenos corações que amam Jesus e bichinhos</p>
        <p class="edition">1ª edição</p>
      </div>
    </section>
  </div>
</body>
</html>`;

fs.writeFileSync(path.join(outDir, "capa.html"), cover, "utf8");

const chrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

function printPdf(htmlFile, pdfFile) {
  const profile = path.join(outDir, "chrome-" + path.basename(pdfFile, ".pdf"));
  fs.rmSync(profile, { recursive: true, force: true });
  const url = "file:///" + htmlFile.replace(/\\/g, "/");
  const result = spawnSync(chrome, [
    "--headless=new",
    "--disable-gpu",
    "--no-pdf-header-footer",
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
    `--user-data-dir=${profile}`,
    `--print-to-pdf=${pdfFile}`,
    url
  ], { stdio: "inherit" });
  if (result.status !== 0) throw new Error("Chrome não gerou " + pdfFile);
}

const interiorPdf = path.join(outDir, "miolo-luna-kdp.pdf");
const coverPdf = path.join(outDir, "capa-luna-kdp.pdf");
printPdf(path.join(outDir, "miolo.html"), interiorPdf);
printPdf(path.join(outDir, "capa.html"), coverPdf);

function rewriteBox(pdfFile, from, to) {
  if (from.length !== to.length) throw new Error("Troca de medida mudaria o PDF");
  const text = fs.readFileSync(pdfFile).toString("latin1");
  fs.writeFileSync(pdfFile, Buffer.from(text.split(from).join(to), "latin1"));
}

rewriteBox(interiorPdf, "0 0 621.12 630", "0 0 621.00 630");
rewriteBox(coverPdf, "0 0 1261.91992 630", "0 0 1261.78157 630");

function inspect(pdfFile) {
  const data = fs.readFileSync(pdfFile).toString("latin1");
  const pages = (data.match(/\/Type\s*\/Page(?!s)/g) || []).length;
  const box = data.match(/\/MediaBox\s*\[\s*([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\s*\]/);
  const width = box ? (Number(box[3]) - Number(box[1])) / 72 : null;
  const height = box ? (Number(box[4]) - Number(box[2])) / 72 : null;
  return { file: path.basename(pdfFile), pages, width, height, bytes: fs.statSync(pdfFile).size };
}

const spec = {
  trimInches: [TRIM, TRIM],
  interiorWithBleedInches: [PAGE_W, PAGE_H],
  pages: PAGE_COUNT,
  paper: "branco, cor standard KDP",
  inchesPerPage: PAPER,
  spineInches: SPINE,
  coverWithBleedInches: [COVER_W, COVER_H],
  gutterInches: 0.375,
  outsideSafeInches: 0.375,
  singleSided: "cada desenho em página ímpar; verso em branco",
  files: [
    inspect(interiorPdf),
    inspect(coverPdf)
  ]
};
fs.writeFileSync(path.join(outDir, "medidas.json"), JSON.stringify(spec, null, 2));
console.log(JSON.stringify(spec, null, 2));
