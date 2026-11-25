// Exercise the Scriptable code with mocked iOS APIs and real generated assets.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const [windDir, irisDir] = process.argv.slice(2);
if (!windDir || !irisDir) throw new Error("Pass the wind and Iris output directories.");

function fixture(dir) {
  return {
    meta: JSON.parse(fs.readFileSync(path.join(dir, "data.json"), "utf-8")),
    png: fs.readFileSync(path.join(dir, "chart.png")),
  };
}
const wind = fixture(windDir);
const iris = fixture(irisDir);
assert.equal(wind.meta.chart, "wind-rose");
assert.equal(wind.meta.summary.mode, "overlay");
assert.equal(wind.meta.summary.directions.length, 8);
assert.equal(iris.meta.chart, "iris");
assert.equal(iris.meta.summary.rows, 150);
for (const { png } of [wind, iris]) {
  assert.equal(png.readUInt32BE(16), 804);
  assert.equal(png.readUInt32BE(20), 300);
}

const code = fs.readFileSync(path.join(__dirname, "ChartWidget.js"), "utf-8");
const disk = new Map();
let requests, remote, remoteImage, offline, badStatus, preview, result, completed;

class Layout {
  constructor() { this.texts = []; this.children = []; }
  setPadding() {}
  centerAlignContent() {}
  addSpacer() {}
  addText(text) { this.texts.push(text); return {}; }
  addStack() { const child = new Layout(); this.children.push(child); return child; }
  addImage(image) { this.image = image; return { centerAlignImage() {} }; }
  async presentMedium() { preview = this; }
}

class Request {
  constructor(url) {
    this.url = url;
    this.response = { statusCode: badStatus || 200 };
    requests.push(url);
    assert.ok(!offline, "Network is offline");
  }
  async loadJSON() {
    assert.match(this.url, /\/data\.json$/);
    return remote.meta;
  }
  async load() {
    assert.ok(this.url.endsWith(`/chart.png?v=${remote.meta.revision}`));
    return { toBase64String: () => remoteImage.png.toString("base64") };
  }
}

const context = {
  console: { log() {} },
  Request,
  FileManager: { local: () => ({
    documentsDirectory: () => "/mock",
    joinPath: path.join,
    fileExists: (p) => disk.has(p),
    readString: (p) => disk.get(p),
    writeString: (p, value) => disk.set(p, value),
  }) },
  Image: { fromData: (value) => value },
  Data: { fromBase64String: (value) => Buffer.from(value, "base64") },
  ListWidget: Layout,
  LinearGradient: class {},
  Color: class { static white() { return "white"; } },
  Font: { semiboldSystemFont() {}, systemFont() {} },
  Size: class {},
  Script: { setWidget: (value) => { result = value; }, complete: () => { completed = true; } },
};

async function run({
  chart = wind, image = chart, disconnect = false, status = 200, inApp = false,
} = {}) {
  [requests, remote, remoteImage, offline, badStatus] = [[], chart, image, disconnect, status];
  [result, preview, completed] = [null, null, false];
  await vm.runInNewContext(`(async () => {${code}\n})()`, {
    ...context, config: { runsInApp: inApp },
  });
  assert.equal(completed, true);
  assert.equal(inApp ? result : preview, null);
  return inApp ? preview : result;
}

async function main() {
  let widget = await run({ inApp: true });
  assert.deepEqual(widget.children[0].texts, [wind.meta.title, wind.meta.caption]);
  assert.deepEqual(widget.image, wind.png);
  assert.equal(requests.length, 2);

  await run();
  assert.equal(requests.length, 1, "Unchanged manifest should not redownload the image");

  widget = await run({ chart: iris, image: wind });
  assert.deepEqual(widget.children[0].texts, [wind.meta.title, "Cached"]);
  assert.deepEqual(widget.image, wind.png, "A mismatched CDN response must not replace the cache");

  widget = await run({ chart: iris });
  assert.deepEqual(widget.children[0].texts, [iris.meta.title, iris.meta.caption]);
  assert.deepEqual(widget.image, iris.png);

  for (const outage of [{ disconnect: true }, { status: 503 }]) {
    widget = await run(outage);
    assert.deepEqual(widget.children[0].texts, [iris.meta.title, "Cached"]);
    assert.deepEqual(widget.image, iris.png);
  }

  disk.clear();
  widget = await run({ disconnect: true });
  assert.equal(widget.texts[0], "Chart unavailable");
  console.log("Passed: both charts, medium preview, unchanged revision, bad/mixed responses, offline/cache fallback.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
