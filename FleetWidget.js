// Paste into Scriptable and select this script on a large widget.
const RAW = "https://raw.githubusercontent.com/daboardflow/ios-chart-widget/refs/heads/main/public/fleet";
const REPORTS = "https://github.com/daboardflow/ios-chart-widget/blob/main/public/fleet";
const W = 272;
const MAP_HEIGHT = 150;
const INK = "#F3F1FC";
const MUTED = "#C7C4DD";
const CARD = "#202036";
const STATUS = {
  "Busy": "#176234", "Shift Start": "#8D430C",
  "En Route": "#1D50A1", "Available": "#495872",
};

function checksum(base64) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < base64.length; i++) hash = Math.imul(hash ^ base64.charCodeAt(i), 0x01000193);
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function valid(meta) {
  if (meta?.schema !== 1 || meta.layout !== "fleet" || meta.type !== "sample" ||
      meta.map?.file !== "service-map.png" || !/^[a-f0-9]{8}$/.test(meta.map?.revision) ||
      !/^fleet-report-[a-f0-9]{12}\.pdf$/.test(meta.report?.file) ||
      !Array.isArray(meta.fleet) || meta.fleet.length !== 4 ||
      new Set(meta.fleet.map(truck => truck?.id)).size !== 4 ||
      !meta.fleet.every(truck => /^\d{3}$/.test(truck.id) &&
        Object.prototype.hasOwnProperty.call(STATUS, truck.status) &&
        typeof truck.area === "string" && typeof truck.next === "string")) {
    throw new Error("Invalid fleet snapshot");
  }
  return meta;
}

function mapImage(meta, png) {
  if (typeof png !== "string" || !png.startsWith("iVBORw0KGgo") ||
      checksum(png) !== meta.map.revision) throw new Error("Mismatched map revision");
  const image = Image.fromData(Data.fromBase64String(png));
  if (!image) throw new Error("Map could not be decoded");
  return image;
}

async function request(path, method) {
  const req = new Request(`${RAW}/${path}`);
  req.timeoutInterval = 6;
  const value = await req[method]();
  if (req.response?.statusCode !== 200) throw new Error(`Download failed: ${path}`);
  return value;
}

async function loadFleet() {
  const fm = FileManager.local();
  const path = fm.joinPath(fm.documentsDirectory(), `fleet-widget-${checksum(RAW)}.json`);
  let cache;
  try {
    if (fm.fileExists(path)) {
      const { meta, png } = JSON.parse(fm.readString(path));
      cache = { meta: valid(meta), png, image: mapImage(meta, png) };
    }
  } catch (error) { console.log(`Ignoring fleet cache: ${error}`); }
  try {
    const meta = valid(await request("data.json", "loadJSON"));
    const sameMap = cache?.meta.map.revision === meta.map.revision;
    const png = sameMap ? cache.png :
      (await request(`${meta.map.file}?v=${meta.map.revision}`, "load")).toBase64String();
    const image = sameMap ? cache.image : mapImage(meta, png);
    if (JSON.stringify(meta) !== JSON.stringify(cache?.meta)) {
      try { fm.writeString(path, JSON.stringify({ meta, png })); }
      catch (error) { console.log(`Could not write fleet cache: ${error}`); }
    }
    return { meta, image };
  } catch (error) {
    if (!cache) throw error;
    return { ...cache, cached: true };
  }
}

function label(stack, value, size, bold = false, color = INK) {
  const t = stack.addText(value);
  t.font = bold ? Font.semiboldSystemFont(size) : Font.systemFont(size);
  t.textColor = new Color(color);
  t.lineLimit = 1;
  t.minimumScaleFactor = 0.85;
  return t;
}

function actionURL(action, extra = "") {
  const url = URLScheme.forRunningScript();
  return `${url}${url.includes("?") ? "&" : "?"}fleetAction=${action}${extra}`;
}

