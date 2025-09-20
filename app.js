/* ===========================================================
   Quran Anywhere — Flat Neon (3 files only)
   - Default Pashto + Dark
   - Reader: Surah/Juz, toggles PS/FA/EN, bookmarks, search
   - Audio: Play + Download (no delete), tabs AR/PS/FA
   - Fast downloads to IndexedDB when CORS allows
   - Graceful fallback to "Save file" link if CORS blocks
   - Playback fallback to .MP3 if .mp3 404s
   - Media Session for background play
   =========================================================== */

/* ---------- tiny DOM/utils ---------- */
const $  = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
function el(tag, cls, html){ const e=document.createElement(tag); if(cls)e.className=cls; if(html!=null)e.innerHTML=html; return e; }
function readJSON(k,f){ try{const v=localStorage.getItem(k);return v?JSON.parse(v):f}catch{return f} }
function write(k,v){ localStorage.setItem(k, typeof v==='string'?v:JSON.stringify(v)); }
function pad3(n){ return String(n).padStart(3,'0'); }
function pad4(n){ return String(n).padStart(4,'0'); }
const AR_DIAC=/[\u0610-\u061A\u064B-\u065F\u06D6-\u06ED\u0670\u0640]/g;
const cleanArabic=s=>(s||'').replace(AR_DIAC,'');

/* ---------- storage keys & state ---------- */
const K = {
  lang:'qa_lang', theme:'qa_theme', fzAr:'qa_font_ar', fzTr:'qa_font_tr',
  showPs:'qa_show_ps', showFa:'qa_show_fa', showEn:'qa_show_en',
  lastGlobal:'qa_last_global', lastAudio:'qa_last_audio',
  bookmarks:'qa_bookmarks', perSurah:'qa_per_surah'
};
const S = {
  uiLang: localStorage.getItem(K.lang) || 'ps',
  theme: 'dark',
  fzAr: +localStorage.getItem(K.fzAr) || 28,
  fzTr: +localStorage.getItem(K.fzTr) || 16,
  showPs: localStorage.getItem(K.showPs) !== '0',
  showFa: localStorage.getItem(K.showFa) !== '0',
  showEn: localStorage.getItem(K.showEn) !== '0',
  lastGlobal: readJSON(K.lastGlobal, null),
  lastAudio: readJSON(K.lastAudio, null),
  bookmarks: readJSON(K.bookmarks, []),
  perSurah: readJSON(K.perSurah, {}),
  SURAH_META: [], SURAH_MAP:new Map(), AYAH_INDEX:[], JUZ_FIRST:{}, JUZ_MAP:new Map()
};

/* ---------- theme/lang ---------- */
function applyTheme(){ document.documentElement.setAttribute('data-theme', S.theme); }
function applyFontVars(){ document.documentElement.style.setProperty('--fz-ar', S.fzAr+'px'); document.documentElement.style.setProperty('--fz-tr', S.fzTr+'px'); }
function applyLang(){ const rtl=(S.uiLang==='ps'||S.uiLang==='fa'); document.documentElement.dir=rtl?'rtl':'ltr'; document.documentElement.lang=S.uiLang; }

/* ===========================================================
   Load assets (JSON files from /assets)
   =========================================================== */
async function loadAssets(){
  const [a,b,c] = await Promise.all(['assets/surah_names.json','assets/pashto-farsi.json','assets/juznames.json'].map(p=>fetch(p)));
  if(!a.ok||!b.ok||!c.ok) throw new Error('Missing assets.');
  const [SURAH, PF, JUZ] = await Promise.all([a.json(), b.json(), c.json()]);
  S.SURAH_META = SURAH?.data || [];
  S.SURAH_MAP.clear(); (PF||[]).forEach(s=>S.SURAH_MAP.set(+s.number, s));
  S.AYAH_INDEX = [];
  (PF||[]).forEach(s=>{
    const sn=+s.number;
    (s.ayahs||[]).forEach(a=>{
      S.AYAH_INDEX.push({surah:sn, ayah:+a.numberInSurah, ar:a.arabic||'', arClean:cleanArabic(a.arabic||''), ps:a.pashto||'', fa:a.farsi||'', en:a.english||''});
    });
  });
  S.JUZ_FIRST={}; S.JUZ_MAP=new Map();
  (JUZ||[]).forEach(r=>{ if(!S.JUZ_FIRST[r.juz]) S.JUZ_FIRST[r.juz]={surah:r.surah_number, ayah:r.ayah_number}; S.JUZ_MAP.set(`${r.surah_number}:${r.ayah_number}`, r.juz); });
}
const juzOf=(s,a)=>S.JUZ_MAP.get(`${s}:${a}`)||'';

