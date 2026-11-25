// Exercise the native Scriptable layout and fetching code with real chart PNGs.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const dir = process.argv[2] ?? path.join(__dirname, "public", "dashboard");
const code = fs.readFileSync(path.join(__dirname, "DashboardWidget.js"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(dir, "data.json"), "utf8"));
const [wind, bruno] = manifest.panels;
assert.deepEqual([wind.title, bruno.title], ["Wind rose", "Mt. Bruno"]);
assert.equal(wind.mode, "overlay");
assert.deepEqual(bruno.grid, [25, 24]);
const originals = Object.fromEntries(manifest.panels.map(({ image }) => {
  const png = fs.readFileSync(path.join(dir, image));
  assert.equal(png.readUInt32BE(16), 348);
  assert.equal(png.readUInt32BE(20), 504);
  return [image, png];
}));
const disk = new Map();

class Stack {
  constructor() { this.children = []; this.texts = []; }
  layoutVertically() { this.axis = "vertical"; }
  layoutHorizontally() { this.axis = "horizontal"; }
  setPadding() {}
  centerAlignContent() {}
  addSpacer() {}
  addText(text) { this.texts.push(text); return {}; }
  addStack() { const child = new Stack(); this.children.push(child); return child; }
  addImage(image) {
    this.image = image;
    this.plot = { centerAlignImage() {} };
    return this.plot;
  }
}
class Size {
  constructor(width, height) { Object.assign(this, { width, height }); }
}

async function run({
  meta = manifest, pngs = originals, failed, inApp = false, family = "large",
} = {}) {
  const requests = [];
  let widget, preview, completed = false;
  class Request {
    constructor(url) {
      assert.ok(url.includes("/public/dashboard/"));
      this.file = url.split("/").pop();
      requests.push(this.file);
      this.response = { statusCode: failed && this.file.startsWith(failed) ? 503 : 200 };
    }
    async loadJSON() {
      assert.equal(this.file, "data.json");
      return meta;
    }
    async load() {
      const [filename, revision] = this.file.split("?v=");
      assert.equal(revision, meta.panels.find(p => p.image === filename).revision);
      return { toBase64String: () => pngs[filename].toString("base64") };
    }
  }
  await vm.runInNewContext(`(async () => {${code}\n})()`, {
    console: { log() {} },
    Size, Request,
    ListWidget: class extends Stack { async presentLarge() { preview = this; } },
    LinearGradient: class {},
    Color: class {},
    Font: { systemFont() {}, semiboldSystemFont() {} },
    FileManager: { local: () => ({
      documentsDirectory: () => "/mock",
      joinPath: path.join,
      fileExists: p => disk.has(p),
      readString: p => disk.get(p),
      writeString: (p, value) => disk.set(p, value),
    }) },
    Image: { fromData: data => data },
    Data: { fromBase64String: data => Buffer.from(data, "base64") },
    Script: { setWidget: value => { widget = value; }, complete: () => { completed = true; } },
    config: { runsInApp: inApp, runsInWidget: !inApp, widgetFamily: family },
  });
  assert.equal(completed, true);
  assert.equal(inApp ? widget : preview, undefined);
  return { widget: inApp ? preview : widget, requests };
}

function checkDashboard(widget, images, isCached = false) {
  const [actions, panels, footer] = widget.children;
  assert.equal(actions.axis, "horizontal");
  assert.equal(panels.axis, "horizontal");
  assert.deepEqual(actions.children.map(button => button.texts[0]), ["Action 1", "Action 2"]);
  assert.ok(actions.children.every(button => !button.url && button.size.height === 44));
  assert.deepEqual(panels.children.map(card => card.texts[0]), ["Wind rose", "Mt. Bruno"]);
  assert.ok(panels.children.every(card => card.plot.imageSize.width === 116));
  for (const [index, panel] of manifest.panels.entries()) {
    assert.deepEqual(panels.children[index].image, images[panel.image]);
  }
  assert.deepEqual(footer.texts, [isCached ? "Sample data · Cached" : "Sample data"]);
}

async function main() {
  let result = await run({ inApp: true });
  checkDashboard(result.widget, originals);
  assert.equal(result.requests.length, 3);
  assert.deepEqual((await run()).requests, ["data.json"], "Unchanged images stay cached");

  // Simulate a newly published terrain PNG without changing the wind rose.
  const updated = { ...manifest, panels: [wind, { ...bruno, revision: wind.revision }] };
  const updatedImages = { ...originals, [bruno.image]: originals[wind.image] };
  result = await run({ meta: updated });
  checkDashboard(result.widget, originals, true);
  assert.deepEqual(result.requests, ["data.json", `${bruno.image}?v=${wind.revision}`]);
  result = await run({ meta: updated, pngs: updatedImages, failed: bruno.image });
  checkDashboard(result.widget, originals, true);
  result = await run({ meta: updated, pngs: updatedImages });
  checkDashboard(result.widget, updatedImages);
  result = await run({ failed: "data.json" });
  checkDashboard(result.widget, updatedImages, true);

  result = await run({ family: "medium" });
  assert.deepEqual(result.widget.texts, ["Use a large Scriptable widget"]);
  assert.deepEqual(result.requests, []);
  disk.clear();
  result = await run({ failed: "data.json" });
  assert.deepEqual(result.widget.children[1].texts, ["Charts unavailable"]);
  console.log("Passed: large preview, buttons, panel order, refresh, partial failure, offline cache, and fallback.");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
