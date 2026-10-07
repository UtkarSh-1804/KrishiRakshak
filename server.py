"""KrishiRakshak demo API. Uses only Python's standard library."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs, urlencode
from urllib.request import Request, urlopen
import json
import os
import threading
import time
from pathlib import Path

ROOT = Path(__file__).parent
# Local development uses 127.0.0.1:8001; cloud hosts set HOST=0.0.0.0
# and provide PORT (Render currently defaults web services to 10000).
HOST = os.environ.get("HOST", "127.0.0.1")
PORT = int(os.environ.get("PORT", os.environ.get("KRISHIRAKSHAK_PORT", "8001")))
IMD_API_TOKEN = os.environ.get("IMD_API_TOKEN", "").strip()
IMD_BASE = "https://api.imd.gov.in/api/v1"
GEOCODE_LOCK = threading.Lock()
GEOCODE_CACHE = {}
GEOCODE_LAST_REQUEST = 0.0

def imd_get(path, params=None):
    """Call an official IMD API route; credentials stay on the backend."""
    if not IMD_API_TOKEN:
        raise RuntimeError("IMD API credentials are not configured. Set IMD_API_TOKEN after registering with the IMD API portal.")
    url = IMD_BASE + path + (("?" + urlencode(params)) if params else "")
    request = Request(url, headers={"Authorization": "Bearer " + IMD_API_TOKEN, "Accept": "application/json", "User-Agent": "KrishiRakshak/1.0 (SIH 26131 demo)"})
    with urlopen(request, timeout=12) as response:
        return json.loads(response.read().decode("utf-8"))

def record_list(value):
    if isinstance(value, list): return value
    if isinstance(value, dict):
        for key in ("data", "Data", "records", "result"):
            if isinstance(value.get(key), list): return value[key]
        return [value]
    return []

# Small, transparent demo catalog. Replace with verified state/ICAR label data
# before any real farmer deployment. A QR code identifies a product; it does
# not prove that the pack is genuine or that the product is suitable.
PRODUCTS = {
    "KISAN-001": {"name":"Neem-based botanical (demo)","active":"Azadirachtin / neem extract","target":"General sucking-pest suppression; confirm crop and registered label","expiry":"2027-06-30","dose":"Follow the exact registered product label; no dose is prescribed by this demo","safety":"Wear label-specified PPE. Observe re-entry, pre-harvest interval and pollinator precautions.","alternatives":["Remove heavily infested leaves where practical","Use yellow/blue sticky traps as appropriate","Encourage natural enemies; ask a local extension officer"]},
    "DEMO-QR-01": {"name":"Demo copper fungicide label","active":"Copper-based fungicide (example only)","target":"Some fungal/bacterial crop diseases, subject to crop-specific registration","expiry":"2026-12-31","dose":"Check current package label and state recommendation; dose intentionally omitted","safety":"Do not mix products unless the label allows it. Use PPE and follow waiting periods.","alternatives":["Improve spacing and drainage","Remove infected debris safely","Use clean seed and crop rotation where suitable"]},
    "DEMO-EXPIRED": {"name":"Expired demo product","active":"Demo record","target":"Not for use","expiry":"2024-01-01","dose":"Do not use","safety":"Do not apply. Ask the seller or local agriculture office about safe disposal.","alternatives":["Seek an extension officer's diagnosis before treatment"]}
}

# QR demo cards encode only their short ID. The API expands each ID into a
# pest-specific scouting card. These are educational examples, not diagnoses.
PEST_CARDS = {
    "PEST-COTTON-01": {"isPestCard":True,"name":"Pink bollworm — cotton","crop":"Cotton","pest":"Pink bollworm","scientific":"Pectinophora gossypiella","signs":"Rosette flowers, boll entry holes or frass; larvae may remain concealed inside bolls.","monitor":"Inspect flowers and green bolls regularly during flowering and boll formation. Pheromone traps are for monitoring; interpret catches with local extension guidance.","dose":"No pesticide dose is provided. Confirm the pest and use only a currently registered cotton label if treatment is needed.","safety":"This is an educational pest card, not product authentication or a confirmed diagnosis.","alternatives":["Remove and safely destroy infested rosette flowers and bolls where practical.","Use pheromone-based monitoring and conserve beneficial insects.","After harvest, manage crop residues and volunteer cotton as advised locally."]},
    "PEST-MAIZE-01": {"isPestCard":True,"name":"Fall armyworm — maize","crop":"Maize","pest":"Fall armyworm","scientific":"Spodoptera frugiperda","signs":"Windowpane feeding on young leaves, ragged holes, and sawdust-like frass in the whorl.","monitor":"Check whorls on young plants and look for fresh feeding and frass. Similar damage can have other causes; confirm larvae before action.","dose":"No pesticide dose is provided. Confirm locally and follow only a currently registered maize label if treatment is needed.","safety":"This is an educational pest card, not product authentication or a confirmed diagnosis.","alternatives":["Hand-pick egg masses or small larvae where feasible.","Encourage natural enemies and avoid unnecessary broad-spectrum sprays.","Ask a local extension worker about biological options registered for your crop and area."]},
    "PEST-SOY-01": {"isPestCard":True,"name":"Stem fly — soybean","crop":"Soybean","pest":"Soybean stem fly","scientific":"Melanagromyza sojae","signs":"Seedlings may yellow or wilt; split stems can show tunnelling or galleries.","monitor":"Inspect wilted plants and split a few stems to check for galleries. Confirm the cause because water stress and other pests can look similar.","dose":"No pesticide dose is provided. Ask a local extension worker about current, crop-specific recommendations before treatment.","safety":"This is an educational pest card, not product authentication or a confirmed diagnosis.","alternatives":["Remove and safely destroy badly affected plants where practical.","Use timely sowing and crop rotation as locally recommended.","Scout field edges and young plants regularly; keep records of affected patches."]},
    "PEST-APHID-01": {"isPestCard":True,"name":"Aphids — cotton","crop":"Cotton","pest":"Cotton aphid","scientific":"Aphis gossypii","signs":"Clusters of small soft-bodied insects under leaves, sticky honeydew, or curled young growth.","monitor":"Check the undersides of young leaves and note whether ladybirds or other natural enemies are present.","dose":"No pesticide dose is provided. Avoid treatment based on QR alone; confirm infestation and check the registered crop label.","safety":"This is an educational pest card, not product authentication or a confirmed diagnosis.","alternatives":["Conserve ladybirds, lacewings and other beneficial insects.","Avoid excessive nitrogen that can encourage soft growth.","For small patches, consult local guidance on non-chemical control before spraying."]},
    "PEST-TOMATO-01": {"isPestCard":True,"name":"Fruit borer — tomato","crop":"Tomato","pest":"Tomato fruit borer","scientific":"Helicoverpa armigera","signs":"Round entry holes in fruit, frass near the hole, or damaged flowers and young fruit.","monitor":"Inspect flowers and fruit regularly. Pheromone traps can support monitoring; use local extension guidance to interpret catches.","dose":"No pesticide dose is provided. Confirm the pest and use only a currently registered tomato label if treatment is needed.","safety":"This is an educational pest card, not product authentication or a confirmed diagnosis.","alternatives":["Pick and destroy infested fruit and larvae where practical.","Use pheromone monitoring and conserve beneficial insects.","Ask a local extension worker about suitable biological or trap-crop options."]}
}

def json_bytes(value):
    return json.dumps(value, ensure_ascii=False).encode("utf-8")

class Handler(BaseHTTPRequestHandler):
    def send_json(self, data, status=200):
        body = json_bytes(data)
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()

    def do_GET(self):
        global GEOCODE_LAST_REQUEST
        path = urlparse(self.path).path
        if path == "/api/health":
            return self.send_json({"ok": True, "service": "KrishiRakshak demo API"})
        if path.startswith("/api/product/"):
            code = path.rsplit("/", 1)[-1].upper()
            item = PEST_CARDS.get(code) or PRODUCTS.get(code)
            return self.send_json(item or {"error":"Product code not found in the demo catalog","code":code}, 200 if item else 404)
        if path == "/api/weather":
            query = parse_qs(urlparse(self.path).query)
            try:
                lat, lon = float(query.get("lat", ["21.1458"])[0]), float(query.get("lon", ["79.0882"])[0])
                if not (-90 <= lat <= 90 and -180 <= lon <= 180): raise ValueError()
                if not IMD_API_TOKEN:
                    return self.send_json({"source":"IMD unavailable","error":"IMD weather needs an API token. See README setup step 6."},503)
                def coords(row):
                    return float(row.get("Latitude", row.get("latitude"))), float(row.get("Longitude", row.get("longitude")))
                value = lambda row, *keys: next((row.get(key) for key in keys if row.get(key) not in (None, "", "NA", "-")), None)
                # AWS/ARG mapping gives a station close to the farm; request its latest observation first.
                aws_error = None
                try:
                    aws_mapping = record_list(imd_get("/aws_data_mapping"))
                    aws_candidates = []
                    for row in aws_mapping:
                        try:
                            slat, slon = coords(row)
                            aws_candidates.append(((slat-lat)**2 + (slon-lon)**2, row))
                        except (TypeError, ValueError): continue
                    if aws_candidates:
                        _, aws_station = min(aws_candidates, key=lambda item:item[0])
                        call_sign = aws_station.get("CALL_SIGN", aws_station.get("Call_Sign", aws_station.get("id")))
                        rows = record_list(imd_get("/aws_data", {"id":call_sign}))
                        observed = next((row for row in rows if str(row.get("CALL_SIGN", "")).casefold() == str(call_sign).casefold()), rows[0] if rows else {})
                        if observed:
                            return self.send_json({"source":"IMD AWS/ARG","station":observed.get("STATION", aws_station.get("STATION", "nearest AWS/ARG station")),
                                "temperature":value(observed,"CURR_TEMP"),"humidity":value(observed,"RH"),"rainMm":value(observed,"RAIN","RAINFALL","RAIN_24H"),"windKph":value(observed,"WIND_SPEED"),
                                "forecast":None,"observedAt":(str(observed.get("DATE", ""))+" "+str(observed.get("TIME", ""))).strip() or None,"timeZone":"IST","location":{"lat":lat,"lon":lon}})
                except Exception as exc: aws_error = exc
                # If no AWS observation is available, use IMD's nearest mapped city forecast.
                mapping = record_list(imd_get("/cityforecast_mapping"))
                candidates = []
                for row in mapping:
                    try:
                        slat, slon = coords(row)
                        candidates.append(((slat-lat)**2 + (slon-lon)**2, row))
                    except (TypeError, ValueError): continue
                if not candidates: raise RuntimeError("IMD has no mapped station for this location.") from aws_error
                _, station = min(candidates, key=lambda item:item[0])
                station_id = station.get("Station_Code", station.get("id", station.get("ID")))
                forecasts = record_list(imd_get("/cityforecastloc", {"id": station_id}))
                forecast = forecasts[0] if forecasts else {}
                if not forecast: raise RuntimeError("IMD returned no forecast for the nearest station.")
                return self.send_json({"source":"IMD city forecast","station":station.get("Station_Name", "nearest mapped station"),
                    "temperature":value(forecast,"Todays_Forecast_Max_Temp","Today_Max_temp"),"humidity":value(forecast,"Relative_Humidity_at_0830","Relative_Humidity_at_1730"),
                    "rainMm":value(forecast,"Past_24_hrs_Rainfall"),"windKph":None,"forecast":value(forecast,"Todays_Forecast"),
                    "forecastDate":forecast.get("Date"),"location":{"lat":lat,"lon":lon}})
            except Exception as exc:
                status = 503 if "credentials" in str(exc).lower() or "401" in str(exc) else 502
                return self.send_json({"source":"IMD unavailable","error":str(exc),"location":{"lat":lat,"lon":lon}}, status)
        if path == "/api/reverse-geocode":
            query = parse_qs(urlparse(self.path).query)
            try:
                lat, lon = float(query["lat"][0]), float(query["lon"][0])
                if not (-90 <= lat <= 90 and -180 <= lon <= 180): raise ValueError()
                cache_key = (round(lat, 3), round(lon, 3))
                cached = GEOCODE_CACHE.get(cache_key)
                if cached: return self.send_json(cached)
                # Nominatim's public policy permits at most one request per second
                # per app. Cache rounded coordinates to reduce repeated lookups.
                with GEOCODE_LOCK:
                    cached = GEOCODE_CACHE.get(cache_key)
                    if cached: return self.send_json(cached)
                    delay = 1.0 - (time.monotonic() - GEOCODE_LAST_REQUEST)
                    if delay > 0: time.sleep(delay)
                    GEOCODE_LAST_REQUEST = time.monotonic()
                    url = "https://nominatim.openstreetmap.org/reverse?" + urlencode({"lat":lat,"lon":lon,"format":"jsonv2","zoom":10,"addressdetails":1})
                    request = Request(url, headers={"User-Agent":"KrishiRakshak/1.0 (SIH 26131 demo)","Accept-Language":"en"})
                    with urlopen(request,timeout=10) as response: raw=json.loads(response.read().decode("utf-8"))
                    address=raw.get("address",{})
                    locality=address.get("city") or address.get("town") or address.get("village") or address.get("county") or address.get("state_district")
                    state=address.get("state")
                    country=address.get("country")
                    parts=[part for part in (locality,state,country) if part]
                    result = {"place":", ".join(dict.fromkeys(parts)) or raw.get("display_name", "Farm location"),"attribution":"© OpenStreetMap contributors"}
                    GEOCODE_CACHE[cache_key] = result
                    return self.send_json(result)
            except Exception as exc: return self.send_json({"error":"Could not resolve farm place","detail":str(exc)},502)
        # Serve the frontend from the same origin so the demo starts with one command.
        file = ROOT / ("index.html" if path == "/" else path.lstrip("/"))
        if file.exists() and file.is_file() and ROOT in file.resolve().parents:
            content_type = {".html":"text/html; charset=utf-8", ".css":"text/css; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".png":"image/png"}.get(file.suffix, "application/octet-stream")
            body = file.read_bytes(); self.send_response(200); self.send_header("Content-Type", content_type); self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body); return
        self.send_json({"error":"Not found"}, 404)

    def do_POST(self):
        if urlparse(self.path).path != "/api/diagnose": return self.send_json({"error":"Not found"}, 404)
        try:
            data = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))))
            symptoms = set(data.get("symptoms", [])); crop = data.get("crop", "crop")
            humidity = float(data.get("weather", {}).get("humidity", 0) or 0)
            rain = float(data.get("weather", {}).get("rainChance", 0) or 0)
            # Explainable symptom + weather triage rules; this is not image AI.
            if "white-powder" in symptoms:
                condition, confidence, why = "Possible powdery mildew", "moderate", "White powder-like patches were selected."
                actions = ["Check several leaves on different plants; look for powdery patches.","Improve airflow and avoid unnecessary overhead irrigation.","If spreading, ask an extension officer to confirm before selecting a registered treatment."]
            elif "yellow-holes" in symptoms:
                condition, confidence, why = "Possible leaf-feeding pest damage", "low to moderate", "Yellowing and holes can have several causes; inspect leaf undersides and nearby plants."
                actions = ["Inspect the crop and count affected plants before acting.","Remove isolated larvae/affected leaves if practical.","Use traps or a locally recommended biological option; seek confirmation if damage is increasing."]
            elif "brown-spots" in symptoms:
                condition, confidence, why = "Possible leaf spot / stress", "low to moderate", "Brown spots are nonspecific and may be disease, nutrient, water or chemical stress."
                actions = ["Photograph both leaf surfaces and compare healthy and affected plants.","Avoid moving wet foliage between plants; remove debris where appropriate.","Get expert confirmation before applying a pesticide."]
            else:
                condition, confidence, why = "No clear symptom match", "low", "The selected signs do not identify a specific condition."
                actions = ["Continue scouting and upload a sharp close-up of both leaf surfaces.","Record crop stage and when symptoms began.","Contact a local agriculture extension worker if symptoms spread."]
            weather_flags = []
            if humidity >= 75 or rain >= 60: weather_flags.append("Humid / wet conditions can favor some leaf diseases; inspect the crop more often.")
            if rain >= 70: weather_flags.append("Rain is forecast; avoid spraying immediately before rainfall and follow product-label weather restrictions.")
            return self.send_json({"crop":crop,"finding":condition,"confidence":confidence,"reason":why,"weatherFlags":weather_flags,"actions":actions,"disclaimer":"Early triage only. The uploaded image is not analyzed by a trained model in this prototype. Confirm diagnosis and any treatment with a qualified local expert and the registered product label."})
        except Exception as exc:
            return self.send_json({"error":"Invalid request","detail":str(exc)}, 400)

if __name__ == "__main__":
    print(f"KrishiRakshak running at http://{HOST}:{PORT}")
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