/* ===========================================================
   Views & navigation
   =========================================================== */
const V={landing:$('#view-landing'),home:$('#view-home'),reader:$('#view-reader'),audio:$('#view-audio'),bookmarks:$('#view-bookmarks')};
function showView(name){
  Object.values(V).forEach(v=>v?.classList.remove('visible'));
  V[name]?.classList.add('visible');
  $('#btnBack').hidden = (name==='landing');
  if(name==='audio'){ if(audioEl.src) $('#miniPlayer').classList.remove('is-hidden'); switchAudioTab(S.lastAudio?.tab||'arabic'); }
  else{ $('#miniPlayer').classList.add('is-hidden'); try{audioEl.pause()}catch{} }
  if(name==='reader') bindReaderScroll(); else unbindReaderScroll();
  if(name==='home') setHomeTab('surahs');
}
function bindLanding(){
  $('#openQuran')?.addEventListener('click',()=>{ renderHome(); showView('home'); });
  $('#openAudio')?.addEventListener('click',()=>{ renderAudioLists(); showView('audio'); });
}
$('#btnBack')?.addEventListener('click',()=>showView('landing'));

/* ===========================================================
   Home (Surahs/Juz)
   =========================================================== */
$('#homeTabs')?.addEventListener('click',e=>{ const t=e.target.closest('.tab'); if(t) setHomeTab(t.dataset.tab); });
function setHomeTab(key){
  $$('#homeTabs .tab').forEach(b=>b.classList.remove('active'));
  (key==='surahs'?$('#tabSurahs'):$('#tabJuz'))?.classList.add('active');
  $('#home-surahs')?.classList.toggle('is-hidden', key!=='surahs');
  $('#home-juz')?.classList.toggle('is-hidden', key!=='juz');
}
function renderHome(){ renderHomeSurahs(); renderHomeJuz(); }
function renderHomeSurahs(){
  const wrap=$('#home-surahs'); wrap.innerHTML='';
  S.SURAH_META.forEach(m=>{
    const total=+m.numberOfAyahs, last=S.perSurah[m.number]||0, pct=Math.round((last/total)*100)||0;
    const card=el('button','card surah-card',`
      <div class="line-1">
        <div class="badge">${pad3(m.number)}</div>
        <div><div class="surah-title">${m.englishName}</div><div class="subtle">${m.name} • ${m.revelationType} • ${total} ayahs</div></div>
      </div><div class="progress"><i style="width:${pct}%"></i></div>`);
    card.addEventListener('click',()=>openSurah(m.number,1));
    wrap.appendChild(card);
  });
}
function renderHomeJuz(){
  const wrap=$('#home-juz'); wrap.innerHTML='';
  for(let j=1;j<=30;j++){
    const first=S.JUZ_FIRST[j];
    const card=el('button','card surah-card',`
      <div class="line-1"><div class="badge">${String(j).padStart(2,'0')}</div>
      <div><div class="surah-title">Juz ${String(j).padStart(2,'0')}</div><div class="subtle">${first?`S${first.surah}: Ayah ${first.ayah}`:''}</div></div></div>`);
    card.addEventListener('click',()=>{ if(first) openSurah(first.surah,first.ayah); });
    wrap.appendChild(card);
  }
}

/* ===========================================================
   Reader
   =========================================================== */
