# Domain Model

## 1. One Row

```js
const row = {
  date: "2026-10-10",
  campaignId: "applovin:5f8a66qb",
  country: "US",
  spend: 2998.4,
  installs: 632,
  impressions: 49679,
  clicks: 17980,
  retainedD1: 197,
  retainedD7: 56,
  payersD1: 12,
  payersD7: 17,
  payersD14: 25,
  payersD30: null,
  iapRevD0: 89.9,
  iapRevD1: 132.4,
  iapRevD3: 181.75,
  iapRevD7: 239.1,
  iapRevD14: 301.55,
  iapRevD30: null,
  adRevD0: 151.2,
  adRevD1: 236.8,
  adRevD3: 318.45,
  adRevD7: 410.3,
  adRevD14: 512.95,
  adRevD30: null,
};
// asOf 2026-11-04; D30 is due 2026-11-09, so it's `null`. CPI = $4.74.
// ROAS D7 gross = (239.10 + 410.30) / 2998.40 = 21.66%; net = (239.10 × 0.70 + 410.30) / 2998.40 = 19.27%
```

**One row describes one UTC day of one campaign in one country: how much was spent, how many users were bought that day, and how the users who installed that day retained, paid and generated ad revenue by day n.**

## 2. Data dictionary

### `DailyRow` — fact, key `date + campaignId + country`

| Field                   | Type                | Dimension or measure        | Unit                             | Can be missing?                                    | Example               |
| ----------------------- | ------------------- | --------------------------- | -------------------------------- | -------------------------------------------------- | --------------------- |
| `date`                  | `'YYYY-MM-DD'`      | dimension, key              | UTC day; install day = spend day | no                                                 | `'2026-10-10'`        |
| `campaignId`            | string              | dimension, key → Campaign   | —                                | no                                                 | `'applovin:5f8a66qb'` |
| `country`               | ISO alpha-2 \| null | dimension, key → Country    | —                                | yes: `null` if the source has no country split     | `'US'`                |
| `spend`                 | number ≥ 0          | measure                     | USD                              | no                                                 | `2998.40`             |
| `installs`              | integer ≥ 0         | measure                     | installs                         | no                                                 | `632`                 |
| `impressions`, `clicks` | integer ≥ 0 \| null | measure                     | count                            | yes                                                | `49679`, `17980`      |
| `retainedD{n}`          | integer \| null     | measure, cohort             | users active on day n            | yes: immature (D3) or not provided                 | `197` (n = 1)         |
| `payersD{n}`            | integer \| null     | measure, cohort, cumulative | distinct payers in days 0…n      | as above                                           | `17` (n = 7)          |
| `iapRevD{n}`            | number \| null      | measure, cohort, cumulative | USD, gross                       | as above                                           | `239.10` (n = 7)      |
| `adRevD{n}`             | number \| null      | measure, cohort, cumulative | USD                              | as above                                           | `410.30` (n = 7)      |
| `revD{n}`               | number \| null      | measure, cohort, cumulative | USD, total as reported           | as above; only when the source has no IAP/ad split | `649.40` (n = 7)      |

`{n}` is any window a source provides, commonly 0, 1, 3, 7, 14 and 30. Required: `date`, campaign, `spend`, `installs`.

### `Campaign` — dimension, key `id`

| Field      | Type                           | Dimension or measure | Unit | Can be missing? | Example                            |
| ---------- | ------------------------------ | -------------------- | ---- | --------------- | ---------------------------------- |
| `id`       | string                         | dimension, key       | —    | no              | `'applovin:7c3e91fa'`              |
| `name`     | string                         | dimension            | —    | no              | `'Android_WW_blended_D0'`          |
| `network`  | string                         | dimension            | —    | no              | `'applovin'`, `'google'`, `'meta'` |
| `app`      | string                         | dimension            | —    | yes             | `'com.example.game'`               |
| `platform` | `'ios' \| 'android'`           | dimension            | —    | yes             | `'android'`                        |
| `goal`     | string, in the network's terms | dimension            | —    | yes             | `'ROAS D0'`, `'tCPI'`              |

Attributes come from upload columns or a campaign file. Names are display text and are never parsed.

### `Country` — dimension, key `code`

| Field  | Type        | Dimension or measure | Unit                         | Can be missing? | Example            |
| ------ | ----------- | -------------------- | ---------------------------- | --------------- | ------------------ |
| `code` | ISO alpha-2 | dimension, key       | —                            | no              | `'GB'`             |
| `name` | string      | dimension            | —                            | no              | `'United Kingdom'` |
| `vat`  | number 0–1  | rate                 | tax included in store prices | no (0)          | `0.20`             |

`vat` is seeded with standard VAT for the EU-27 (17% in Luxembourg to 27% in Hungary), UK (20%), Norway (25%) and 0 elsewhere (Switzerland is left out in v1).

