const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const dir = process.argv[2] ?? path.join(__dirname, "public/fleet");
const script = fs.readFileSync(path.join(__dirname, "FleetWidget.js"), "utf8");
const meta = JSON.parse(fs.readFileSync(path.join(dir, "data.json")));
const png = fs.readFileSync(path.join(dir, meta.map.file));
const pdf = fs.readFileSync(path.join(dir, meta.report.file));
assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
assert.equal(png.readUInt32BE(16), 816);
assert.equal(png.readUInt32BE(20), 450);
const disk = new Map();

class Stack {
  constructor() { this.children = []; this.labels = []; }
  layoutVertically() {}
  layoutHorizontally() {}
  centerAlignContent() {}
  setPadding() {}
  addSpacer() {}
  addStack() { const child = new Stack(); this.children.push(child); return child; }
  addText(value) { this.labels.push(value); return {}; }
  addImage(image) { this.image = image; return {}; }
}

async function run({ inApp = false, family = "large", query = {}, offline = false, remote = meta } = {}) {
  const requests = [];
  let widget, alert, complete, quickLook;
  await vm.runInNewContext(`(async () => {${script}\n})()`, {
    args: { queryParameters: query },
    config: { runsInApp: inApp, runsInWidget: !inApp, widgetFamily: family },
    URLScheme: { forRunningScript: () => "scriptable:///run?scriptName=Fleet" },
    Request: class {
      constructor(url) {
        this.filename = url.split("/").pop();
        this.response = { statusCode: offline ? 503 : 200 };
        requests.push(this.filename);
      }
      async loadJSON() { return remote; }
      async load() {
        return { toBase64String: () =>
          (this.filename.endsWith(".pdf") ? pdf : png).toString("base64") };
      }
    },
    FileManager: { local: () => ({
      documentsDirectory: () => "/mock", cacheDirectory: () => "/mock/cache", joinPath: path.join,
      fileExists: key => disk.has(key), readString: key => disk.get(key),
      writeString: (key, val) => disk.set(key, val),
      write: (key, val) => disk.set(key, val),
    }) },
    QuickLook: { present: async file => { assert.ok(disk.has(file)); quickLook = file; } },
    Image: { fromData: data => data },
    Data: { fromBase64String: val => Buffer.from(val, "base64") },
    ListWidget: class extends Stack { async presentLarge() { widget = this; } },
    Alert: class { addAction() {} async presentAlert() { alert = this; } },
    Color: class {}, LinearGradient: class {}, Size: class {},
    Font: { semiboldSystemFont() {}, systemFont() {} },
    Script: { setWidget: item => { widget = item; }, complete: () => { complete = true; } },
    console: { log() {} },
  });
  assert.equal(complete, true);
  return { widget, alert, requests, quickLook };
}

async function main() {
  const first = await run({ inApp: true });
  const dashboard = first.widget.children[0].children[0];
  assert.deepEqual(dashboard.image, png);
  const [actions, fleet] = dashboard.children;
  assert.deepEqual(actions.children.map(x => x.labels[0]), ["View Report", "Generate Report"]);
  assert.equal(actions.children[0].url,
    `scriptable:///run?scriptName=Fleet&fleetAction=view&file=${meta.report.file}`);
  assert.match(actions.children[1].url, /[?&]fleetAction=generate$/);
  const trucks = fleet.children.slice(1).flatMap(x => x.children);
  assert.deepEqual(trucks.map(x => x.labels[0]),
    ["#101  Busy  ›", "#102  Shift Start  ›", "#103  En Route  ›", "#104  Available  ›"]);
  assert.ok(trucks[2].url.endsWith("fleetAction=truck&id=103"));
  assert.equal(first.requests.length, 2);
  const view = { inApp: true, query: { fleetAction: "view", file: meta.report.file } };
  assert.equal((await run({ ...view, offline: true })).alert.title, "Report unavailable");
  const opened = await run(view);
  assert.equal(opened.quickLook, `/mock/cache/${meta.report.file}`);
  assert.deepEqual(opened.requests, [meta.report.file]);
  const reopened = await run({ ...view, offline: true });
  assert.equal(reopened.quickLook, opened.quickLook);
  assert.deepEqual(reopened.requests, []);
  assert.deepEqual((await run()).requests, ["data.json"]);
  const cached = await run({ remote: { ...meta, map: { ...meta.map, revision: "12345678" } } });
  assert.equal(cached.widget.children[0].children[0].children[1].children[0].labels[1], "SAMPLE · CACHED");
  const generate = await run({ inApp: true, query: { fleetAction: "generate" } });
  assert.match(generate.alert.message, /not connected yet/);
  assert.deepEqual(generate.requests, []);
  const truck = await run({ inApp: true, query: { fleetAction: "truck", id: "103" }, offline: true });
  assert.equal(truck.alert.title, "Truck #103 · En Route");
  assert.match(truck.alert.message, /Scottsdale\nETA \/ Next stop: 12 min/);
  assert.deepEqual((await run({ family: "medium" })).requests, []);
  disk.clear();
  const unavailable = await run({ offline: true });
  assert.deepEqual(unavailable.widget.children[0].children[0].labels, ["Fleet snapshot unavailable"]);
  console.log("Passed: large layout, report link, generation notice, truck details, and map cache.");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
