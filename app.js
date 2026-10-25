// Browser-side behavior: location, image preview, QR scanning and API requests.
const $ = (selector) => document.querySelector(selector);
const toast = (message) => { const el = $('#toast'); el.textContent = message; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 2600); };
// Local demos use a dedicated Python API port so an old backend or Live Server
// cannot silently answer API calls with stale HTML/sample data.
const API_BASE = location.protocol === 'file:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1'
  ? 'http://127.0.0.1:8001' : '';
const apiFetch = (path, options) => fetch(`${API_BASE}${path}`, options);
async function readApiJson(response) {
  const text = await response.text();
  if (!response.headers.get('content-type')?.includes('application/json') || /^\s*<!doctype|^\s*<html/i.test(text)) {
    throw new Error(T('Backend API is not responding. Open this project in VS Code and run python server.py, then reload this page.'));
  }
  try { return JSON.parse(text); } catch (_) { throw new Error(T('The backend returned invalid JSON. Restart it with python server.py.')); }
}
const apiStatus = $('#api-status');
let weather = { humidity: 0, rainChance: 0 }, stream = null, scanTimer = null, cropStream = null, cropPhotoUrl = null;

$('#today').textContent = new Intl.DateTimeFormat('en-IN', {weekday:'short',day:'numeric',month:'short'}).format(new Date());
applyLanguage();
apiFetch('/api/health').then(readApiJson).then(() => { apiStatus.textContent = T('Services ready'); }).catch(() => { apiStatus.textContent = T('Start the Python backend'); });

async function loadWeather(lat, lon, place) {
  window.currentFarmPlace = place;
  $('#weather-place').firstChild.textContent = `${T('Your farm is in')} ${T(place)} `;
  try {
    const response = await apiFetch(`/api/weather?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`);
    const data = await readApiJson(response);
    if (!response.ok) throw new Error(data.error || T('IMD weather is not configured.'));
    weather = { humidity: Number(data.humidity) || 0, rainChance: 0 };
    $('#temperature').textContent = data.temperature == null ? '—' : `${Math.round(Number(data.temperature))}°`;
    $('#humidity').textContent = data.humidity == null ? '—' : `${data.humidity}%`;
    $('#rain').textContent = data.rainMm == null ? '—' : `${data.rainMm} mm`;
    $('#wind').textContent = data.windKph == null ? '—' : `${data.windKph} km/h`;
    $('#weather-condition').textContent = data.forecast || T('IMD station observation');
    let observedAt = '';
    if (data.observedAt) {
      if (data.timeZone === 'IST') observedAt = ` · ${data.observedAt} IST`;
      else {
        const timestamp = new Date(`${data.observedAt.replace(' ', 'T')}Z`);
        observedAt = ` · ${timestamp.toLocaleString(language === 'hi' ? 'hi-IN' : 'en-IN', {timeZone:'Asia/Kolkata', dateStyle:'short', timeStyle:'short'})} IST`;
      }
    }
    const forecastDay = !observedAt && data.forecastDate ? ` · ${T('Forecast date')} ${data.forecastDate}` : '';
    $('#weather-source').textContent = `${data.source || T('IMD')} · ${data.station || 'nearest mapped station'}${observedAt}${forecastDay} · © OpenStreetMap contributors`;
    $('#weather-tip').textContent = T(weather.humidity >= 75
      ? 'Humid conditions can favor some leaf diseases. Scout susceptible crops today.'
      : 'Check the IMD forecast and keep a regular crop scouting routine.');
  } catch (error) {
    $('#temperature').textContent = '—'; $('#humidity').textContent = '—'; $('#rain').textContent = '—'; $('#wind').textContent = '—';
    $('#weather-source').textContent = T('IMD data unavailable');
    $('#weather-tip').textContent = error.message || T('Could not load IMD weather.');
  }
}
$('#locate').addEventListener('click', () => {
  if (!navigator.geolocation) return toast(T('Location is not available in this browser.'));
  $('#locate span').textContent = T('Finding location…');
  navigator.geolocation.getCurrentPosition(async ({coords}) => {
    try {
      const response = await apiFetch(`/api/reverse-geocode?lat=${encodeURIComponent(coords.latitude)}&lon=${encodeURIComponent(coords.longitude)}`);
      const result = await response.json();
      const place = result.place || 'Your farm location';
      await loadWeather(coords.latitude, coords.longitude, place);
      $('#locate span').textContent = T('Refresh farm weather');
    } catch (_) {
      await loadWeather(coords.latitude, coords.longitude, T('Farm location (place name unavailable)'));
      $('#locate span').textContent = T('Refresh farm weather');
    }
  }, () => { $('#locate span').textContent = T('Know farm weather'); toast(T('Location permission was not granted.')); }, {timeout:12000,maximumAge:300000});
});

