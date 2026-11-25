# GitHub-rendered Scriptable widget

A large iOS dashboard for Scriptable, with two placeholder buttons above a wind rose and a Mt. Bruno elevation surface. Both charts use sample data. The original medium widget remains available as a separate script.

## Run it on your iPhone

1. Copy [the raw `DashboardWidget.js` script](https://raw.githubusercontent.com/daboardflow/ios-chart-widget/refs/heads/main/DashboardWidget.js) into a new Scriptable script. It already points at this public repo; no token is needed.
2. Run the script to see the large preview. On your Home Screen, add a **large** Scriptable widget and select the new script. If replacing a medium widget, remove the medium widget and add a large one.
3. **Action 1** and **Action 2** are visual placeholders. The `ACTIONS` array in `DashboardWidget.js` is where their labels and destinations can be set later. The dashboard fetches `public/dashboard/data.json` and only downloads the chart PNGs whose revisions changed.

To rerender immediately, use **Actions → Render widget → Run workflow** and choose `dashboard`. For the original medium widget, use [the raw `ChartWidget.js` script](https://raw.githubusercontent.com/daboardflow/ios-chart-widget/refs/heads/main/ChartWidget.js) and select `iris`, `wind-rose`, or `current` in the workflow. The medium chart selection is independent of the large dashboard.

The scheduled job renders both versions at `:07` and `:37` UTC and only commits changed outputs. [GitHub can delay scheduled jobs](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows?trk=public_post_comment-text), and its raw-file cache can take a few minutes to show newly published charts. The widgets request a refresh no earlier than 30 minutes; [iOS decides when they actually refresh](https://docs.scriptable.app/listwidget/).

## Test or extend it locally

```sh
python -m pip install -r requirements.txt
python render_dashboard.py --out /tmp/widget-dashboard
node test-dashboard.cjs /tmp/widget-dashboard
python render.py --chart wind-rose --out /tmp/widget-wind
python render.py --chart iris --out /tmp/widget-iris
node test-widget.cjs /tmp/widget-wind /tmp/widget-iris
```

The wind rose uses the supplied test values, not live weather. The Mt. Bruno renderer fetches the [Plotly Mt. Bruno elevation CSV](https://raw.githubusercontent.com/plotly/datasets/master/api_docs/mt_bruno_elevation.csv) and excludes the row-index column. The legacy Iris renderer fetches the [Plotly Iris CSV](https://raw.githubusercontent.com/plotly/datasets/master/iris-data.csv).

The dashboard renders each panel at `348 × 504` pixels for a `116 × 168` point display. Both panels are verified against their manifest revisions before the dashboard updates its local cache. If a download fails, it shows the last complete set.
