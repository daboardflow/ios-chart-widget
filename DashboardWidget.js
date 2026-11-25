// Paste into Scriptable, then select this script on a large Home Screen widget.
const BASE_URL = "https://raw.githubusercontent.com/daboardflow/ios-chart-widget/refs/heads/main/public/dashboard";
const REFRESH_MINUTES = 30;
const ACTIONS = [
  { label: "Action 1", primary: true, url: null },
  { label: "Action 2", primary: false, url: null },
];
const PANEL_IDS = ["wind-rose", "mt-bruno"];
const CARD_WIDTH = 132;
const PLOT_SIZE = new Size(116, 168);
const GAP = 8;
const PALETTE = {
  top: "#212133", bottom: "#151522", card: "#222235", border: "#393850",
  accent: "#6A51A3", secondary: "#9E9AC8", text: "#F3F1FC",
  muted: "#BCB9CC", cached: "#E4BC87",
};

function checksum(base64) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < base64.length; i++) {
    hash = Math.imul(hash ^ base64.charCodeAt(i), 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function validateManifest(meta) {
  if (meta?.schema !== 1 || meta.layout !== "dashboard" ||
      !Array.isArray(meta.panels) || meta.panels.length !== PANEL_IDS.length ||
      !PANEL_IDS.every((id, index) => {
        const panel = meta.panels[index];
        return panel?.id === id && panel.image === `${id}.png` &&
          typeof panel.title === "string" && panel.title.length > 0 &&
          typeof panel.revision === "string" && /^[0-9a-f]{8}$/.test(panel.revision);
      })) {
    throw new Error("Unexpected dashboard data.json format");
  }
}

function decodeImage(panel, png) {
  if (typeof png !== "string" || !png.startsWith("iVBORw0KGgo") ||
      checksum(png) !== panel.revision) {
    throw new Error(`${panel.title} image does not match its published revision`);
  }
  const image = Image.fromData(Data.fromBase64String(png));
  if (!image) throw new Error(`${panel.title} image could not be decoded`);
  return image;
}

async function request(path, method) {
  const req = new Request(`${BASE_URL}/${path}`);
  req.timeoutInterval = 6;
  const value = await req[method]();
  if (req.response?.statusCode !== 200) {
    throw new Error(`${path.split("?")[0]}: HTTP ${req.response?.statusCode ?? "unknown"}`);
  }
  return value;
}

async function loadDashboard() {
  const fm = FileManager.local();
  const path = fm.joinPath(fm.documentsDirectory(), `chart-dashboard-${checksum(BASE_URL)}.json`);
  let cached;
  try {
    if (fm.fileExists(path)) {
      const { meta, files } = JSON.parse(fm.readString(path));
      validateManifest(meta);
      cached = meta.panels.map((panel) => {
        const png = files[panel.id];
        return { ...panel, png, image: decodeImage(panel, png) };
      });
    }
  } catch (error) {
    console.log(`Ignoring unreadable dashboard cache: ${error}`);
  }

  try {
    const meta = await request("data.json", "loadJSON");
    validateManifest(meta);
    let changed = !cached;
    const panels = await Promise.all(meta.panels.map(async (panel, index) => {
      const previous = cached?.[index];
      if (previous?.revision === panel.revision) {
        return { ...panel, png: previous.png, image: previous.image };
      }
      changed = true;
      const bytes = await request(`${panel.image}?v=${panel.revision}`, "load");
      const png = bytes.toBase64String();
      return { ...panel, png, image: decodeImage(panel, png) };
    }));
    if (changed || panels.some((panel, index) => panel.title !== cached?.[index].title)) {
      try {
        const files = Object.fromEntries(panels.map(({ id, png }) => [id, png]));
        fm.writeString(path, JSON.stringify({ meta, files }));
      } catch (error) {
        console.log(`Could not save dashboard cache: ${error}`);
      }
    }
    return { panels };
  } catch (error) {
    if (!cached) throw error;
    console.log(`Showing cached dashboard: ${error}`);
    return { panels: cached, offline: true };
  }
}

function label(stack, value, size, color = PALETTE.text, semibold = false) {
  const text = stack.addText(value);
  text.font = semibold ? Font.semiboldSystemFont(size) : Font.systemFont(size);
  text.textColor = new Color(color);
  text.lineLimit = 1;
  text.minimumScaleFactor = 0.75;
  return text;
}

function centerRow(container) {
  const row = container.addStack();
  row.layoutHorizontally();
  row.addSpacer();
  return row;
}

function addAction(row, action) {
  const button = row.addStack();
  button.layoutHorizontally();
  button.size = new Size(CARD_WIDTH, 44);
  button.centerAlignContent();
  button.cornerRadius = 11;
  button.backgroundColor = new Color(action.primary ? PALETTE.accent : PALETTE.card);
  if (!action.primary) {
    button.borderColor = new Color(PALETTE.secondary);
    button.borderWidth = 1;
  }
  if (action.url) button.url = action.url;
  button.addSpacer();
  label(button, action.label, 13, PALETTE.text, true);
  button.addSpacer();
}

function addPanel(row, panel) {
  const card = row.addStack();
  card.layoutVertically();
  card.size = new Size(CARD_WIDTH, 204);
  card.setPadding(9, 8, 6, 8);
  card.cornerRadius = 13;
  card.backgroundColor = new Color(PALETTE.card);
  card.borderColor = new Color(PALETTE.border);
  card.borderWidth = 1;
  label(card, panel.title, 12, PALETTE.text, true);
  card.addSpacer(5);
  const plot = card.addImage(panel.image);
  plot.imageSize = PLOT_SIZE;
  plot.centerAlignImage();
}

async function buildWidget() {
  const widget = new ListWidget();
  const gradient = new LinearGradient();
  gradient.colors = [new Color(PALETTE.top), new Color(PALETTE.bottom)];
  gradient.locations = [0, 1];
  widget.backgroundGradient = gradient;
  widget.setPadding(10, 9, 10, 9);
  widget.refreshAfterDate = new Date(Date.now() + REFRESH_MINUTES * 60 * 1000);

  if (config.runsInWidget && config.widgetFamily !== "large") {
    label(widget, "Use a large Scriptable widget", 13, PALETTE.text, true);
    return widget;
  }

  widget.addSpacer();
  const actions = centerRow(widget);
  ACTIONS.forEach((action, index) => {
    if (index) actions.addSpacer(GAP);
    addAction(actions, action);
  });
  actions.addSpacer();
  widget.addSpacer(10);

  try {
    const { panels, offline } = await loadDashboard();
    const cards = centerRow(widget);
    panels.forEach((panel, index) => {
      if (index) cards.addSpacer(GAP);
      addPanel(cards, panel);
    });
    cards.addSpacer();
    widget.addSpacer(7);
    const footer = centerRow(widget);
    label(footer, offline ? "Sample data · Cached" : "Sample data", 9,
      offline ? PALETTE.cached : PALETTE.muted);
    footer.addSpacer();
  } catch (error) {
    console.log(`Dashboard unavailable: ${error}`);
    const row = centerRow(widget);
    label(row, "Charts unavailable", 13, PALETTE.muted);
    row.addSpacer();
  }
  widget.addSpacer();
  return widget;
}

const widget = await buildWidget();
if (config.runsInApp) await widget.presentLarge();
else Script.setWidget(widget);
Script.complete();