// Crop photos from upload or camera are previewed locally and are not sent to the API.
function showCropPhoto(file) {
  if (cropPhotoUrl) URL.revokeObjectURL(cropPhotoUrl);
  cropPhotoUrl = URL.createObjectURL(file);
  $('#preview').src = cropPhotoUrl; $('#preview').hidden = false;
  $('#photo-placeholder').hidden = true;
  const box = $('#diagnosis-result'); box.hidden = false;
  box.innerHTML = `<span class="warning-pill">${T('Photo received')}</span><h4>${escapeHtml(file.name)}</h4><p>${T('The image is shown for inspection, but this demo does not identify disease from photo pixels. Select the visible symptoms and press Check crop health for safe early-triage guidance.')}</p>`;
}
$('#photo-input').addEventListener('change', event => {
  const file = event.target.files?.[0]; if (!file) return;
  showCropPhoto(file);
  event.target.value = '';
});

function stopCropCamera() {
  cropStream?.getTracks().forEach(track => track.stop());
  cropStream = null;
  $('#photo-camera').srcObject = null;
  $('#crop-camera-panel').hidden = true;
  $('#open-photo-camera').hidden = false;
}
$('#open-photo-camera').addEventListener('click', async () => {
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error(T('Camera access is unavailable. Open this site using its HTTPS link.'));
    cropStream = await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
    const video = $('#photo-camera');
    video.srcObject = cropStream;
    $('#crop-camera-panel').hidden = false;
    $('#open-photo-camera').hidden = true;
    await video.play();
  } catch (error) {
    stopCropCamera();
    toast(error.message || T('Could not open camera. Check browser permission.'));
  }
});
$('#capture-photo').addEventListener('click', () => {
  const video = $('#photo-camera');
  if (!video.videoWidth) return toast(T('Camera is still starting. Try again in a moment.'));
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth; canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
  canvas.toBlob(blob => {
    if (!blob) return toast(T('Could not capture the photo. Try again.'));
    showCropPhoto(new File([blob], `crop-photo-${Date.now()}.jpg`, {type:'image/jpeg'}));
    stopCropCamera();
  }, 'image/jpeg', 0.92);
});
$('#cancel-photo-camera').addEventListener('click', stopCropCamera);

$('#analyze').addEventListener('click', async () => {
  const symptoms = [...document.querySelectorAll('.symptom-list input:checked')].map(input => input.value);
  $('#analyze').disabled = true; $('#analyze').textContent = T('Checking…');
  let result, localOnly = false;
  try {
    const response = await apiFetch('/api/diagnose', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({crop:$('#crop').value,stage:$('#stage').value,symptoms,weather})});
    result = await readApiJson(response); if (!response.ok) throw new Error(result.error);
  } catch (_) {
    result = localCropGuidance(symptoms, $('#crop').value); localOnly = true;
  }
  try {
    const box = $('#diagnosis-result'); box.hidden = false;
    box.innerHTML = `${localOnly ? `<span class="warning-pill">${T('Offline demo guidance')}</span>` : ''}<span class="warning-pill">${escapeHtml(result.confidence)} confidence · early triage</span><h4>${escapeHtml(result.finding)}</h4><p>${escapeHtml(result.reason)}</p>${result.weatherFlags.length ? `<p><b>Weather context:</b> ${result.weatherFlags.map(escapeHtml).join(' ')}</p>` : ''}<ul>${result.actions.map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ul><small>${escapeHtml(result.disclaimer)}</small>`;
    applyLanguage();
  } catch (error) { toast(`${T('Could not check crop:')} ${error.message}`); }
  finally { $('#analyze').disabled = false; $('#analyze').innerHTML = `${T('Check crop health')} <span>→</span>`; }
});

