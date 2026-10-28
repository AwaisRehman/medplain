// ocr_conf.js -- Table 4 data: OCR mean word confidence with MedPlain's own OCR setup
// (tesseract.js, "eng+ara", the repo's tessdata/ folder), the same call the extract route makes.
//
// Run from the REPO ROOT so Node finds the app's tesseract.js:
//   node experiments/scripts/ocr_conf.js tessdata experiments/results/ocr_confidence.csv handwritten  C:\path\to\handwritten_folder
//   node experiments/scripts/ocr_conf.js tessdata experiments/results/ocr_confidence.csv printed       experiments/results/printed/clean
//   node experiments/scripts/ocr_conf.js tessdata experiments/results/ocr_confidence.csv printed_scan  experiments/results/printed/scan
// Arguments after the group can be image files OR folders (all .jpg/.jpeg/.png/.bmp/.tif/.webp inside are used),
// so it works in PowerShell, which does not expand *.jpg.
const fs = require("fs");
const path = require("path");
const { createRequire } = require("module");

// resolve tesseract.js from the repo (current working directory), not from this kit folder
const requireFromRepo = createRequire(path.join(process.cwd(), "package.json"));
const { createWorker } = requireFromRepo("tesseract.js");

const IMG = /\.(jpe?g|png|bmp|tiff?|webp)$/i;

function expand(args) {
  const files = [];
  for (const a of args) {
    if (fs.existsSync(a) && fs.statSync(a).isDirectory()) {
      fs.readdirSync(a).filter((f) => IMG.test(f)).sort((x, y) => x.localeCompare(y, undefined, { numeric: true }))
        .forEach((f) => files.push(path.join(a, f)));
    } else if (IMG.test(a)) {
      files.push(a);
    }
  }
  return files;
}

(async () => {
  const [langPath, out, group, ...rest] = process.argv.slice(2);
  if (!langPath || !out || !group || rest.length === 0) {
    console.error("usage: node ocr_conf.js <tessdata_dir> <out.csv> <group> <images or folders...>");
    process.exit(1);
  }
  const files = expand(rest);
  if (files.length === 0) { console.error("No images found."); process.exit(1); }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const worker = await createWorker("eng+ara", 1, { langPath, gzip: false, cachePath: path.dirname(out) });
  if (!fs.existsSync(out)) fs.writeFileSync(out, "group,file,confidence,chars\n");
  let i = 0;
  for (const f of files) {
    i += 1;
    try {
      const { data } = await worker.recognize(f);
      const chars = (data.text || "").replace(/\s/g, "").length;
      const conf = Math.round(data.confidence);
      fs.appendFileSync(out, `${group},${path.basename(f)},${conf},${chars}\n`);
      console.log(`[${i}/${files.length}] ${group} ${path.basename(f)} confidence=${conf}`);
    } catch (e) {
      fs.appendFileSync(out, `${group},${path.basename(f)},ERR,0\n`);
      console.log(`[${i}/${files.length}] ${group} ${path.basename(f)} ERROR`);
    }
  }
  await worker.terminate();
  console.log(`\nAppended ${files.length} rows to ${out}`);
})();
