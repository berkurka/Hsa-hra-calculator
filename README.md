# HRA vs HSA comparison (tax year 2026)

A small static page that compares an employer **HRA** health plan with an **HSA** health plan for US federal tax year 2026. It estimates after-tax premiums, what you would pay at different levels of medical bills, which plan costs less, and how much would be left in the HSA.

The page is plain HTML, CSS, and JavaScript. There is no build step and no server. You can host it on GitHub Pages.

This is a planning estimate, not tax, legal, or benefits advice.

## Run it

Open `index.html` in a browser.

From a terminal you can also serve the folder (useful if you want a normal `http://` address):

```bash
python3 -m http.server 8000
```

Then visit http://localhost:8000.

## Tests

The default inputs (payroll switch off) are checked against the reference table with Node’s built-in test runner. No packages to install.

```bash
npm test
```

That runs `node --test`.

## GitHub Pages

1. Push this repository to GitHub.
2. Open the repository **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
4. Choose the branch you want to publish (for example `main`) and the folder **/ (root)**, then save.
5. After the site finishes deploying, it is available at `https://<user>.github.io/<repository>/`.

Paths in the page are relative, so a project site works without a build.

## Where the tax figures come from

- Federal brackets and the 2026 standard deduction ($32,200 married filing jointly, $16,100 single): IRS [Revenue Procedure 2025-32](https://www.irs.gov/pub/irs-drop/rp-25-32.pdf).
- HSA contribution limits ($4,400 self-only, $8,750 family): IRS [Revenue Procedure 2025-19](https://www.irs.gov/pub/irs-drop/rp-25-19.pdf).

The on-page “How this is calculated” and “Assumptions” sections describe the formulas, including the 20% coinsurance default, the HRA balance, federal-only tax unless you set a state rate, and an HSA that starts the year empty.
