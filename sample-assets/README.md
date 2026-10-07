# KrishiRakshak demo image pack

## Crop photo inputs

Use any PNG in `crop-photos/` with **Take a photo or upload**. The browser only previews the selected file. The current prototype does not infer a pest or disease from image pixels; choose the corresponding visible symptom chips to see the demo rule-based triage.

- `cotton-powdery-leaf.png` — illustrative white leaf patches.
- `maize-leaf-spots.png` — illustrative elongated leaf damage.
- `soybean-leaf-damage.png` — illustrative spots and holes.
- `cotton-boll-damage.png` — illustrative boll entry damage.

These images were synthetically generated for a UI demo; they are not verified field samples or expert diagnoses.

## Pest QR cards

Upload one of the PNG files in `pest-qr/` from the **Upload QR image** control, or open **Download all 5 pest QR cards** in the app. Each QR encodes the short code below. The backend resolves that code into an educational pest card with likely signs and scouting / IPM steps. If camera scanning is supported by the browser, point the camera at a printed or second-screen QR; otherwise the QR image upload has a local fallback for these generated Version 1-L cards. Manual code entry is also available.

| File | QR code | Demo result |
|---|---|---|
| `pest_cotton_01.png` | `PEST-COTTON-01` | Pink bollworm · cotton |
| `pest_maize_01.png` | `PEST-MAIZE-01` | Fall armyworm · maize |
| `pest_soy_01.png` | `PEST-SOY-01` | Stem fly · soybean |
| `pest_aphid_01.png` | `PEST-APHID-01` | Aphid · cotton |
| `pest_tomato_01.png` | `PEST-TOMATO-01` | Fruit borer · tomato |

The cards are educational demo records. They do not authenticate a pesticide pack, confirm an infestation, or prescribe chemical doses. Confirm pest identity and treatment with local agriculture experts and current registered labels. QR codes can be regenerated with `python generate_qr.py` from the project root.

## Reference context

ICAR notes pheromone-trap monitoring and destructive boll sampling for pink bollworm in cotton, and its 2025 Kharif advisory discusses soybean stem-fly management. These demo cards keep actions general and direct farmers to local recommendations rather than reproducing pesticide dose instructions: [ICAR pink bollworm monitoring context](https://icar.gov.in/en/5th-stakeholders-interface-meeting-enhancing-cotton-productivity-under-changing-climatic-scenario), [ICAR Kharif agro-advisory 2025](https://icar.gov.in/sites/default/files/Circulars/ICAR-En-Kharif-Agro-Advisories-for-Farmers-2025.pdf).
