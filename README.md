# GitHub-rendered Scriptable widget

A large iOS fleet dashboard for Scriptable, with a service-area map, four sample truck status buttons, and a PDF report. The two-chart dashboard and the original medium widget remain available as separate scripts.

## Run it on your iPhone

1. Paste [the raw `FleetWidget.js` script](https://raw.githubusercontent.com/daboardflow/ios-chart-widget/refs/heads/main/FleetWidget.js) into Scriptable. You can replace the contents of your existing large widget script or choose the new script in the widget settings.
2. Run the script for a large preview. On the Home Screen, **View Report** opens the sample PDF. Each fleet row shows the truck, status, and area, with a **View** button for details. **Generate Report** currently opens an explanatory message; it does not start a workflow.
3. The dashboard displays the last validated map and status snapshot if a refresh fails. The PDF downloads on first tap, opens in Quick Look, and can be reopened offline while it remains in Scriptable's cache.

To rebuild the sample PDF and map, use **Actions → Render widget → Run workflow → fleet**. Python writes the preview map and a content-versioned PDF (the full supplied reference map and sample truck status table), then publishes their manifest. Do not publish real dispatch records, customer data, or staff names to this public repository.

The older [two-chart dashboard](https://raw.githubusercontent.com/daboardflow/ios-chart-widget/refs/heads/main/DashboardWidget.js) and [medium chart widget](https://raw.githubusercontent.com/daboardflow/ios-chart-widget/refs/heads/main/ChartWidget.js) still work. The chart workflow options remain `dashboard`, `iris`, `wind-rose`, and `current`. The existing schedule renders the chart versions at `:07` and `:37` UTC; the static fleet sample is rebuilt manually only. The widgets request a refresh no earlier than 30 minutes; [iOS decides when they actually refresh](https://docs.scriptable.app/listwidget/).

## Test or extend it locally

```sh
python -m pip install -r requirements.txt
python render_fleet.py --out /tmp/widget-fleet
node test-fleet.cjs /tmp/widget-fleet
python render_dashboard.py --out /tmp/widget-dashboard
node test-dashboard.cjs /tmp/widget-dashboard
python render.py --chart wind-rose --out /tmp/widget-wind
python render.py --chart iris --out /tmp/widget-iris
node test-widget.cjs /tmp/widget-wind /tmp/widget-iris
```

The wind rose uses the supplied test values, not live weather. The Mt. Bruno renderer fetches the [Plotly Mt. Bruno elevation CSV](https://raw.githubusercontent.com/plotly/datasets/master/api_docs/mt_bruno_elevation.csv) and excludes the row-index column. The legacy Iris renderer fetches the [Plotly Iris CSV](https://raw.githubusercontent.com/plotly/datasets/master/iris-data.csv).

The dashboard renders each panel at `348 × 504` pixels for a `116 × 168` point display. Both panels are verified against their manifest revisions before the dashboard updates its local cache. If a download fails, it shows the last complete set.