function localCropGuidance(symptoms, crop) {
  let finding='No clear symptom match', confidence='low', reason=`No symptom was selected for this ${crop} photo. This prototype cannot identify a disease from image pixels.`, actions=['Select the visible sign(s) above and choose Check crop health for symptom-based guidance.','Check both leaf surfaces and compare affected plants with healthy plants.','Ask a local agriculture extension worker to confirm a diagnosis.'];
  if (symptoms.includes('white-powder')) { finding='Possible powdery mildew'; confidence='moderate'; reason='White powder-like patches were selected; other causes can look similar.'; actions=['Check several leaves on different plants for spreading powdery patches.','Improve airflow and avoid unnecessary overhead irrigation.','If spreading, ask an extension officer to confirm before selecting a registered treatment.']; }
  else if (symptoms.includes('yellow-holes')) { finding='Possible leaf-feeding pest damage'; confidence='low to moderate'; reason='Yellowing or holes were selected; insects, disease and other stress can look similar.'; actions=['Inspect leaf undersides and nearby plants for insects or larvae.','Remove isolated larvae or affected leaves if practical.','Seek local confirmation if damage is increasing.']; }
  else if (symptoms.includes('brown-spots')) { finding='Possible leaf spot / crop stress'; confidence='low to moderate'; reason='Brown or yellow spots have several possible causes, including disease, nutrients, water or chemical stress.'; actions=['Check both leaf surfaces and photograph several affected plants.','Avoid moving wet foliage between plants; remove debris where appropriate.','Get expert confirmation before applying a pesticide.']; }
  return {finding,confidence,reason,weatherFlags:[],actions,disclaimer:'Photo preview only: no trained image model analyzes this image. This is early triage, not a confirmed diagnosis. Confirm any treatment with a qualified local expert and registered product label.'};
}