function syncReaderChips(){ $('#tgPs')?.classList.toggle('active',!!S.showPs); $('#tgFa')?.classList.toggle('active',!!S.showFa); $('#tgEn')?.classList.toggle('active',!!S.showEn); }
function openSurah(sn, ay=1){
  const meta=S.SURAH_META.find(x=>+x.number===+sn), s=S.SURAH_MAP.get(+sn); if(!meta||!s) return alert('Missing data');
  $('#readerTitle').textContent=`${pad3(sn)} • ${meta.englishName} • ${meta.name}`;
  $('#readerSub').textContent=`${meta.revelationType} • ${meta.numberOfAyahs} ayahs`; syncReaderChips();
  const list=$('#ayahList'); list.innerHTML='';
  (s.ayahs||[]).forEach(a=>{
    const starOn=!!S.bookmarks.find(b=>b.s===sn&&b.a===a.numberInSurah);
    const row=el('div','ayah',`
      ${a.arabic?`<div class="ar">${a.arabic}</div>`:''}
      ${S.showPs&&a.pashto?`<div class="tr">${a.pashto}</div>`:''}
      ${S.showFa&&a.farsi?`<div class="tr">${a.farsi}</div>`:''}
      ${S.showEn&&a.english?`<div class="tr">${a.english}</div>`:''}
      <div class="meta"><small>${pad3(sn)} • ${meta.englishName} • ${meta.name} — Ayah ${a.numberInSurah}${juzOf(sn,a.numberInSurah)?` • Juz ${juzOf(sn,a.numberInSurah)}`:''}</small>
      <button class="star ${starOn?'active':''}" title="Bookmark">${starOn?'⭐':'☆'}</button></div>`);
    row.addEventListener('click',ev=>{ if(ev.target.closest('.star'))return; setProgress(sn,a.numberInSurah); });
    row.querySelector('.star').addEventListener('click',ev=>{ ev.stopPropagation(); toggleBookmark(sn,a.numberInSurah,a.arabic||''); ev.currentTarget.classList.toggle('active'); ev.currentTarget.textContent=ev.currentTarget.classList.contains('active')?'⭐':'☆'; });
    row.id=`a-${a.numberInSurah}`; list.appendChild(row);
  });
  showView('reader'); setTimeout(()=>document.getElementById(`a-${ay}`)?.scrollIntoView({behavior:'smooth',block:'center'}),60);
  S.lastGlobal={s:sn,a:ay}; write(K.lastGlobal,S.lastGlobal);
}
function setProgress(s,a){ S.perSurah[s]=a; write(K.perSurah,S.perSurah); S.lastGlobal={s,a}; write(K.lastGlobal,S.lastGlobal); }
let readerScroll={lastY:0,hidden:false};
function onReaderScroll(){ const y=scrollY, d=y-readerScroll.lastY, head=$('#readerHead'); if(Math.abs(d)<6){readerScroll.lastY=y;return;} if(y>80&&d>0&&!readerScroll.hidden){head.classList.add('hide');readerScroll.hidden=true;} else if(d<0&&readerScroll.hidden){head.classList.remove('hide');readerScroll.hidden=false;} readerScroll.lastY=y; }
function bindReaderScroll(){ readerScroll={lastY:scrollY,hidden:false}; addEventListener('scroll',onReaderScroll,{passive:true}); }
function unbindReaderScroll(){ removeEventListener('scroll',onReaderScroll); $('#readerHead')?.classList.remove('hide'); }
$('#tgPs')?.addEventListener('click',()=>{S.showPs=!S.showPs;write(K.showPs,S.showPs?1:0);syncReaderChips(); if(V.reader.classList.contains('visible')) openSurah(S.lastGlobal?.s||1,S.lastGlobal?.a||1); $('#chkPs').checked=S.showPs;});
$('#tgFa')?.addEventListener('click',()=>{S.showFa=!S.showFa;write(K.showFa,S.showFa?1:0);syncReaderChips(); if(V.reader.classList.contains('visible')) openSurah(S.lastGlobal?.s||1,S.lastGlobal?.a||1); $('#chkFa').checked=S.showFa;});
$('#tgEn')?.addEventListener('click',()=>{S.showEn=!S.showEn;write(K.showEn,S.showEn?1:0);syncReaderChips(); if(V.reader.classList.contains('visible')) openSurah(S.lastGlobal?.s||1,S.lastGlobal?.a||1); $('#chkEn').checked=S.showEn;});

/* ===========================================================
   Bookmarks & Search
   =========================================================== */