function button(row, title, width, height, color, url, border = false) {
  const item = row.addStack();
  item.layoutHorizontally();
  item.centerAlignContent();
  item.size = new Size(width, height);
  item.cornerRadius = 8;
  item.backgroundColor = new Color(color);
  if (border) {
    item.borderWidth = 1;
    item.borderColor = new Color("#A9A0CD");
  }
  if (url) item.url = url;
  item.addSpacer();
  label(item, title, height > 30 ? 12 : 10, true);
  item.addSpacer();
}

async function buildWidget() {
  const widget = new ListWidget();
  const bg = new LinearGradient();
  bg.colors = [new Color("#212133"), new Color("#151522")];
  bg.locations = [0, 1];
  widget.backgroundGradient = bg;
  widget.setPadding(7, 8, 7, 8);
  widget.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000);
  if (config.runsInWidget && config.widgetFamily !== "large") {
    label(widget, "Use a large Scriptable widget", 13, true);
    return widget;
  }

  let snapshot;
  try { snapshot = await loadFleet(); }
  catch (error) { console.log(`Fleet snapshot unavailable: ${error}`); }

  widget.addSpacer();
  const frame = widget.addStack();
  frame.addSpacer();
  const dashboard = frame.addStack();
  dashboard.layoutVertically();
  dashboard.size = new Size(W, 0);
  frame.addSpacer();

  const actions = dashboard.addStack();
  button(actions, "View Report", 132, 36, "#6A51A3",
    snapshot ? `${REPORTS}/${snapshot.meta.report.file}` : null);
  actions.addSpacer(8);
  button(actions, "Generate Report", 132, 36, CARD, actionURL("generate"), true);
  dashboard.addSpacer(6);

  if (!snapshot) {
    label(dashboard, "Fleet snapshot unavailable", 12, true, MUTED);
  } else {
    const map = dashboard.addImage(snapshot.image);
    map.imageSize = new Size(W, MAP_HEIGHT);
    map.cornerRadius = 10;
    dashboard.addSpacer(6);
    const fleet = dashboard.addStack();
    fleet.layoutVertically();
    fleet.setPadding(6, 8, 6, 8);
    fleet.backgroundColor = new Color(CARD);
    fleet.cornerRadius = 10;
    const header = fleet.addStack();
    header.centerAlignContent();
    label(header, "Fleet Status", 12, true);
    header.addSpacer();
    label(header, snapshot.cached ? "SAMPLE · CACHED" : "SAMPLE DATA", 8, true, MUTED);
    fleet.addSpacer(4);
    for (let i = 0; i < 4; i += 2) {
      if (i) fleet.addSpacer(4);
      const row = fleet.addStack();
      for (const truck of snapshot.meta.fleet.slice(i, i + 2)) {
        if (truck === snapshot.meta.fleet[i + 1]) row.addSpacer(6);
        button(row, `#${truck.id}  ${truck.status}  ›`, 125, 23, STATUS[truck.status],
          actionURL("truck", `&id=${encodeURIComponent(truck.id)}`));
      }
    }
  }
  widget.addSpacer();
  return widget;
}

async function showAction(query) {
  const alert = new Alert();
  if (query.fleetAction === "generate") {
    alert.title = "Generate Report";
    alert.message = "On-demand generation is not connected yet. Use View Report to open the sample PDF.";
  } else {
    let truck;
    try { truck = (await loadFleet()).meta.fleet.find(item => item.id === query.id); }
    catch (error) { console.log(`Truck snapshot unavailable: ${error}`); }
    alert.title = truck ? `Truck #${truck.id} · ${truck.status}` : "Truck details unavailable";
    alert.message = truck ? `${truck.area}\nETA / Next stop: ${truck.next}\n\nSample data` :
      "Open the fleet widget again when the sample snapshot is available.";
  }
  alert.addAction("Done");
  await alert.presentAlert();
}

const query = args.queryParameters ?? {};
if (config.runsInApp && ["generate", "truck"].includes(query.fleetAction)) {
  await showAction(query);
} else {
  const widget = await buildWidget();
  if (config.runsInApp) await widget.presentLarge();
  else Script.setWidget(widget);
}
Script.complete();
