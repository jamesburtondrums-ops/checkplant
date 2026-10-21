# CheckDiesel · CheckPlant fuel control

**Status:** Development preview. The feature is isolated on a feature branch. Do **not** deploy to a publicly writable Firestore database until server-enforced access controls are confirmed.

## Why this is integrated
- Uses the existing CheckPlant Firebase/Firestore project and live `machines` documents (machine IDs, names, serial numbers and branches).
- The CheckPlant home screen and ManagerDash quick links link to `checkdiesel.html`.
- No duplicate machine master is created. A fill references the existing `machineId`, with a snapshot of name and branch for audit history.
- Fuel does **not** overwrite `machines.currentHours`: this prevents historic or late fuel entries from rolling back a service interval.

## Main operator workflows
1. **Add tank/bowser:** site, capacity, reorder quantity and opening stock; an opening-stock ledger event is written.
2. **Receive delivery:** supplier, docket/invoice reference, litres, ex-VAT £/litre and receiver; bulk weighted-average fuel value updates.
3. **Refuel a machine:** select live CheckPlant asset, source tank, litres, operator, optional hour meter and reference. Blocks dispensing more than recorded tank stock.
4. **Transfer:** move stock between two tanks; subtract/add events plus balances are committed atomically, preserving weighted-average inventory value.
5. **Dip/reconcile:** enter actual tank measurement and reason. Store positive/negative adjustment instead of rewriting or deleting old issue records.
6. **Report:** per-site, per-month and per-machine movement views, 30-day metrics, machine usage, CSV export and limited litres-per-engine-hour calculation.

## Firestore document contracts

`dieselTanks/{tankId}`
- `name`, `site`, `kind` (`fixed` or `bowser`)
- `capacityLitres`, `stockLitres`, `reorderLitres`
- `averageCostPerLitre` in GBP ex VAT, `active`, `updatedAt`, `createdAt`

`dieselMovements/{movementId}`
- `type`: `opening`, `delivery`, `issue`, `transfer_out`, `transfer_in`, `adjustment`
- `tankId`, `tankName`, `site`, `date`, `createdAt`, `operator`
- `litres` (absolute), `deltaLitres` (signed), `unitCost`, `totalCost`
- Optional `machineId`, `machineName`, `assetBranch`, `hours`, `reference`, `counterparty`, `transferId`, `stockBeforeLitres`, `stockAfterLitres`

Stock-changing operations use Firestore transactions with tank document reads and ledger-document writes in the same commit. Movement events are append-only in the UI; stock cannot fall below zero or exceed capacity.

## Required before production

- [ ] **Firestore rules and identity:** Existing CheckPlant pages use a client-side manager PIN, not server-side identity. Review the actual deployed Firestore rules. Introduce Firebase Authentication plus role/site-scoped Firestore rules for diesel, preferably enforced through authenticated operations or a server endpoint. A hard-coded client PIN, hidden buttons, or security-by-URL are not access control.
- [ ] Decide who can register tanks, dip/reconcile stock, receive deliveries, issue fuel and read financial pricing. Tank setup and manual adjustments should be restricted to supervisors. Enforce roles in the backend.
- [ ] Verify Firestore access is denied to unauthenticated users and operators cannot modify/delete historic ledger entries or invent machine IDs. Test positive/negative permission cases.
- [ ] Verify against **test** data, not live production diesel inventory: initial stock, a delivery, refill, a transfer, dip variance, overfill/overdraw, concurrent dispenses, offline errors, duplicate tank attempts, CSV.
- [ ] Add robust duplicate tank prevention under simultaneous creation and consider movement corrections as reversal entries; the current duplicate-name check is client-side.
- [ ] Agree tank ownership and bowser movements across sites/branches (source site and destination site).
- [ ] Add server-authoritative timestamps/identity, immutable actor IDs, date/clock validation, pagination for long histories, and rate-limiting where appropriate.
- [ ] Confirm pricing should be ex-VAT and whether costing should integrate into CostLog without double counting.
- [ ] Validate calibration and measurement method for physical diesel tank levels.
- [ ] Review Cloudflare/hosting deployment and launch behind appropriate user access.

## Smoke test

Run `node tests/checkdiesel.cjs` to check the JavaScript syntax, simulated stock operations, weighted-average pricing and overdraw prevention. This is an in-memory test only; it does **not** prove Firestore rules, connectivity, live deployment or race-condition safety.

## Potential next phase

QR labels on machinery/tanks; refuelling photos and delivery note attachments; authorised operators and digital signatures; mobile offline capture with safe reconciliation; telematics imports; fuel-card imports; cross-site movements; planned vs actual burn rates; anomaly alerts, leakage and theft investigations; fuel value per engine hour and per tonne handled from weighbridge operations.

