const video = document.getElementById('video');
const startBtn = document.getElementById('startBtn');
const scanBtn = document.getElementById('scanBtn');
const autoScan = document.getElementById('autoScan');
const intervalSelect = document.getElementById('intervalSelect');
const statusEl = document.getElementById('status');
const capture = document.getElementById('capture');
const lastPlate = document.getElementById('lastPlate');
const lastMeta = document.getElementById('lastMeta');
const gpsText = document.getElementById('gpsText');
const countText = document.getElementById('countText');
const recordsEl = document.getElementById('records');
const exportBtn = document.getElementById('exportBtn');
const clearBtn = document.getElementById('clearBtn');

let stream = null;
let worker = null;
let scanning = false;
let timer = null;
let latestLocation = null;
let records = JSON.parse(localStorage.getItem('plateRecords') || '[]');
const recent = new Map();

function setStatus(s) { statusEl.textContent = s; }
function saveRecords() { localStorage.setItem('plateRecords', JSON.stringify(records)); renderRecords(); }
function nowParts() {
  const d = new Date();
  const date = new Intl.DateTimeFormat('tr-TR', { year:'numeric', month:'2-digit', day:'2-digit' }).format(d);
  const time = new Intl.DateTimeFormat('tr-TR', { hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false }).format(d);
  return { iso: d.toISOString(), date, time };
}

function normalizeTRPlate(raw) {
  let s = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  // OCR sık karışan karakterleri sadece sayı/harf bölgesine göre düzeltmeye çalış.
  const candidates = [];
  for (let codeLen=2; codeLen<=2; codeLen++) {
    for (let letterLen=1; letterLen<=3; letterLen++) {
      const numLen = s.length - codeLen - letterLen;
      if (numLen < 2 || numLen > 4) continue;
      let c = s.slice(0,2), l = s.slice(2,2+letterLen), n = s.slice(2+letterLen);
      c = c.replace(/[OI]/g, m => m==='O' ? '0' : '1');
      n = n.replace(/[O]/g,'0').replace(/[I]/g,'1').replace(/[S]/g,'5').replace(/[B]/g,'8');
      l = l.replace(/[0185]/g, m => ({'0':'O','1':'I','8':'B','5':'S'})[m]);
      if (!/^\d{2}$/.test(c) || !/^[A-Z]{1,3}$/.test(l) || !/^\d{2,4}$/.test(n)) continue;
      const city = Number(c);
      if (city < 1 || city > 81) continue;
      candidates.push(`${c} ${l} ${n}`);
    }
  }
  return candidates[0] || null;
}

function extractPlate(text) {
  const chunks = text.toUpperCase().split(/\s+/).filter(Boolean);
  const variants = [];
  variants.push(text);
  for (let i=0;i<chunks.length;i++) {
    variants.push(chunks[i]);
    variants.push(chunks.slice(i, i+2).join(''));
    variants.push(chunks.slice(i, i+3).join(''));
  }
  for (const v of variants) {
    const plate = normalizeTRPlate(v);
    if (plate) return plate;
  }
  return null;
}

async function ensureWorker() {
  if (worker) return;
  setStatus('OCR hazırlanıyor…');
  worker = await Tesseract.createWorker('eng', 1, {
    logger: m => {
      if (m.status === 'recognizing text') setStatus(`OCR %${Math.round((m.progress || 0)*100)}`);
    }
  });
  await worker.setParameters({
    tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ',
    preserve_interword_spaces: '1'
  });
  setStatus('OCR hazır');
}

async function startCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 30, max: 60 }
      },
      audio: false
    });
    video.srcObject = stream;
    await video.play();
    startBtn.textContent = 'Kamera Açık';
    startBtn.disabled = true;
    setStatus('Kamera hazır');
    await ensureWorker();
    scheduleAutoScan();
  } catch (e) {
    console.error(e);
    setStatus('Kamera açılamadı');
    alert('Kamera izni gerekli. Safari ayarlarından kamera erişimine izin verin.');
  }
}

function getRoiPixels() {
  // HTML ROI: left 8%, right 8%, top 29%, bottom 24%
  const vw = video.videoWidth, vh = video.videoHeight;
  return { x: Math.round(vw*0.08), y: Math.round(vh*0.29), w: Math.round(vw*0.84), h: Math.round(vh*0.47) };
}