function toggleBookmark(s,a,ar){ const i=S.bookmarks.findIndex(b=>b.s===s&&b.a===a); if(i>=0)S.bookmarks.splice(i,1); else S.bookmarks.unshift({s,a,ts:Date.now(),ar}); write(K.bookmarks,S.bookmarks); if(V.bookmarks.classList.contains('visible')) renderBookmarks(); }
function renderBookmarks(){ const list=$('#bookmarkList'); list.innerHTML=''; if(!S.bookmarks.length){ list.appendChild(emptyCard('—')); return; } S.bookmarks.forEach(b=>{ const row=el('div','row',`<div><div><b>${pad3(b.s)} • Ayah ${b.a}</b></div><div class="muted">${cleanArabic(b.ar).slice(0,90)}…</div></div><div style="display:flex;gap:8px"><button class="pill" data-act="open">Open</button></div>`); row.querySelector('[data-act="open"]').addEventListener('click',()=>openSurah(b.s,b.a)); list.appendChild(row); }); }
$('#btnClearBookmarks')?.addEventListener('click',()=>{ if(confirm('Clear all bookmarks?')){ S.bookmarks=[]; write(K.bookmarks,S.bookmarks); renderBookmarks(); }});
$('#btnBookmarks')?.addEventListener('click',()=>{ renderBookmarks(); showView('bookmarks'); });

$('#btnSearch')?.addEventListener('click',()=>{ $('#searchDrawer').setAttribute('open','');$('#searchDrawer').setAttribute('aria-hidden','false'); $('#searchInput').value=''; $('#searchResults').innerHTML=''; $('#searchInput').focus(); });
$('#btnCloseSearch')?.addEventListener('click',()=>{ $('#searchDrawer').removeAttribute('open'); $('#searchDrawer').setAttribute('aria-hidden','true'); });
let tmr=null; $('#searchInput')?.addEventListener('input',e=>{ clearTimeout(tmr); const q=e.target.value.trim(); tmr=setTimeout(()=>runSearch(q),250); });
function runSearch(q){ const res=$('#searchResults'); res.innerHTML=''; if(!q) return; const qC=cleanArabic(q.toLowerCase()); const out=[]; for(const r of S.AYAH_INDEX){ const hay=[r.arClean.toLowerCase(),(r.ps||'').toLowerCase(),(r.fa||'').toLowerCase(),(r.en||'').toLowerCase()].join(' '); if(hay.includes(qC)){ out.push(r); if(out.length>=100) break; } } if(!out.length){ res.appendChild(emptyCard('No results')); return; } out.forEach(it=>{ const row=el('div','row',`<div><div><b>${pad3(it.surah)} • Ayah ${it.ayah}</b></div><div class="muted">${(it.ar||'').slice(0,90)}…</div></div><button class="pill">Open</button>`); row.querySelector('.pill').addEventListener('click',()=>{ $('#searchDrawer').removeAttribute('open'); $('#searchDrawer').setAttribute('aria-hidden','true'); openSurah(it.surah,it.ayah); }); res.appendChild(row); }); }

/* ===========================================================
   AUDIO: Internet Archive + IndexedDB downloads (with CORS fallback)
   =========================================================== */
const REMOTE_BASES = {
  arabic: 'https://archive.org/download/002_20250919',
  pashto: 'https://archive.org/download/002_20250919_202509',
  dari:   'https://archive.org/download/0001_20250919'
};

const audioEl=$('#miniAudio'); audioEl.preload='auto';
const ppIcon=$('#ppIcon'), selRate=$('#miniRate'), vol=$('#miniVol'), btnRepeat=$('#btnRepeat');

/* ---------- IndexedDB ---------- */
const DB_NAME='qa_audio_db', STORE='audio';
let dbPromise=null;
function openDB(){
  if(dbPromise) return dbPromise;
  dbPromise = new Promise((res,rej)=>{
    const r = indexedDB.open(DB_NAME,1);
    r.onupgradeneeded=()=>{ r.result.createObjectStore(STORE); };
    r.onsuccess=()=>res(r.result);
    r.onerror=()=>rej(r.error);
  });
  return dbPromise;
}
async function idbGet(key){ const db=await openDB(); return new Promise((res,rej)=>{ const tx=db.transaction(STORE,'readonly'); const st=tx.objectStore(STORE); const g=st.get(key); g.onsuccess=()=>res(g.result||null); g.onerror=()=>rej(g.error); }); }
async function idbSet(key,val){ const db=await openDB(); return new Promise((res,rej)=>{ const tx=db.transaction(STORE,'readwrite'); const st=tx.objectStore(STORE); const p=st.put(val,key); p.onsuccess=()=>res(); p.onerror=()=>rej(p.error); }); }

/* URLs & keys */
const makeKey = (tab,id)=>`${tab}:${id}`;
const remoteURL = (tab,id)=>{
  if(tab==='dari') return `${REMOTE_BASES.dari}/${pad4(id)}.mp3`;
  return `${REMOTE_BASES[tab]}/${pad3(id)}.mp3`;
};