### `Upload` — metadata, key `network`

| Field     | Type           | Dimension or measure | Unit                                     | Can be missing? | Example                                     |
| --------- | -------------- | -------------------- | ---------------------------------------- | --------------- | ------------------------------------------- |
| `network` | string         | key                  | —                                        | no              | `'applovin'`                                |
| `asOf`    | `'YYYY-MM-DD'` | metadata             | last UTC day the export's revenue covers | no              | `'2026-11-04'`                              |
| `fields`  | string[]       | metadata             | optional fields and windows the file has | no              | `['country', 'impressions', 'iapRevD7', …]` |

Each source has a column mapping to these fields (AppLovin: `D1Open` → `retainedD1`, `D7UniqueP` → `payersD7`, `IAPRev7` → `iapRevD7`). v1: a new upload replaces the previous one for its network. v2 will merge uploads by date, campaign and asOf, keeping cohorts until a maximum window such as D180; an MMP file covering several networks counts as one upload per network. `asOf` defaults to the file's latest `date`: that can blank complete cells but never shows an incomplete one as complete.

### `StoreFee` — rates for net IAP

| platform | countries   | installedFrom | fee | what it is                                 |
| -------- | ----------- | ------------- | --- | ------------------------------------------ |
| `*`      | `*`         | —             | 30% | standard rate on both stores               |
| ios      | JP          | 2025-12-18    | 26% | 21% commission + 5% payment processing     |
| ios      | EU-27       | 2026-10-01    | 26% | Apple In-App Purchase, EU terms            |
| android  | US, GB, EEA | 2026-06-30    | 25% | 20% service + 5% billing fee, new installs |
| android  | AU, JP      | 2026-09-30    | 25% | 20% service + 5% billing fee, new installs |

The most specific rule wins: exact platform over `*`, then a country list over `*`, then the latest `installedFrom` on or before the row's `date`.
Apple charges by the date of the purchase, not the date of the install, so keying Apple’s rates on install date is an dashboard approximation. In addition, small-business rates aren't modelled.

## 3. Metric glossary

Every metric is Σ numerator ÷ Σ denominator over the group. Two filters apply before summing: rows must be mature for n, and their upload must have all the required fields.

Revenue per row:

- `iapDn` = net `iapRevDn × (1 − fee) ÷ (1 + vat)` by default, or gross `iapRevDn`; a global switch picks (D5).
- `revenueDn` = `iapDn + adRevDn` if the source has both, otherwise whichever it has, otherwise `revDn`.

ROAS is total ROAS from `revenueDn`, so it works with whatever revenue a source has; IAP and adROAS appear only where the split exists. The header names what went in ("IAP net + ad", "IAP only", "total as reported"), per network when they differ.

| Metric                   | Formula from fields                 | Additive? | Over a group                     | Denominator 0        | Display format     |
| ------------------------ | ----------------------------------- | --------- | -------------------------------- | -------------------- | ------------------ |
| Spend · Installs         | `spend` · `installs`                | yes       | Σ                                | n/a                  | `$#,##0` · `#,##0` |
| CPI                      | `spend / installs`                  | no        | Σ ÷ Σ                            | `null`, shown as `—` | `$0.00`            |
| CPM                      | `spend / impressions × 1000`        | no        | Σ ÷ Σ                            | `—`                  | `$0.00`            |
| IPM                      | `installs / impressions × 1000`     | no        | Σ ÷ Σ                            | `—`                  | `0.0`              |
| RR Dn                    | `retainedDn / installs`             | no        | Σ ÷ Σ, mature rows               | `—`                  | `0.0%`             |
| Payer % Dn               | `payersDn / installs`               | no        | Σ ÷ Σ, mature rows               | `—`                  | `0.00%`            |
| CPPU Dn                  | `spend / payersDn`                  | no        | Σ ÷ Σ, mature rows               | `—`                  | `$0.00`            |
| Revenue Dn               | `revenueDn`                         | yes       | Σ of per-row values, mature rows | n/a                  | `$#,##0`           |
| ROAS Dn                  | `revenueDn / spend`                 | no        | Σ ÷ Σ, mature rows               | `—`                  | `0.0%`             |
| IAP ROAS Dn · Ad ROAS Dn | `iapDn / spend` · `adRevDn / spend` | no        | Σ ÷ Σ, mature rows               | `—`                  | `0.0%`             |
| ARPU Dn                  | `revenueDn / installs`              | no        | Σ ÷ Σ, mature rows               | `—`                  | `$0.00`            |

**Coverage** = spend of the rows that pass ÷ the group's spend.