async function scanFrame() {
  if (!stream || scanning || !worker || video.readyState < 2) return;
  scanning = true;
  try {
    const r = getRoiPixels();
    const maxW = 1600;
    const scale = Math.min(1, maxW / r.w);
    capture.width = Math.round(r.w * scale);
    capture.height = Math.round(r.h * scale);
    const ctx = capture.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(video, r.x, r.y, r.w, r.h, 0, 0, capture.width, capture.height);

    // Basit kontrast artırma.
    const img = ctx.getImageData(0,0,capture.width,capture.height);
    const d = img.data;
    for (let i=0;i<d.length;i+=4) {
      const y = 0.299*d[i] + 0.587*d[i+1] + 0.114*d[i+2];
      const v = Math.max(0, Math.min(255, (y-128)*1.35+128));
      d[i]=d[i+1]=d[i+2]=v;
    }
    ctx.putImageData(img,0,0);

    setStatus('Plaka aranıyor…');
    const result = await worker.recognize(capture);
    const text = result.data.text || '';
    const plate = extractPlate(text);
    const confidence = Math.round(result.data.confidence || 0);

    if (plate) addRecord(plate, confidence);
    else setStatus('Plaka bulunamadı');
  } catch (e) {
    console.error(e);
    setStatus('Tarama hatası');
  } finally {
    scanning = false;
  }
}

function addRecord(plate, confidence) {
  const t = Date.now();
  const last = recent.get(plate) || 0;
  if (t - last < 30000) { setStatus(`${plate} tekrarlandı`); return; }
  recent.set(plate, t);

  const p = nowParts();
  const rec = {
    plate,
    confidence,
    date: p.date,
    time: p.time,
    iso: p.iso,
    lat: latestLocation?.coords?.latitude ?? null,
    lon: latestLocation?.coords?.longitude ?? null,
    accuracy: latestLocation?.coords?.accuracy ?? null
  };
  records.unshift(rec);
  records = records.slice(0, 1000);
  saveRecords();
  lastPlate.textContent = plate;
  lastMeta.textContent = `${p.date} ${p.time} • Güven %${confidence}`;
  setStatus(`Tespit: ${plate}`);
}

function renderRecords() {
  countText.textContent = records.length;
  if (!records.length) {
    recordsEl.innerHTML = '<div class="empty">Henüz plaka kaydı yok.</div>';
    return;
  }
  recordsEl.innerHTML = records.slice(0,50).map(r => `
    <div class="record">
      <div class="rp">${r.plate}</div>
      <div class="confidence">%${r.confidence}</div>
      <div class="rt">${r.date} ${r.time}</div>
      <div class="rl">${r.lat != null ? `${r.lat.toFixed(6)}, ${r.lon.toFixed(6)}` : 'GPS yok'}</div>
    </div>`).join('');
}

function scheduleAutoScan() {
  if (timer) clearTimeout(timer);
  const loop = async () => {
    if (autoScan.checked) await scanFrame();
    timer = setTimeout(loop, Number(intervalSelect.value));
  };
  timer = setTimeout(loop, 800);
}

function startGPS() {
  if (!navigator.geolocation) { gpsText.textContent = 'Desteklenmiyor'; return; }
  navigator.geolocation.watchPosition(pos => {
    latestLocation = pos;
    gpsText.textContent = `${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)} (±${Math.round(pos.coords.accuracy)} m)`;
  }, err => {
    gpsText.textContent = 'Konum izni yok';
    console.warn(err);
  }, { enableHighAccuracy:true, maximumAge:2000, timeout:10000 });
}

function exportCSV() {
  const header = ['Tarih','Saat','Plaka','Guven','Enlem','Boylam','Konum_Dogrulugu_m'];
  const rows = records.map(r => [r.date,r.time,r.plate,r.confidence,r.lat ?? '',r.lon ?? '',r.accuracy ?? '']);
  const csv = '\uFEFF' + [header, ...rows].map(row => row.map(v => `"${String(v).replaceAll('"','""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type:'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `plaka-kayitlari-${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

startBtn.addEventListener('click', startCamera);
scanBtn.addEventListener('click', scanFrame);
intervalSelect.addEventListener('change', scheduleAutoScan);
exportBtn.addEventListener('click', exportCSV);
clearBtn.addEventListener('click', () => {
  if (confirm('Tüm plaka kayıtları silinsin mi?')) {
    records = []; localStorage.removeItem('plateRecords'); renderRecords();
    lastPlate.textContent = '—'; lastMeta.textContent = 'Henüz kayıt yok';
  }
});

renderRecords();
startGPS();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(console.warn);