/* ---------- DownloadManager ---------- */
/* Tries fast ranged download (needs CORS). If blocked, throws a special flag
   that the UI uses to switch into a plain "Save file" link. */
const DownloadManager = {
  active: new Map(),
  isDownloaded: async (tab,id)=> !!(await idbGet(makeKey(tab,id))),
  start(tab,id, onProgress){
    const key=makeKey(tab,id);
    if(this.active.has(key)) return this.active.get(key).promise;

    const promise = (async ()=>{
      try {
        await downloadAudioParallel(tab,id, pct=>onProgress && onProgress(pct));
      } catch (e) {
        const err = new Error('CORS_OR_NO_RANGE');
        err._downloadFallback = true; // signal UI to use link fallback
        throw err;
      } finally {
        this.active.delete(key);
      }
    })();

    this.active.set(key,{promise});
    return promise;
  }
};

/* ---------- FAST download: parallel ranges (requires CORS) ---------- */
async function downloadAudioParallel(tab, id, onProgress) {
  const url = remoteURL(tab, id);

  // HEAD to get size — may fail if CORS blocked
  let total = 0;
  try{
    const head = await fetch(url, { method: 'HEAD' });
    if(!head.ok) throw new Error('HEAD failed');
    total = +head.headers.get('Content-Length') || 0;
  }catch(e){ throw new Error('NO_CORS'); }

  if (!total) throw new Error('UNKNOWN_SIZE');

  const PARTS = 4;
  const partSize = Math.ceil(total / PARTS);
  let loadedGlobal = 0;
  onProgress && onProgress(0);

  const partPromises = Array.from({ length: PARTS }).map((_, i) => {
    const start = i * partSize;
    const end = Math.min(total - 1, start + partSize - 1);
    return fetch(url, { headers: { Range: `bytes=${start}-${end}` } })
      .then(r => {
        if (!(r.ok || r.status === 206)) throw new Error('Range not supported');
        const reader = r.body?.getReader();
        let chunks = [];
        return new Promise(async (res, rej) => {
          try{
            let size=0;
            while(true){
              const {done, value} = await reader.read();
              if(done) break;
              chunks.push(value);
              size += value.byteLength;
              loadedGlobal += value.byteLength;
              onProgress && onProgress(Math.round(loadedGlobal / total * 100));
            }
            const out = new Uint8Array(chunks.reduce((a,c)=>a+c.byteLength,0));
            let off=0; for(const c of chunks){ out.set(c, off); off+=c.byteLength; }
            res(out);
          }catch(ex){ rej(ex); }
        });
      });
  });

  const parts = await Promise.all(partPromises);
  const joined = new Uint8Array(total);
  let off = 0; for (const p of parts) { joined.set(p, off); off += p.byteLength; }
  const blob = new Blob([joined], { type:'audio/mpeg' });
  await idbSet(makeKey(tab,id), blob);
  onProgress && onProgress(100);
}

/* Resolve best source (downloaded blob > remote) */
async function resolveAudioSrc(tab,id){
  const key=makeKey(tab,id);
  const blob=await idbGet(key);
  if(blob instanceof Blob) return {src: URL.createObjectURL(blob), revoke:true};
  return {src: remoteURL(tab,id), revoke:false};
}

/* Render lists */
$('#tabArabic')?.addEventListener('click',()=>switchAudioTab('arabic'));
$('#tabPashto')?.addEventListener('click',()=>switchAudioTab('pashto'));
$('#tabDari')  ?.addEventListener('click',()=>switchAudioTab('dari'));

function renderAudioLists(){
  const meta=S.SURAH_META, ar=$('#listArabic'), ps=$('#listPashto'), dr=$('#listDari');
  ar.innerHTML=''; ps.innerHTML=''; dr.innerHTML='';
  meta.forEach(m=>{
    ar.appendChild(audioItem('arabic', m.number, `${pad3(m.number)} • ${m.englishName} • ${m.name}`));
    ps.appendChild(audioItem('pashto', m.number, `${pad3(m.number)} • ${m.englishName} • ${m.name}`));
  });
  for(let j=1;j<=30;j++) dr.appendChild(audioItem('dari', j, `Juz ${String(j).padStart(2,'0')}`));
  switchAudioTab(S.lastAudio?.tab||'arabic');
}

