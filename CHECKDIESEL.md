# CheckDiesel · CheckPlant fuel control

**Status:** Development preview. The feature is isolated on a feature branch. Do **not** deploy to a publicly writable Firestore database until server-enforced access controls are confirmed.

## Why this is integrated
- Uses the existing CheckPlant Firebase/Firestore project and live \`machines\` documents (machine IDs, names, serial numbers and branches).
- The CheckPlant home screen and ManagerDash quick links link to \`checkdiesel.html\`.
- No duplicate machine master is created. A fill references the existing \`machineId\`, with a snapshot of name and branch for audit history.
- Fuel does **not** overwrite \`machines.currentHours\`: this prevents historic or late fuel entries from rolling back a service interval.

## Main operator workflows
1. **Add tank/bowser:** site, capacity, reorder quantity and opening stock; an opening-stock ledger event is written.
2. **Receive delivery:** supplier, docket/invoice reference, litres, ex-VAT £/litre and receiver; bulk weighted-average fuel value updates.
3. **Refuel a machine:** select live CheckPlant asset, source tank, litres, operator, optional hour meter and reference. Blocks dispensing more than recorded tank stock.
4. **Transfer:** move stock between two tanks; subtract/add events plus balances are committed atomically, preserving weighted-average inventory value.
5. **Dip/reconcile:** enter actual tank measurement and reason. Store positive/negative adjustment instead of rewriting or deleting old issue records.
6. **Report:** per-site, per-month and per-machine movement views, 30-day metrics, machine usage, CSV export and limited litres-per-engine-hour calculation.

## Firestore document contracts

\`dieselTanks/{tankId}\`
- \`name\`, \`site\`, \`kind\` (\`fixed\` or \`bowser\`)
- \`capacityLitres\`, \`stockLitres\`, \`reorderLitres\`
- \`averageCostPerLitre\` in GBP ex VAT, \`active\`, \`updatedAt\`, \`createdAt\`

\`dieselMovements/{movementId}\`
- \`type\`: \`opening\`, \`delivery\`, \`issue\`, \`transfer_out\`, \`transfer_in\`, \`adjustment\`
- \`tankId\`, \`tankName\`, \`site\`, \`date\`, \`createdAt\`, \`operator\`
- \`litres\` (absolute), \`deltaLitres\` (signed), \`unitCost\`, \`totalCost\`
- Optional \`machineId\`, \`machineName\`, \`assetBranch\`, \`hours\`, \`reference\`, \`counterparty\`, \`transferId\`, \`stockBeforeLitres\`, \`stockAfterLitres\`

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

Run \`node tests/checkdiesel.cjs\` to check the JavaScript syntax, simulated stock operations, weighted-average pricing and overdraw prevention. This is an in-memory test only; it does **not** prove Firestore rules, connectivity, live deployment or race-condition safety.

## Potential next phase

QR labels on machinery/tanks; refuelling photos and delivery note attachments; authorised operators and digital signatures; mobile offline capture with safe reconciliation; telematics imports; fuel-card imports; cross-site movements; planned vs actual burn rates; anomaly alerts, leakage and theft investigations; fuel value per engine hour and per tonne handled from weighbridge operations.