## Plant and road vehicle separation (October 20, 2026 extension)

The original checkdiesel.html now has a **Plant machinery / Road vehicle** selector for each new manual refuel. Plant refuels use the existing `machines` collection and optional engine-hour readings. Road vehicle refuels use the new `dieselVehicles` collection with a configured odometer unit of **miles** or **kilometres**. Manual issues continue to deduct tank stock atomically.

`checkdiesel-intelligence.html` provides the split operational analysis:

- **Plant tab:** fuel litres by CheckPlant asset, indicative litres/engine hour from plausible positive meter intervals ending in the selected month.
- **Fleet tab:** fuel by registered road vehicle; indicative UK imperial MPG and L/100km from plausible distance intervals.
- **Unmapped tab:** source codes not linked to a known asset, including identifier `0`. These litres are retained in the full source totals rather than excluded.
- **Import tab:** preview and import dispenser `.xlsx` or `.csv` exports. The parser recognises DATE, HOUR, UNIT, REG. NUMBER, ODOMETER, DRIVER, QUANTITY (L).
- **Mapping tab:** link dispenser codes (e.g. a nickname, machine ID, UK registration, or account label) to a CheckPlant plant ID, registered road vehicle ID, transfer/bowser, or unresolved category. Mapping is read dynamically so corrections update historic reports.
- **Vehicle register:** registration, display name, home site, class, and odometer measurement unit.

### Additional collections

- `dieselVehicles/{vehicleId}`: `registration`, `name`, `site`, `category`, `odometerUnit` (`mi` or `km`), `active`, `createdAt`.
- `dieselAliases/{urlEncodedUppercaseCode}`: `code`, `kind` (`plant`, `vehicle`, `transfer`, `unmapped`), `assetId`, `updatedAt`.
- `dieselExternalDispenses/{sha256CanonicalRow}`: `fingerprint`, `date`, `time`, `site`, `unit`, `identifier`, `rawOdometer`, `driver`, `litres`, `source`, `flags`, `importedBy`, `sourceFile`, `importedAt`, `affectsTankStock:false`.

`dieselExternalDispenses` are historical reconciliation records. **Importing does not change tank stock**; this avoids accidental extra debits if the source dispenser has already been reconciled to tank dips or manually logged elsewhere. Repeat imports use a deterministic SHA-256 key for each source row, so they overwrite the same audit record rather than add the volume again. This only deduplicates identical source rows, not a matching manually entered issue; overlapping sources still need reconciliation.

### Analysis of provided source export (1–20 Oct 2026)

The supplied Excel had **323 issues totalling 55,802.41 litres**, **101 distinct dispenser codes**, **118 zero meter readings**, **10 readings of 999999**, and **14 rows with code 0 totalling 1,819.68 L**. The source has no verified asset classification or invoice pricing. Some single dispenses exceed 500 L and may be bowser/bulk transfers rather than consumption. In particular, the reported LT23BFU meter values contain apparent placeholder sequences, YE19JPS has a very large jump, and HN63VBX contains a suspicious missing-digit reading. These rows are not suitable for unreviewed efficiency calculations.

### Rate calculation and limitations

- Unmapped records have no efficiency figure. Transfer/bowser issues are **not** treated as asset consumption.
- Invalid readings (zero, 999999, obvious patterned placeholders), decreasing meters, and implausible step changes are excluded from distance/time rate intervals.
- Each interval is measured between consecutive plausible meter observations, with source litres attributable to the interval; the interval ending month determines its reporting period.
- Road MPG is **UK imperial gallons** (`4.54609 litres`), not US MPG.
- **Caution:** partial fills, a vehicle's first full fill, unrecorded external refuelling, calibration errors, and fuel consumed while parked may distort these estimates. For trustworthy MPG, confirm full-to-full fills or use tank/telematics data.
- `DRIVER` is retained as the raw source account label; values such as `PLANT2` are not treated as verified operators.

### Further production blockers

- Enforce authenticated, site- and role-scoped Firestore rules on **all three new collections** and the new refuel paths. Existing client-side manager PINs do not provide backend authorization.
- Restrict who can map asset identities, register vehicles, import historic dispenser data or see vehicle fuel histories.
- Confirm the pump export's odometer units, registration aliases, asset classes, bowser locations and how to reconcile tank stock without double counting.
- Verify real XLSX parse/preview on the actual browser and a staging Firebase project, then run `node tests/checkdiesel-intelligence.cjs`.
- Consider server-side import with job IDs, duplicate cross-source matching, immutable importer identity and Firestore pagination for larger history.

All changes remain on the draft PR branch and should not be launched as a writable production app until security checks pass.

## Usability-first dashboard (October 20, 2026)