/* Audio item: Play + Download (button hides when downloaded; fallback to Save link if CORS) */
function audioItem(tab,id,title){
  const item=el('div','audio-item');
  item.innerHTML=`
    <div class="audio-num">${tab==='dari'?String(id).padStart(2,'0'):pad3(id)}</div>
    <div style="flex:1"><h5>${title}</h5><small>${tab}</small></div>
    <div class="audio-actions">
      <button class="pill small" data-act="play">Play</button>
      <button class="pill small" data-act="dl">Download</button>
    </div>
  `;
  const btnPlay=item.querySelector('[data-act="play"]');
  const btnDl  =item.querySelector('[data-act="dl"]');

  // Hide download button if already downloaded in IDB
  (async ()=>{
    if(await DownloadManager.isDownloaded(tab,id)){
      btnDl.style.display='none';
    }
  })();

  // PLAY (with .MP3 fallback)
  btnPlay.addEventListener('click', async ()=>{
    const {src, revoke} = await resolveAudioSrc(tab,id);
    startMiniPlayer(src, title);

    // If remote .mp3 fails, try .MP3 automatically
    const onErr = async () => {
      if (src.endsWith('.mp3')) {
        const alt = src.replace(/\.mp3($|\?)/i, '.MP3$1');
        audioEl.removeEventListener('error', onErr);
        startMiniPlayer(alt, title);
      }
    };
    audioEl.addEventListener('error', onErr, { once:true });

    if(S.lastAudio?.objUrl && S.lastAudio.objUrlRevoke) URL.revokeObjectURL(S.lastAudio.objUrl);
    S.lastAudio={tab,id,pos:0,src,title,objUrl:revoke?src:null,objUrlRevoke:revoke}; write(K.lastAudio,S.lastAudio);
    $('#miniPlayer').classList.remove('is-hidden');
  });

  // DOWNLOAD (fast → IDB if CORS allows, else turn into "Save file" link)
  btnDl.addEventListener('click', async (e)=>{
    e.stopPropagation();
    btnDl.disabled=true; btnDl.textContent='0%';
    try{
      await DownloadManager.start(tab,id, pct=>{
        if(!document.body.contains(btnDl)) return;
        btnDl.textContent = pct + '%';
      });
      // Saved into IndexedDB → hide button
      if(document.body.contains(btnDl)) btnDl.style.display='none';
    }catch(err){
      // If CORS/range blocked → swap to a simple link
      if (err && err._downloadFallback) {
        const href = remoteURL(tab,id);
        const a = document.createElement('a');
        a.href = href;
        a.target = '_blank';
        a.rel = 'noopener';
        a.download = '';            // hint save-as
        a.className = 'pill small';
        a.textContent = 'Save file';
        btnDl.replaceWith(a);
      } else {
        console.error(err);
        btnDl.textContent='Retry'; btnDl.disabled=false;
        alert('Download failed. Your browser may be blocking the download (CORS). You can still play the audio.');
      }
    }
  });

  return item;
}

/* Title helper (restore) */
function buildAudioTitle(tab,id){
  if(tab==='dari') return `Juz ${String(id).padStart(2,'0')}`;
  const m=S.SURAH_META.find(x=>+x.number===+id);
  return m?`${pad3(id)} • ${m.englishName} • ${m.name}`:pad3(id);
}

/* Mini player + seeking + background (Media Session) */
function fmt(t){ if(!isFinite(t)) return '0:00'; const m=Math.floor(t/60), s=Math.floor(t%60); return `${m}:${String(s).padStart(2,'0')}`; }
let pendingSeekPct=null;

function updateMediaSession(title) {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: title || 'Quran Audio', artist: '', album: 'Quran Anywhere',
    artwork: [{ src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB', sizes: '96x96', type: 'image/png' }]
  });
  navigator.mediaSession.setActionHandler('play',   () => audioEl.play().catch(()=>{}));
  navigator.mediaSession.setActionHandler('pause',  () => audioEl.pause());
  navigator.mediaSession.setActionHandler('seekbackward',  (d)=>{ audioEl.currentTime = Math.max(0,(audioEl.currentTime||0) - (d.seekOffset||10)); });
  navigator.mediaSession.setActionHandler('seekforward',   (d)=>{ audioEl.currentTime = (audioEl.currentTime||0) + (d.seekOffset||10); });
  navigator.mediaSession.setActionHandler('seekto', (d)=>{ if (d.fastSeek && audioEl.fastSeek) audioEl.fastSeek(d.seekTime); else audioEl.currentTime = d.seekTime; });
}