function escapeHtml(value) { return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
const LOCAL_PEST_CARDS = {
  'PEST-COTTON-01':{name:'Pink bollworm — cotton',crop:'Cotton',pest:'Pink bollworm',scientific:'Pectinophora gossypiella',signs:'Rosette flowers, boll entry holes or frass; larvae may hide inside bolls.',monitor:'Inspect flowers and green bolls regularly during flowering. Pheromone traps help monitor; ask local extension staff how to interpret catches.',dose:'No pesticide dose is provided. Confirm the pest and follow only a currently registered cotton product label.',alternatives:['Remove and safely destroy infested flowers and bolls where practical.','Use pheromone monitoring and conserve beneficial insects.','Manage crop residues after harvest as locally advised.']},
  'PEST-MAIZE-01':{name:'Fall armyworm — maize',crop:'Maize',pest:'Fall armyworm',scientific:'Spodoptera frugiperda',signs:'Windowpane feeding, ragged holes and sawdust-like frass in the whorl.',monitor:'Check whorls on young plants for fresh feeding, frass and larvae. Confirm larvae before acting.',dose:'No pesticide dose is provided. Follow a currently registered maize product label only after local confirmation.',alternatives:['Hand-pick egg masses or small larvae where feasible.','Conserve natural enemies and avoid unnecessary broad-spectrum sprays.','Ask a local extension worker about registered biological options.']},
  'PEST-SOY-01':{name:'Stem fly — soybean',crop:'Soybean',pest:'Soybean stem fly',scientific:'Melanagromyza sojae',signs:'Seedlings may yellow or wilt; split stems can show tunnels or galleries.',monitor:'Inspect wilted plants and split a few stems. Water stress and other pests can look similar.',dose:'No pesticide dose is provided. Ask a local extension worker for current crop-specific advice.',alternatives:['Remove badly affected plants where practical.','Use locally recommended sowing times and crop rotation.','Scout young plants regularly and record affected patches.']},
  'PEST-APHID-01':{name:'Aphids — cotton',crop:'Cotton',pest:'Cotton aphid',scientific:'Aphis gossypii',signs:'Clusters of small soft-bodied insects under leaves, sticky honeydew or curled young growth.',monitor:'Check undersides of young leaves and note whether ladybirds or other natural enemies are present.',dose:'Do not treat based on QR alone. Confirm the infestation and check the registered crop label.',alternatives:['Conserve ladybirds, lacewings and other beneficial insects.','Avoid excessive nitrogen that encourages soft growth.','Ask local advisers about non-chemical control before spraying.']},
  'PEST-TOMATO-01':{name:'Fruit borer — tomato',crop:'Tomato',pest:'Tomato fruit borer',scientific:'Helicoverpa armigera',signs:'Round entry holes in fruit, frass near a hole, or damaged flowers and young fruit.',monitor:'Inspect flowers and fruit. Pheromone traps help monitoring; use local guidance to interpret catches.',dose:'No pesticide dose is provided. Confirm the pest and follow a currently registered tomato product label.',alternatives:['Pick and destroy infested fruit and larvae where practical.','Use pheromone monitoring and conserve beneficial insects.','Ask a local extension worker about biological or trap-crop options.']}
};
function showPestCard(target, p) {
  target.classList.remove('alert-expired');
  target.innerHTML = `<span class="warning-pill">${T('PEST ADVISORY · DEMO')}</span><h4>${escapeHtml(p.name)}</h4><p><b>${T('Crop:')}</b> ${escapeHtml(p.crop)}<br><b>${T('Pest:')}</b> ${escapeHtml(p.pest)} <i>${escapeHtml(p.scientific)}</i></p><p><b>${T('Common signs:')}</b> ${escapeHtml(p.signs)}</p><p><b>${T('Scout:')}</b> ${escapeHtml(p.monitor)}</p><p><b>${T('Safe-use note:')}</b> ${escapeHtml(p.dose)}</p><b>${T('Lower-chemical / preventive options')}</b><ul>${p.alternatives.map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ul><small>${T('This is an educational pest card, not product authentication or a confirmed diagnosis.')}</small>`;
  applyLanguage();
}
async function lookup(code) {
  const target = $('#product-result'); target.hidden = false; target.textContent = T('Looking up label record…');
  try {
    const response = await apiFetch(`/api/product/${encodeURIComponent(code.trim())}`); const p = await readApiJson(response);
    if (!response.ok) throw new Error(p.error);
    if (p.isPestCard) {
      showPestCard(target, p);
      return;
    }
    const expired = new Date(`${p.expiry}T23:59:59`) < new Date();
    target.classList.toggle('alert-expired', expired);
    target.innerHTML = `<span class="warning-pill">${expired ? 'EXPIRED · DO NOT USE' : 'DEMO CATALOG MATCH'}</span><h4>${escapeHtml(p.name)}</h4><p><b>Active ingredient:</b> ${escapeHtml(p.active)}<br><b>Listed target:</b> ${escapeHtml(p.target)}<br><b>Expiry:</b> ${escapeHtml(p.expiry)}<br><b>Use:</b> ${escapeHtml(p.dose)}<br><b>Safety:</b> ${escapeHtml(p.safety)}</p><b>Lower-chemical / preventive options</b><ul>${p.alternatives.map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ul><small>Demo lookup only. Read the original registered label; QR data alone cannot authenticate a product. Ask an agriculture expert to confirm crop, pest and treatment.</small>`;
    applyLanguage();
  } catch (error) {
    const localCard = LOCAL_PEST_CARDS[code.trim().toUpperCase()];
    if (localCard) return showPestCard(target, localCard);
    target.classList.add('alert-expired'); target.innerHTML = `<b>${T('No verified demo record found.')}</b><br>${escapeHtml(error.message)}. ${T('Check the printed label and consult an extension officer.')}`; applyLanguage();
  }
}
$('#lookup').addEventListener('click', () => lookup($('#qr-code').value));
$('#qr-code').addEventListener('keydown', event => { if (event.key === 'Enter') lookup($('#qr-code').value); });
document.querySelectorAll('.demo-codes button').forEach(button => button.addEventListener('click', () => { $('#qr-code').value = button.dataset.code; lookup(button.dataset.code); }));

const qrCanvas = document.createElement('canvas');
const qrContext = qrCanvas.getContext('2d', {willReadFrequently:true});
function decodeQrFrame(source, width, height) {
  if (!window.jsQR || !qrContext || !width || !height) return '';
  // Downscale large camera frames to keep scanning responsive on phones.
  const scale = Math.min(1, 960 / width);
  qrCanvas.width = Math.max(1, Math.round(width * scale));
  qrCanvas.height = Math.max(1, Math.round(height * scale));
  qrContext.drawImage(source, 0, 0, qrCanvas.width, qrCanvas.height);
  const pixels = qrContext.getImageData(0, 0, qrCanvas.width, qrCanvas.height);
  return window.jsQR(pixels.data, pixels.width, pixels.height, {inversionAttempts:'attemptBoth'})?.data || '';
}

async function readQr(bitmap) {
  if (!window.jsQR) throw new Error(T('QR decoder could not load. Refresh the page and try again.'));
  const value = decodeQrFrame(bitmap, bitmap.width, bitmap.height);
  if (!value) throw new Error(T('No QR code found. Try a clearer photo or enter the printed code.'));
  $('#qr-code').value = value; lookup(value);
}
$('#qr-input').addEventListener('change', async event => {
  if (!event.target.files?.[0]) return;
  try { await readQr(await createImageBitmap(event.target.files[0])); } catch (error) { toast(error.message); }
});

$('#start-camera').addEventListener('click', async () => {
  try {
    if (!window.jsQR) throw new Error(T('QR decoder could not load. Refresh the page and try again.'));
    if (!navigator.mediaDevices?.getUserMedia) throw new Error(T('Camera access is unavailable. Open this site using its HTTPS link.'));
    stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
    const video = $('#camera'); video.srcObject = stream; video.hidden = false; $('#scan-art').hidden = true;
    $('#start-camera').hidden = true; $('#stop-camera').hidden = false; await video.play();
    let scanning = false;
    scanTimer = setInterval(() => {
      if (scanning || video.readyState < 2 || !video.videoWidth) return;
      scanning = true;
      try {
        const value = decodeQrFrame(video, video.videoWidth, video.videoHeight);
        if (value) { $('#qr-code').value = value; stopCamera(); lookup(value); }
      } catch (_) { /* Wait for the next camera frame; keep the scan UI open. */ }
      finally { scanning = false; }
    }, 250);
  } catch (error) { toast(error.message || T('Could not open camera. Check browser permission.')); }
});
function stopCamera() { if (scanTimer) clearInterval(scanTimer); scanTimer = null; stream?.getTracks().forEach(track=>track.stop()); stream = null; $('#camera').srcObject = null; $('#camera').hidden = true; $('#scan-art').hidden = false; $('#start-camera').hidden = false; $('#stop-camera').hidden = true; }
$('#stop-camera').addEventListener('click', stopCamera);

$('#show-guide').addEventListener('click', () => { document.querySelector('.explain').open = true; document.querySelector('.explain').scrollIntoView({behavior:'smooth'}); });
$('#copy-note').addEventListener('click', async () => {
  const symptoms = [...document.querySelectorAll('.symptom-list input:checked')].map(x=>x.parentElement.innerText).join(', ') || T('not recorded');
  const note = language === 'hi'
    ? `खेत की जानकारी\nफसल: ${T($('#crop').value)}\nअवस्था: ${T($('#stage').value)}\nतारीख: ${new Date().toLocaleDateString('hi-IN')}\nलक्षण: ${symptoms}\nमौसम: ${weather.humidity}% नमी, ${weather.rainChance}% बारिश की संभावना\nफोटो: अलग से जोड़ें\nकृपया कारण और उचित कदम की पुष्टि करें।`
    : `Farm field note\nCrop: ${$('#crop').value}\nStage: ${$('#stage').value}\nDate: ${new Date().toLocaleDateString('en-IN')}\nSymptoms: ${symptoms}\nWeather: ${weather.humidity}% humidity, ${weather.rainChance}% rain chance\nPhoto: attach separately\nPlease confirm the cause and suitable action.`;
  try { await navigator.clipboard.writeText(note); toast(T('Field note copied. Attach your crop photo before sharing.')); } catch (_) { toast(note); }
});
