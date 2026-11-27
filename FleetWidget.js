// Paste into Scriptable and select this script on a large widget.
const RAW = "https://raw.githubusercontent.com/daboardflow/ios-chart-widget/refs/heads/main/public/fleet";
const W = 272;
const MAP_HEIGHT = 150;
const INK = "#F3F1FC";
const MUTED = "#C7C4DD";
const CARD = "#202036";
const REPORT_FILE = /^fleet-report-[a-f0-9]{12}\.pdf$/;
const STATUS = {
  "Busy": "#65D98B", "Shift Start": "#FFAE68",
  "En Route": "#70AAFF", "Available": "#A6B3CB",
};

function checksum(base64) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < base64.length; i++) hash = Math.imul(hash ^ base64.charCodeAt(i), 0x01000193);
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function valid(meta) {
  if (meta?.schema !== 1 || meta.layout !== "fleet" || meta.type !== "sample" ||
      meta.map?.file !== "service-map.png" || !/^[a-f0-9]{8}$/.test(meta.map?.revision) ||
      !REPORT_FILE.test(meta.report?.file) ||
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
  item.cornerRadius = height / 2;
  item.backgroundColor = new Color(color);
  if (border) {
    item.borderWidth = 1;
    item.borderColor = new Color("#A9A0CD");
  }
  if (url) item.url = url;
  item.addSpacer();
  label(item, title, height >= 28 ? 11 : 9.5, true);
  item.addSpacer();
}

function fleetRow(list, truck) {
  const row = list.addStack();
  row.centerAlignContent();
  row.size = new Size(W - 16, 20);

  function column(width) {
    const cell = row.addStack();
    cell.size = new Size(width, 20);
    cell.centerAlignContent();
    return cell;
  }

  label(column(39), `#${truck.id}`, 11, true);
  const status = column(85);
  const dot = status.addStack();
  dot.size = new Size(6, 6);
  dot.cornerRadius = 3;
  dot.backgroundColor = new Color(STATUS[truck.status]);
  status.addSpacer(5);
  label(status, truck.status, 10.5);
  label(column(76), truck.area, 10.5, false, MUTED);
  row.addSpacer();
  button(row, "View ›", 48, 17, "#2E2D49",
    actionURL("truck", `&id=${encodeURIComponent(truck.id)}`), true);
}

async function buildWidget() {
  const widget = new ListWidget();
  const bg = new LinearGradient();
  bg.colors = [new Color("#212133"), new Color("#151522")];
  bg.locations = [0, 1];
  widget.backgroundGradient = bg;
  widget.setPadding(6, 8, 5, 8);
  widget.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000);
  if (config.runsInWidget && config.widgetFamily !== "large") {
    label(widget, "Use a large Scriptable widget", 13, true);
    return widget;
  }

  let snapshot;
  try { snapshot = await loadFleet(); }
  catch (error) { console.log(`Fleet snapshot unavailable: ${error}`); }

  const frame = widget.addStack();
  frame.addSpacer();
  const dashboard = frame.addStack();
  dashboard.layoutVertically();
  dashboard.size = new Size(W, 0);
  frame.addSpacer();

  const actions = dashboard.addStack();
  actions.addSpacer();
  button(actions, "View Report", 100, 28, "#6A51A3",
    snapshot ? actionURL("view", `&file=${encodeURIComponent(snapshot.meta.report.file)}`) : null);
  actions.addSpacer(7);
  button(actions, "Generate Report", 117, 28, CARD, actionURL("generate"), true);
  actions.addSpacer();
  dashboard.addSpacer(5);

  if (!snapshot) {
    label(dashboard, "Fleet snapshot unavailable", 12, true, MUTED);
  } else {
    const map = dashboard.addImage(snapshot.image);
    map.imageSize = new Size(W, MAP_HEIGHT);
    map.cornerRadius = 10;
    dashboard.addSpacer(5);
    const fleet = dashboard.addStack();
    fleet.layoutVertically();
    fleet.setPadding(5, 8, 5, 8);
    fleet.backgroundColor = new Color(CARD);
    fleet.cornerRadius = 10;
    const header = fleet.addStack();
    header.centerAlignContent();
    label(header, "Fleet Status", 12, true);
    if (snapshot.cached) {
      header.addSpacer();
      label(header, "Cached", 8.5, false, MUTED);
    }
    fleet.addSpacer(3);
    snapshot.meta.fleet.forEach((truck, index) => {
      if (index) {
        const divider = fleet.addStack();
        divider.size = new Size(W - 16, 1);
        divider.backgroundColor = new Color("#34334B");
      }
      fleetRow(fleet, truck);
    });
  }
  widget.addSpacer();
  return widget;
}

async function showAction(query) {
  const alert = new Alert();
  if (query.fleetAction === "view") {
    try {
      if (!REPORT_FILE.test(query.file)) throw new Error("Invalid report filename");
      const fm = FileManager.local();
      const target = fm.joinPath(fm.cacheDirectory(), query.file);
      if (!fm.fileExists(target)) {
        const pdf = await request(query.file, "load");
        if (!pdf.toBase64String().startsWith("JVBERi0")) throw new Error("Invalid PDF response");
        fm.write(target, pdf);
      }
      await QuickLook.present(target, true);
      return;
    } catch (error) {
      console.log(`Could not open fleet report: ${error}`);
      alert.title = "Report unavailable";
      alert.message = "Check your connection or reopen the widget and try again.";
    }
  } else if (query.fleetAction === "generate") {
    alert.title = "Generate Report";
    alert.message = "On-demand generation is not connected yet. Use View Report to open the sample PDF.";
  } else {
    let truck;
    try { truck = (await loadFleet()).meta.fleet.find(item => item.id === query.id); }
    catch (error) { console.log(`Truck snapshot unavailable: ${error}`); }
    alert.title = truck ? `Truck #${truck.id} · ${truck.status}` : "Truck details unavailable";
    alert.message = truck ? `${truck.area}\nETA / Next stop: ${truck.next}` :
      "Open the fleet widget again when the sample snapshot is available.";
  }
  alert.addAction("Done");
  await alert.presentAlert();
}

const query = args.queryParameters ?? {};
if (config.runsInApp && ["view", "generate", "truck"].includes(query.fleetAction)) {
  await showAction(query);
} else {
  const widget = await buildWidget();
  if (config.runsInApp) await widget.presentLarge();
  else Script.setWidget(widget);
}
Script.complete();