function startMiniPlayer(src,title){
  if(!V.audio.classList.contains('visible')) return;
  $('#miniTitle').textContent=title;
  if(!audioEl.src.endsWith(src)) { audioEl.src=src; pendingSeekPct=null; }
  audioEl.playbackRate=+selRate.value||1;
  audioEl.loop=$('#btnRepeat').classList.contains('active');
  audioEl.volume=+$('#miniVol').value;
  updateMediaSession(title);
  audioEl.play().catch(()=>{});
}

audioEl.addEventListener('loadedmetadata',()=>{ $('#miniDur').textContent=fmt(audioEl.duration||0); if(pendingSeekPct!=null){ applySeekPercent(pendingSeekPct); pendingSeekPct=null; } });
audioEl.addEventListener('canplay',()=>{ if(pendingSeekPct!=null){ applySeekPercent(pendingSeekPct); pendingSeekPct=null; } });
audioEl.addEventListener('durationchange',()=>{ $('#miniDur').textContent=fmt(audioEl.duration||0); });
audioEl.addEventListener('timeupdate',()=>{
  const ct=audioEl.currentTime||0, dd=audioEl.duration||0;
  $('#miniCur').textContent=fmt(ct);
  if(dd>0){ const p=(ct/dd)*100; if(Number.isFinite(p)) $('#miniRange').value=p; }
  if(!S.lastAudio) S.lastAudio={}; S.lastAudio.pos=Math.floor(ct); write(K.lastAudio,S.lastAudio);
  $('#ppIcon')?.setAttribute('href', audioEl.paused ? '#ic-play' : '#ic-pause');
});
audioEl.addEventListener('ended',()=>{ if(!audioEl.loop){ $('#ppIcon')?.setAttribute('href','#ic-play'); } });

$('#btnPlayPause')?.addEventListener('click',()=>{ if(audioEl.paused){ audioEl.play().catch(()=>{}); } else { audioEl.pause(); } });
$('#btnPrev15')?.addEventListener('click',()=>{ audioEl.currentTime=Math.max(0,(audioEl.currentTime||0)-15); });
$('#btnNext15')?.addEventListener('click',()=>{ audioEl.currentTime=(audioEl.currentTime||0)+15; });
$('#miniRate')  ?.addEventListener('change',()=>{ audioEl.playbackRate=+$('#miniRate').value||1; });
$('#miniVol')   ?.addEventListener('input',()=>{ audioEl.volume=+$('#miniVol').value; });
$('#btnRepeat') ?.addEventListener('click',()=>{ $('#btnRepeat').classList.toggle('active'); audioEl.loop=$('#btnRepeat').classList.contains('active'); });

function applySeekPercent(p){ const pct=Math.max(0,Math.min(100,Number(p)||0)); if(!(audioEl.duration>0)){ pendingSeekPct=pct; return; } const t=(pct/100)*(audioEl.duration||0); try{ if(typeof audioEl.fastSeek==='function') audioEl.fastSeek(t); else audioEl.currentTime=t; }catch{ audioEl.currentTime=t; } $('#miniCur').textContent=fmt(t); $('#miniRange').value=pct; }
$('#miniSeek')?.addEventListener('click',e=>{ const r=$('#miniRange').getBoundingClientRect(); const x=Math.min(Math.max((e.clientX??0)-r.left,0),r.width); applySeekPercent((x/r.width)*100); });
$('#miniRange')?.addEventListener('input',()=>applySeekPercent($('#miniRange').value));
$('#miniRange')?.addEventListener('change',()=>applySeekPercent($('#miniRange').value));

/* Tabs */
function switchAudioTab(name){
  $$('#view-audio .seg').forEach(b=>b.classList.remove('active'));
  (name==='arabic'?$('#tabArabic'):name==='pashto'?$('#tabPashto'):$('#tabDari'))?.classList.add('active');
  $('#listArabic')?.classList.toggle('is-hidden', name!=='arabic');
  $('#listPashto')?.classList.toggle('is-hidden', name!=='pashto');
  $('#listDari')  ?.classList.toggle('is-hidden', name!=='dari');
  if(!S.lastAudio) S.lastAudio={}; S.lastAudio.tab=name; write(K.lastAudio,S.lastAudio);
}