| State     | When                         | Cell                                                                               |
| --------- | ---------------------------- | ---------------------------------------------------------------------------------- |
| value     | coverage 100%                | `32.5%`                                                                            |
| partial   | coverage 50–99%              | `32.5%*`; tooltip names what's missing ("cohorts after Aug 3", "Meta: no revenue") |
| blank     | coverage < 50%               | empty; tooltip gives the reason ("matures Aug 17")                                 |
| undefined | denominator 0                | `—`                                                                                |
| hidden    | no loaded row has the fields | the column, option or filter isn't shown                                           |

### CalcROAS: predicted ROAS (custom metric)

```
R1 = revenueD1 / spend;  R7 = revenueD7 / spend          // group totals
predicted = R7 × (1 + (R7/R1 − 1) / (b7/b1 − 1) × (bH/b7 − 1))
```

It scales a benchmark ROAS curve (b1 at D1, b7 at D7, bH at DH) by how fast the group grew from D1 to D7 compared with the benchmark; above 1.0, the group is predicted to pay back. b1, b7 and bH are parameters of the metric. It runs once per group (it isn't linear, so per-row results can't be averaged), needs D7 maturity, and gives `null` when R1 is 0.

## 4. Three screens

All three share filters (install dates, network, app, platform, goal, country), the revenue switch, and a header line `as of 2026-11-04 · UTC · USD · IAP net + ad`. A column, filter or metric option appears only when loaded data supports it.

**Campaign list**

- _Question:_ where is the money going this period, and which campaigns pay back (scale, continue monitoring or pause)?
- _Columns:_ Campaign · Network · Spend · Installs · CPI · CPM · IPM · CPPU D7 · ROAS D0 · ROAS D7 · ROAS D14 · ROAS D30. The totals row is blended.
- _Controls:_ date range (default: 45 days up to `asOf`), filters, group by campaign / network / app / platform / goal / country, sort, search. A campaign click opens its detail; any other group click becomes a filter.

**Campaign detail**
→

- _Question:_ is this campaign getting better or worse, and why: the auction (CPM) or conversion (IPM), given CPI = CPM ÷ IPM? Which countries carry it, and which should be cut?
- _Columns:_ KPI tiles (Spend, Installs, CPI, ROAS D0, ROAS D7); trend chart with spend bars, one metric line and note markers; country table, top 15 by spend plus "Other" (Spend, Installs, CPI, CPM, IPM, RR D1, ROAS D0, ROAS D7).
- _Controls:_ date range, day / week / month, line metric, click a country to plot it alone, `+ note` on a day.

**Cohort grid**

- _Question:_ how fast does each install cohort pay back, and are newer cohorts ahead of older ones?
- _Columns:_ cohort · Spend · Installs · CPI · one column per window present. The last row, "All mature", gives each column its own denominator.
- _Controls:_ cohort size day / week / month; metric ROAS / ARPU / payer % / RR; revenue total / IAP / ad (when split); filters; heatmap within each column; note markers on rows; click a row for the campaign list of those dates.

## 5. Annotations

| Field        | Type                                                                                             | Required | Notes                                                 |
| ------------ | ------------------------------------------------------------------------------------------------ | -------- | ----------------------------------------------------- |
| `id`         | string                                                                                           | yes      | `crypto.randomUUID()`                                 |
| `date`       | `'YYYY-MM-DD'`                                                                                   | yes      | UTC day                                               |
| `text`       | string                                                                                           | yes      | trimmed, 1–280 characters                             |
| `createdAt`  | ISO 8601 timestamp                                                                               | yes      | set by the app                                        |
| `campaignId` | string \| null                                                                                   | no       | `null` = global                                       |
| `kind`       | `'bid' \| 'budget' \| 'creative' \| 'targeting' \| 'release' \| 'external' \| 'data' \| 'other'` | no       | default `'other'`                                     |
| `countries`  | ISO alpha-2[]                                                                                    | no       | default `[]` = all; e.g. countries cut from targeting |
| `endDate`    | `'YYYY-MM-DD'` \| null                                                                           | no       | inclusive end of a multi-day event                    |
| `author`     | string \| null                                                                                   | no       | campaign manager                                      |

## 6. Out of scope

- Creative, ad-set and placement breakdowns → needs a different kind of raw data
- iOS framework: SKAdNetwork, modeled conversions → different methods apply
- Predicted LTV and profitability curves → varies by product
- Actual store proceeds (refunds, chargebacks, payouts) → usually take around 6 months to close the period
- Other currencies and time zones → no practical need
- Live API connectors and scheduled refresh → needs a backend
- Organic installs and incrementality → different domain compared with paid UA
- Budgets, bids, alerts, automated rules, write-back to networks → different tool
- Fraud signals → different tool
- Reconciling sources → might be added during v2
- Targets, period-over-period deltas, percent of total and other table calculations → might be added during v2
- Country tiers and possibility to save country groups → will be added during v2
- Accounts, permissions, sharing → might be added during final polish
- AI integration for plain language requests → will be added during final polish
