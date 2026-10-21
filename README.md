# CheckDiesel — GitHub Pages Preview

A mobile-friendly, browser-based dashboard for analysing site diesel dispenser exports.

This **static demonstration is not a shared production database**. Choose Import to load an XLSX or CSV exported from the pump system; usage data and alias overrides remain in your own browser's localStorage and are not included in this public Git repository or uploaded to the site operator. To remove locally imported entries, clear this website's browser storage.

### Supported features
- PLANT2 / other dispenser account filters
- Plant vs road-vehicle vs bowser/transfer splits
- Asset history and consumption calculations where valid readings are present
- Confirmed Grab, FLT, Inventhor, Tana Shark, Case 210, JCB 11/12, Tractor, Sheffield and bowser names
- Grab 6 aliases: GRB6, 3RAB6, G6 and GRAB6
- Transaction list, charts, quality checks, and responsive layout

### Deployment
GitHub Pages should serve from branch `gh-pages`, folder `/(root)`. If not automatically enabled, select that branch under repository Settings → Pages. The Pages URL should then be `https://jamesburtondrums-ops.github.io/checkplant/`.

Source development continues on branch `feature/checkdiesel-site-fuel` (PR #2). Firestore security and shared multi-user persistence are **not** implemented on this static GitHub Pages branch.