/* Share */
$('#btnShareAudio')?.addEventListener('click', async ()=>{
  const src=audioEl.currentSrc; if(!src) return;
  try{ if(navigator.share){ await navigator.share({title:'Quran Audio',url:src}); } else { await navigator.clipboard.writeText(src); alert('Audio URL copied'); } }catch{}
});

/* ===========================================================
   Settings
   =========================================================== */
$('#btnSettings')?.addEventListener('click',()=>{ $('#settingsDrawer').setAttribute('open',''); $('#settingsDrawer').setAttribute('aria-hidden','false'); });
$('#btnCloseSettings')?.addEventListener('click',()=>{ $('#settingsDrawer').removeAttribute('open'); $('#settingsDrawer').setAttribute('aria-hidden','true'); });
$('#themeGrid')?.addEventListener('click',e=>{ const c=e.target.closest('.themechip'); if(!c) return; S.theme=c.dataset.theme; write(K.theme,S.theme); applyTheme(); });

const sliderAr=$('#sliderArabic'), outAr=$('#outArabic');
const sliderTr=$('#sliderTrans'), outTr=$('#outTrans');
if(sliderAr&&outAr){ sliderAr.value=S.fzAr; outAr.textContent=S.fzAr; sliderAr.addEventListener('input',()=>{ S.fzAr=+sliderAr.value; outAr.textContent=S.fzAr; applyFontVars(); write(K.fzAr,S.fzAr); if(V.reader.classList.contains('visible')) openSurah(S.lastGlobal?.s||1,S.lastGlobal?.a||1); }); }
if(sliderTr&&outTr){ sliderTr.value=S.fzTr; outTr.textContent=S.fzTr; sliderTr.addEventListener('input',()=>{ S.fzTr=+sliderTr.value; outTr.textContent=S.fzTr; applyFontVars(); write(K.fzTr,S.fzTr); if(V.reader.classList.contains('visible')) openSurah(S.lastGlobal?.s||1,S.lastGlobal?.a||1); }); }
$('#chkPs')?.addEventListener('change',e=>{ S.showPs=e.target.checked; write(K.showPs,S.showPs?1:0); if(V.reader.classList.contains('visible')) openSurah(S.lastGlobal?.s||1,S.lastGlobal?.a||1); $('#tgPs')?.classList.toggle('active',S.showPs); });
$('#chkFa')?.addEventListener('change',e=>{ S.showFa=e.target.checked; write(K.showFa,S.showFa?1:0); if(V.reader.classList.contains('visible')) openSurah(S.lastGlobal?.s||1,S.lastGlobal?.a||1); $('#tgFa')?.classList.toggle('active',S.showFa); });
$('#chkEn')?.addEventListener('change',e=>{ S.showEn=e.target.checked; write(K.showEn,S.showEn?1:0); if(V.reader.classList.contains('visible')) openSurah(S.lastGlobal?.s||1,S.lastGlobal?.a||1); $('#tgEn')?.classList.toggle('active',S.showEn); });

(function bindLangSwitch(){
  const wrap=$('#langSwitch'); if(!wrap) return;
  $$('#langSwitch .seg').forEach(b=>b.classList.toggle('active', b.dataset.lang===S.uiLang));
  wrap.addEventListener('click',e=>{ const btn=e.target.closest('.seg'); if(!btn) return; $$('#langSwitch .seg').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); S.uiLang=btn.dataset.lang; write(K.lang,S.uiLang); applyLang(); });
})();

$('#btnResetAll')?.addEventListener('click',()=>{
  if(!confirm('Reset all settings and data? This will clear bookmarks, progress, audio downloads and settings.')) return;
  indexedDB.deleteDatabase(DB_NAME);
  [K.lang,K.theme,K.fzAr,K.fzTr,K.showPs,K.showFa,K.showEn,K.lastGlobal,K.lastAudio,K.bookmarks,K.perSurah].forEach(k=>localStorage.removeItem(k));
  location.reload();
});

/* ===========================================================
   Init
   =========================================================== */
function emptyCard(text){ const c=el('div','card'); c.style.textAlign='center'; c.style.color='var(--muted)'; c.textContent=text; return c; }

async function initApp(){
  write(K.theme,'dark'); applyTheme(); applyFontVars(); applyLang();
  try{ await loadAssets(); }catch(e){ console.error(e); alert('Could not load assets.'); }
  bindLanding();
}
document.addEventListener('DOMContentLoaded', initApp);
