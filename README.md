# CheckDiesel — GitHub Pages

**Website:** https://jamesburtondrums-ops.github.io/checkplant/checkdiesel

GitHub Pages serves `checkdiesel/index.html` at `/checkplant/checkdiesel/`, and GitHub may automatically redirect the slashless address to the trailing-slash form.

**Publishing source:** `gh-pages` branch, `/(root)`. Configure it in the repository's **Settings → Pages** if Pages is not already enabled.

## Privacy

This is a **client-side preview**, not a secure central fuel ledger. The repository contains no private diesel transaction records. When you import pump XLSX/CSV records, they remain in the current browser's local storage; classifications are saved there too. Other browsers and users will not see that data automatically. Clearing browser data removes those local records.

Features include a PLANT2/other account split; plant/fleet/bowser allocation; confirmed equipment mappings including `GRB6` and `3RAB6` to Grab 6; asset consumption, fuel transfer and monthly history views; XLSX/CSV import.

The wider CheckDiesel integration remains in PR #2 on branch `feature/checkdiesel-site-fuel`, pending audited server-side login and role-based access.
