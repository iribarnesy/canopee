import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
const DIR = process.env.SORTIE;
mkdirSync(DIR, { recursive: true });
const nav = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await nav.newPage({ viewport: { width: 1700, height: 1400 } });
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
page.on("console", (m) => { if (m.type() === "error") console.log("[console]", m.text()); });
await page.goto(process.env.URL_BANC, { waitUntil: "load" });
await page.waitForFunction(() => document.title.startsWith("L1 aperçu prêt"), null, { timeout: 900000 });
const imgs = await page.evaluate(() =>
  [...document.querySelectorAll("figure.vignette")].map((f) => ({
    l: f.querySelector("figcaption")?.textContent ?? "",
    d: f.querySelector("canvas")?.toDataURL("image/png") ?? "",
  })),
);
imgs.forEach((im, i) => {
  if (!im.d) return;
  const nom = im.l.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  writeFileSync(`${DIR}/${String(i).padStart(2,"0")}-${nom}.png`, Buffer.from(im.d.split(",")[1], "base64"));
  console.log(`${i} — ${im.l}`);
});
await nav.close();
