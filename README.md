# KrishiRakshak — Smart farming assistant

Mobile-first farmer-facing crop-health prototype for SIH 26131, with a Python API and a plain HTML/CSS/JavaScript frontend. The interface can switch between English and Hindi using the button in the header; the preference is saved in the browser. Translations for the screen and generated results are maintained in `i18n.js`. This prototype demonstrates the workflow, not a validated diagnostic product.

## Run it

1. Install Python 3.10 or newer (no packages are required).
2. Open this folder in VS Code.
3. Run `python server.py` in the integrated terminal, or select **Terminal → Run Task → Run KrishiRakshak**.
4. Open `http://127.0.0.1:8001` in a browser.
5. For camera access, use localhost or HTTPS and allow camera permission. Live-camera QR scanning requires a browser that supports `BarcodeDetector`; sample QR image uploads also have a built-in fallback.
6. To enable official live weather, register at the [IMD API portal](https://api.imd.gov.in/public/index.php), obtain an API access token and set it before starting the server. In PowerShell: `$env:IMD_API_TOKEN="your-issued-token"; python server.py`. The token stays in the backend process and must not be committed to source control. Without it, the app displays an IMD-unavailable message instead of fabricated sample readings.

The Python backend must be running even if you preview the page with Live Server. It now uses the separate port `8001`, so an older app on port `8000` cannot supply stale weather. Start it from this folder with `python server.py`, then open `http://127.0.0.1:8001`. Live Server on localhost also sends its API requests to this updated backend. Pest QR cards and symptom-based crop guidance have an offline demo fallback, but live IMD weather needs an IMD token.

## Publish a link other people can open

This project includes a `Dockerfile` and `render.yaml` for a small public demo service on Render. The local backend is bound to `127.0.0.1`; the cloud configuration binds to `0.0.0.0` and the host-provided `PORT`, so the deployed page, APIs, camera and browser geolocation use one HTTPS URL.

1. Create a GitHub repository and upload the contents of this `kisan-sathi` folder. Do not upload your IMD token or put it in source code.
2. Create a Render account, choose **New → Blueprint**, connect the GitHub repository and apply its `render.yaml` blueprint. Render will build the Docker image and run the health check at `/api/health`.
3. In the Render service's **Environment** settings, set `IMD_API_TOKEN` to the token issued by IMD. If you do not yet have an IMD token, you can still deploy the app, but live weather will remain unavailable.
4. Wait for the deploy to finish and open the `onrender.com` URL shown by Render. Share that HTTPS URL; other PCs need only a browser and internet access.

Render's free web services sleep after 15 minutes without traffic and can take about a minute to wake on the next visit. This option is suitable for an SIH demo; review the hosting plan before relying on it for continuous or production service.

## Files and what each part does

- `server.py` — Backend, written using Python's standard library. `ThreadingHTTPServer` serves the static files and handles multiple requests. `GET /api/health` reports service status. `GET /api/weather?lat=…&lon=…` finds a nearby IMD AWS/ARG station and requests its latest observation; if none is available, it uses the nearest IMD city forecast. `GET /api/reverse-geocode` resolves a button-requested location with OpenStreetMap Nominatim. `POST /api/diagnose` accepts crop, crop stage, selected symptom IDs and weather, then applies small transparent rules and returns triage text. `GET /api/product/<code>` searches the in-memory demo label catalog. `PRODUCTS` is an intentionally tiny sample catalog, not an official pesticide registry. The file also contains explanatory comments at the rules and data boundary. 
- `index.html` — Frontend structure and user workflow. The weather summary, image upload/camera capture input, crop and stage selectors, symptom checklist, diagnosis result area, QR camera and upload area, manual product-code lookup, natural/preventive guidance, and the in-app explanation are all defined here. It loads the styling and browser logic from the adjacent files.
- `style.css` — Visual design, color variables, cards, form controls, scanner frame, warning states and small-screen layout. The media queries adapt the two tool cards into a single-column mobile flow.
- `app.js` — Browser behavior. It checks backend health; when the farmer presses **Know farm weather**, requests browser location, resolves a readable place name and requests IMD weather; previews a crop photo on the device; submits symptom selections and weather to the diagnosis endpoint; reads QR codes through `BarcodeDetector` where supported; offers manual lookup; detects an expired sample record; escapes API text before displaying it; and copies a farm-note template. Comments explain important boundaries.
- `i18n.js` — English/Hindi interface catalog and language switch. It translates page text, placeholders, accessibility labels and dynamically generated diagnosis/product results, updates the document language and date format, and saves the selection as `kr-language` in browser storage. Add a translation entry here whenever visible UI copy changes.
- `generate_qr.py` — Writes five Version 1-L pest QR PNGs with Python's standard library. Each QR encodes a short code which the API resolves to a pest card.
- `sample-assets/crop-photos/` — Four illustrative crop photos for trying the upload preview.
- `sample-assets/pest-qr/` — Five scannable QR images for pink bollworm, fall armyworm, soybean stem fly, cotton aphid and tomato fruit borer. See [sample-assets/README.md](sample-assets/README.md) for the file-to-result mapping.

## Demo paths

- Crop triage: upload/take a photo, choose crop and crop stage, select signs, then choose **Check crop health**. The photo stays in the browser; the current prototype does not analyze image pixels. The response is generated from symptom choices and humidity/rain rules.
- Weather: choose **Know farm weather** to request browser location permission. The backend looks up the nearest IMD AWS/ARG station for current readings and falls back to the nearest IMD city forecast when there is no station observation. It shows the station and source update time/date when supplied. IMD API access requires a token from the [official portal](https://api.imd.gov.in/public/index.php), supplied as `IMD_API_TOKEN`; if it is absent or invalid, the panel tells you IMD is unavailable. The locality lookup uses Nominatim and attributes OpenStreetMap. Nominatim is called only on a user button press; its policy limits public API use to at most one request/second and requires an identifying User-Agent and attribution. For a public deployment, use a suitable geocoder with caching and service-level rate controls.
- Pest QR: open **Download all 5 pest QR cards**, then scan a card with a compatible camera or use **Upload QR image**. When `BarcodeDetector` is unavailable, image upload decodes the generated sample cards locally. Manual entry also works: `PEST-COTTON-01`, `PEST-MAIZE-01`, `PEST-SOY-01`, `PEST-APHID-01`, and `PEST-TOMATO-01` return pest signs, scouting steps and preventive options.
- Product QR: `KISAN-001` and `DEMO-EXPIRED` demonstrate valid/expired sample catalog records. The lookup does not validate product authenticity.
- Field note: copies crop, stage, selected symptoms and weather into a text template for a farmer to complete with a photo and share with an extension worker.

## Safety, accuracy and data

This is an early-triage demo. It does not identify disease from an image, establish a pest infestation, or replace an agronomist. The crop photos are synthetic illustrations, and their image pixels are not analyzed. Weather associations are broad risk cues, not disease predictions. Pest QR cards are educational examples, not confirmed identifications. Sample pesticide records are not endorsements or authoritative label instructions. The prototype deliberately gives no pesticide dose; always follow the current registered product label and local agriculture department advice. QR content alone cannot verify authenticity. Photos are previewed locally and are not uploaded by this version. Geolocation is requested only after the user presses the location button.

## Next steps for a field-ready SIH build

1. Load verified product registrations, crop-wise labels and expiry data from an authoritative maintained source; add provenance, update dates and anti-counterfeit verification.
2. Train and evaluate a crop-specific image model with locally collected, expert-labeled Maharashtra field images; report uncertainty and request expert review for ambiguous cases.
3. Validate the pest/weather thresholds with agriculture experts and local historical data; add crop variety, growth stage, district and scout observations.
4. Add Marathi and other target languages, offline-first caching, secure user accounts, consent, encrypted sync, and an extension-officer dashboard with verified field reports.
5. Add tests, monitoring, rate limits, input validation, deployment configuration and a production database before public use.