- `checkdiesel-dashboard.html` offers a polished front end, filtering by date, source account, asset class and identifier; usage visualisations, sortable browsing, detailed per-asset history, manual alias confirmation and XLSX/CSV browser import.
- A standalone version preloaded with the October user export is provided privately to the user. **Do not commit/upload that private transaction seed to this repository or publish it on Cloudflare.** The repository and public preview only include an empty, client-side import app.
- Imported data and classification choices are kept in browser localStorage for this development preview, not a shared database. That means **not** accessible across devices. The existing Firestore-backed CheckDiesel operations and separate intelligence proof remain on the feature branch for later unified integration, after authenticated permissions are developed and tested.
- Cloudflare development Worker `checkdiesel-site-preview` hosts the same blank client-side import front end. Production requires secure cloud persistence, user authentication, access control and source-to-tank reconciliation.

## Confirmed October 2026 dispenser account and asset classification

The pump export uses the column **DRIVER** as a *dispenser account* (not reliably the literal person dispensing fuel). This is essential: **PLANT2** is the main plant account but can include occasional road vehicles; all other accounts must be separately filterable rather than being silently classified as plant or fleet.

Confirmed user-provided rules, applied automatically in `checkdiesel-dashboard.html`:

| Raw code(s) | Canonical group | Category | Meaning |
|---|---|---|---|
| `FT2`, `FT4`, and `FT<number>` | `FLT<number>` | Plant | Forklift truck with corresponding number |
| `G1`, `GRAB 1`, `GRAB1`, and similar numbers | `GRAB<number>` | Plant | Same numbered grab |
| `INV` | `INV` | Plant | Inventhor |
| `TANA` | `TANA` | Plant | Tana Shark |
| `CASE210` | `CASE210` | Plant | Case 210 Excavator |
| `JCB11`, `JCB12` | distinct `JCB11` and `JCB12` | Plant | Separate numbered JCB machines |
| `TRACT`, `TRACTOR` | `TRACTOR` | Plant | Tractor |
| `SHEF` | `SHEF` | Fuel transfer | Fuel taken to Sheffield branch |
| `BOW` | `BOW` | Fuel transfer | Fuel to Shires or emergency refuelling; final destination is not known for an individual transaction |

The source code stays on each original transaction; only *display and asset grouping* use a canonical alias. Other codes such as `GRB6`, `3RAB6`, `FLK2`, `GRAB50`, `B`, `TVV`, and person-name entries should not be silently collapsed into known assets without confirming their meaning. Numbers in `GRAB50` are treated literally.

### Proven source totals, October 1–20, 2026

- **PLANT2:** 169 transactions / **30,527.22 L**.
- **All other dispenser accounts:** 154 transactions / **25,275.19 L**.
- **Total:** 323 transactions / **55,802.41 L**.
- Confirmed **grab** codes: 37 issues / **8,628.71 L**.
- Confirmed **FLT** codes: 3 issues / **107.16 L**.
- Confirmed **SHEF + BOW transfers:** 17 issues / **2,591.84 L** (16 issues on PLANT2 and 1 on another dispenser account).
- Other user-confirmed plant codes including Inventhor, Tana, Case210, JCB11/12, Tractor: 19 issues / **6,489.59 L**.
- Residual unresolved codes include some apparent vehicle registrations, code 0, and person-name or shorthand labels.

### UX

- Dedicated **Dispenser accounts** and **Transfers & bowsers** pages.
- One-click top-level **PLANT2** vs **Other dispenser accounts** split, plus an account-group filter across the rest of the dashboard.
- Branded human-readable asset names and canonical grouping with the original code preserved in transaction history.
- Review prioritises unverified identifiers, large dispenses and questionable road odometers, not simply plant hour-meter blanks.
- Standalone private HTML file with 323 preloaded records supplied directly to the user; public Cloudflare preview still starts with **no transaction data**.
- The version has been smoke-tested in Chromium via in-memory HTML and Playwright for account totals, filtering, transfer separation, mapped group names and mapping forms; JS syntax passed. Browser file/localhost navigation was blocked by this execution environment, so the tests used Playwright `set_content`. Import from the physical XLSX remains to be manually verified on the actual Cloudflare preview.

**Do not interpret BOW or SHEF as a final consumption event for a piece of plant.** Reconcile subsequent deliveries/dispenses separately to avoid double counting.

### Confirmed Grab 6 aliases (21 October 2026)

The user confirmed that dispenser identifiers `GRB6` and `3RAB6` **both mean Grab 6**. The dashboard's `canonicalCode` now normalises both to `GRAB6` (in addition to `G6` and `GRAB6`). Raw transaction identifiers remain unchanged. The October source contains `GRB6` = 264.54 L and `3RAB6` = 240.85 L, totalling **505.39 litres** allocated to Grab 6.
