// Paste into Scriptable. Change BASE_URL only if you deploy this to another repo.
const BASE_URL = "https://raw.githubusercontent.com/daboardflow/ios-chart-widget/main/public";
const REFRESH_MINUTES = 30;

function checksum(base64) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < base64.length; i++) {
    hash = Math.imul(hash ^ base64.charCodeAt(i), 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function validateMetadata(meta) {
  if (!meta || meta.schema !== 1 || typeof meta.title !== "string" ||
      !meta.title || typeof meta.caption !== "string" ||
      !/^[0-9a-f]{8}$/.test(meta.revision)) {
    throw new Error("Unexpected data.json format");
  }
}

function decodeChart(meta, png) {
  if (typeof png !== "string" || !png.startsWith("iVBORw0KGgo") ||
      checksum(png) !== meta.revision) {
    throw new Error("Chart does not match data.json yet");
  }
  const image = Image.fromData(Data.fromBase64String(png));
  if (!image) throw new Error("The chart image could not be decoded");
  return image;
}

async function request(path, method) {
  const req = new Request(`${BASE_URL}/${path}`);
  req.timeoutInterval = 6;
  const value = await req[method]();
  if (req.response.statusCode !== 200) {
    throw new Error(`${path.split("?")[0]}: HTTP ${req.response.statusCode}`);
  }
  return value;
}

async function loadChart() {
  const fm = FileManager.local();
  const path = fm.joinPath(fm.documentsDirectory(), `chart-widget-${checksum(BASE_URL)}.json`);
  let cached;
  try {
    if (fm.fileExists(path)) {
      const { meta, png } = JSON.parse(fm.readString(path));
      validateMetadata(meta);
      cached = { meta, image: decodeChart(meta, png) };
    }
  } catch (error) {
    console.log(`Ignoring unreadable cache: ${error}`);
  }

  try {
    const meta = await request("data.json", "loadJSON");
    validateMetadata(meta);
    if (cached?.meta.revision === meta.revision) return { ...cached, meta };
    const bytes = await request(`chart.png?v=${meta.revision}`, "load");
    const png = bytes.toBase64String();
    const image = decodeChart(meta, png);
    try {
      fm.writeString(path, JSON.stringify({ meta, png }));
    } catch (error) {
      console.log(`Could not save chart cache: ${error}`);
    }
    return { meta, image };
  } catch (error) {
    if (!cached) throw error;
    console.log(`Showing cached chart: ${error}`);
    return { ...cached, offline: true };
  }
}

async function buildWidget() {
  const widget = new ListWidget();
  const bg = new LinearGradient();
  bg.colors = [new Color("#212133"), new Color("#151522")];
  bg.locations = [0, 1];
  widget.backgroundGradient = bg;
  widget.setPadding(7, 10, 7, 10);
  widget.refreshAfterDate = new Date(Date.now() + REFRESH_MINUTES * 60 * 1000);

  let content;
  try {
    content = await loadChart();
  } catch (error) {
    const title = widget.addText("Chart unavailable");
    title.font = Font.semiboldSystemFont(15);
    title.textColor = Color.white();
    widget.addSpacer(5);
    const detail = widget.addText(error.message || String(error));
    detail.font = Font.systemFont(11);
    detail.textColor = new Color("#BCB9CC");
    return widget;
  }

  widget.addSpacer();
  const header = widget.addStack();
  header.centerAlignContent();
  const title = header.addText(content.meta.title);
  title.font = Font.semiboldSystemFont(14);
  title.lineLimit = 1;
  title.minimumScaleFactor = 0.75;
  title.textColor = Color.white();
  header.addSpacer(6);
  header.addSpacer();
  const status = header.addText(content.offline ? "Cached" : content.meta.caption);
  status.font = Font.systemFont(8.5);
  status.lineLimit = 1;
  status.minimumScaleFactor = 0.8;
  status.textColor = new Color(content.offline ? "#E4BC87" : "#BCB9CC");

  widget.addSpacer(4);
  const chart = widget.addImage(content.image);
  chart.imageSize = new Size(268, 100);
  chart.centerAlignImage();
  widget.addSpacer();
  return widget;
}

const widget = await buildWidget();
if (config.runsInApp) {
  await widget.presentMedium();
} else {
  Script.setWidget(widget);
}
Script.complete();
