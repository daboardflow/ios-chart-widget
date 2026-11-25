# GitHub-rendered Scriptable widget

A medium iOS widget for a server-rendered chart. The starter opens with the Laurel, Nebraska wind rose and can switch to the Iris scatter matrix without a change to the Scriptable script.

## Run it on your iPhone

1. Copy [the raw `ChartWidget.js` script](https://raw.githubusercontent.com/daboardflow/ios-chart-widget/refs/heads/main/ChartWidget.js) into a new Scriptable script. It already points at this public repo. No GitHub token goes on the phone.
2. Run the script in Scriptable to see the medium preview. Then add a medium Scriptable widget on your Home Screen, edit it, and select the script.
3. On GitHub, go to **Actions → Render widget → Run workflow** on the default branch. Choose `iris` to switch charts, `wind-rose` to switch back, or `current` to rerender without switching. The next scheduled run keeps the choice recorded in `public/data.json`.

If you deploy your own copy, include the hidden `.github/` directory and update `BASE_URL` in `ChartWidget.js` to point to the `/public` folder on your public repo's default branch. The included `public/chart.png` and `public/data.json` let you preview the wind rose even before the first scheduled run.

The job is scheduled at `:07` and `:37` UTC, and it commits only if the chart or metadata changes. [GitHub can delay scheduled jobs](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows?trk=public_post_comment-text). The job also needs permission to push to the default branch; if your branch requires pull requests, its rules can block the push. After a manual switch, GitHub's raw-file cache can take a few minutes to show the new chart. The widget requests a refresh no earlier than 30 minutes; [iOS decides when it actually refreshes](https://docs.scriptable.app/listwidget/).

## Test or extend it locally

```sh
python -m pip install -r requirements.txt
python render.py --chart wind-rose --out /tmp/widget-wind
python render.py --chart iris --out /tmp/widget-iris
node test-widget.cjs /tmp/widget-wind /tmp/widget-iris
```

The wind rose uses the supplied test values, not live weather. Its bars overlay from zero, with north up and the remaining directions clockwise. The Iris renderer fetches the [Plotly Iris CSV](https://raw.githubusercontent.com/plotly/datasets/master/iris-data.csv).

To add a new chart, add a renderer in `render.py` and a matching workflow choice. Keep the image at `804 × 300` pixels for a `268 × 100` point display, and leave the manifest schema, title, caption and image revision intact. The widget uses the revision to detect mismatched downloads and shows the last complete cached pair when either request fails.
