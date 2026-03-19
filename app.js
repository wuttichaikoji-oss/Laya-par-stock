import { initializeApp, deleteApp } from 'https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signInAnonymously } from 'https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js';
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot, serverTimestamp, writeBatch } from 'https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js';

const OUTLETS = ['Mangrove', 'The Taste'];
const TABS = [
  ['dashboard','Dashboard'],
  ['liquors','Liquor Master'],
  ['recipes','Recipe Master'],
  ['entry','Daily Entry'],
  ['report','Daily Report'],
  ['settings','Settings']
];
const today = new Date().toISOString().slice(0,10);

const CONFIG_STORAGE_KEY = 'laya.firebase.setup.v1';
const DEFAULT_APP_OPTIONS = { tenantId: 'laya-resort-phuket', appName: 'Laya Liquor Usage & Par Cut' };

let db = null, auth = null, currentUser = null, ready = false, liveApp = null, authUnsub = null;
let unsubs = [];
let activeFirebaseConfig = {};
let activeAppOptions = { ...DEFAULT_APP_OPTIONS };

const state = {
  tab: 'dashboard',
  ui: {
    outlet: 'Mangrove',
    date: today,
    reportOutlet: 'Mangrove',
    reportDate: today,
    dashOutlet: 'Mangrove',
    dashDate: today,
    liquorSearch: '',
    recipeSearch: '',
    salesSearch: '',
    editingLiquor: null,
    editingRecipe: null,
    ingredients: [{ liquorId:'', ml:'' }]
  },
  data: { liquors: [], recipes: [], sales: [], movements: [], counts: [] }
};


function safeParse(json){ try { return JSON.parse(json); } catch { return null; } }
function getStoredSetup(){ return safeParse(localStorage.getItem(CONFIG_STORAGE_KEY) || 'null'); }
function getFileFirebaseConfig(){ return window.LAYA_FIREBASE_CONFIG || {}; }
function getFileAppOptions(){ return window.LAYA_APP_OPTIONS || {}; }
function isPlaceholder(value=''){ return !String(value||'').trim() || /YOUR_|PASTE_/i.test(String(value)); }
function configuredConfig(cfg={}){ return !!(cfg && !isPlaceholder(cfg.apiKey) && !isPlaceholder(cfg.projectId) && !isPlaceholder(cfg.appId)); }
function getEffectiveSettings(){
  const stored = getStoredSetup() || {};
  const fileCfg = getFileFirebaseConfig() || {};
  const fileOpts = { ...DEFAULT_APP_OPTIONS, ...(getFileAppOptions() || {}) };
  const storedCfg = stored.firebaseConfig || {};
  const storedOpts = stored.appOptions || {};
  const useStored = configuredConfig(storedCfg);
  return {
    firebaseConfig: useStored ? { ...fileCfg, ...storedCfg } : fileCfg,
    appOptions: useStored ? { ...fileOpts, ...storedOpts } : fileOpts,
    source: useStored ? 'browser/localStorage' : (configuredConfig(fileCfg) ? 'firebase-config.js' : 'ยังไม่ได้ตั้งค่า')
  };
}
function hydrateEffectiveSettings(){
  const eff = getEffectiveSettings();
  activeFirebaseConfig = eff.firebaseConfig || {};
  activeAppOptions = { ...DEFAULT_APP_OPTIONS, ...(eff.appOptions || {}) };
  return eff;
}
function configured(){ return configuredConfig(activeFirebaseConfig); }
function currentSource(){ return getEffectiveSettings().source; }
function masked(v=''){ const s = String(v||'').trim(); return !s ? '-' : (s.length <= 8 ? s : `${s.slice(0,4)}••••${s.slice(-4)}`); }
function setupFormData(){
  return {
    firebaseConfig: {
      apiKey: String($('cfgApiKey')?.value || '').trim(),
      authDomain: String($('cfgAuthDomain')?.value || '').trim(),
      projectId: String($('cfgProjectId')?.value || '').trim(),
      storageBucket: String($('cfgStorageBucket')?.value || '').trim(),
      messagingSenderId: String($('cfgMessagingSenderId')?.value || '').trim(),
      appId: String($('cfgAppId')?.value || '').trim()
    },
    appOptions: {
      tenantId: String($('cfgTenantId')?.value || DEFAULT_APP_OPTIONS.tenantId).trim() || DEFAULT_APP_OPTIONS.tenantId,
      appName: String($('cfgAppName')?.value || DEFAULT_APP_OPTIONS.appName).trim() || DEFAULT_APP_OPTIONS.appName
    }
  };
}
function configJsText(firebaseConfig, appOptions){
  return `window.LAYA_FIREBASE_CONFIG = ${JSON.stringify(firebaseConfig, null, 2)};

window.LAYA_APP_OPTIONS = ${JSON.stringify(appOptions, null, 2)};
`;
}
function downloadTextFile(filename, text, type='text/plain;charset=utf-8'){ const blob = new Blob([text], { type }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url); }
function setupWizardHtml(){
  const eff = getEffectiveSettings();
  const stored = getStoredSetup() || {};
  const cfg = eff.firebaseConfig || {};
  const opts = eff.appOptions || DEFAULT_APP_OPTIONS;
  return `
    <section class="card">
      <div class="hotel-banner"><strong>Firebase Setup Wizard</strong>กรอกค่า Firebase ได้บนหน้าเว็บ แล้วบันทึกไว้ในเบราว์เซอร์ของเครื่องนี้</div>
      <div class="setup-grid">
        <div class="setup-card">
          <h3>สถานะการตั้งค่า</h3>
          <div class="table-wrap" style="margin-top:12px"><table><tbody>
            <tr><th>แหล่ง config ที่ใช้งาน</th><td><span class="source-tag">${esc(currentSource())}</span></td></tr>
            <tr><th>Project ID</th><td>${esc(cfg.projectId || '-')}</td></tr>
            <tr><th>Tenant ID</th><td>${esc(opts.tenantId || '-')}</td></tr>
            <tr><th>App Name</th><td>${esc(opts.appName || '-')}</td></tr>
            <tr><th>มี config เก็บใน browser</th><td>${stored.firebaseConfig ? '<span class="pill ok">มี</span>' : '<span class="pill">ไม่มี</span>'}</td></tr>
          </tbody></table></div>
          <div class="box-note" style="margin-top:16px">แบบ browser/localStorage จะสะดวกสำหรับเครื่องนี้ทันที แต่ถ้าต้องการให้ทุกคนที่เปิดเว็บเห็นค่าเดียวกัน ควรดาวน์โหลดไฟล์ <code>firebase-config.js</code> แล้วอัปโหลดขึ้นเว็บแทน</div>
        </div>
        <div class="setup-card">
          <h3>ค่าจาก Firebase Console</h3>
          <p class="sub">ไปที่ Project settings &gt; Your apps &gt; SDK setup and configuration</p>
          <form id="setupForm">
            <div class="field-grid-3">
              <div><label>apiKey</label><input id="cfgApiKey" value="${esc(cfg.apiKey || '')}" placeholder="AIza..."></div>
              <div><label>authDomain</label><input id="cfgAuthDomain" value="${esc(cfg.authDomain || '')}" placeholder="your-project.firebaseapp.com"></div>
              <div><label>projectId</label><input id="cfgProjectId" value="${esc(cfg.projectId || '')}" placeholder="your-project-id"></div>
              <div><label>storageBucket</label><input id="cfgStorageBucket" value="${esc(cfg.storageBucket || '')}" placeholder="your-project.firebasestorage.app"></div>
              <div><label>messagingSenderId</label><input id="cfgMessagingSenderId" value="${esc(cfg.messagingSenderId || '')}" placeholder="1234567890"></div>
              <div><label>appId</label><input id="cfgAppId" value="${esc(cfg.appId || '')}" placeholder="1:123:web:abc"></div>
              <div><label>tenantId</label><input id="cfgTenantId" value="${esc(opts.tenantId || DEFAULT_APP_OPTIONS.tenantId)}"></div>
              <div style="grid-column:span 2"><label>App Name</label><input id="cfgAppName" value="${esc(opts.appName || DEFAULT_APP_OPTIONS.appName)}"></div>
            </div>
            <div class="helper">ค่า Firebase config ไม่ใช่ secret แต่แนะนำให้ใช้โปรเจกต์ของหน่อยเอง และตั้ง Firestore Rules ให้เรียบร้อย</div>
            <div class="inline-actions" style="margin-top:16px">
              <button type="submit">บันทึกใน browser และเชื่อมต่อ</button>
              <button type="button" id="btnTestSetup" class="secondary">ทดสอบการเชื่อมต่อ</button>
              <button type="button" id="btnDownloadConfig" class="secondary">ดาวน์โหลด firebase-config.js</button>
              <button type="button" id="btnClearStoredConfig" class="red">ล้างค่าที่บันทึกไว้</button>
            </div>
          </form>
        </div>
      </div>
    </section>`;
}

const $ = (id) => document.getElementById(id);
const esc = (s='') => String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const num = (v,d=0) => Number.isFinite(Number(v)) ? Number(v) : d;
const round = (v,p=2) => Math.round((num(v)*(10**p))+Number.EPSILON)/(10**p);
const fmt = (v,p=0) => round(v,p).toLocaleString('en-US',{minimumFractionDigits:p,maximumFractionDigits:p});
const status = (text, kind='') => { const el=$('statusBox'); if(el){ el.textContent=text; el.className=`status ${kind}`; } };
const cRef = (name) => collection(db, `tenants/${activeAppOptions.tenantId}/${name}`);
const dRef = (name,id) => doc(db, `tenants/${activeAppOptions.tenantId}/${name}/${id}`);
const getLiquor = (id) => state.data.liquors.find(x=>x.id===id);
const getRecipe = (id) => state.data.recipes.find(x=>x.id===id);
const outletOptions = (selected) => OUTLETS.map(o => `<option value="${o}" ${o===selected?'selected':''}>${o}</option>`).join('');
const liquorOptions = (selected,outletOnly=false) => `<option value="">-- เลือกเหล้า --</option>` + state.data.liquors
  .filter(l => !outletOnly || l.outlet===state.ui.outlet)
  .sort((a,b)=>a.name.localeCompare(b.name))
  .map(l => `<option value="${l.id}" ${l.id===selected?'selected':''}>${esc(l.name)}${outletOnly?'':` · ${esc(l.outlet)}`}</option>`).join('');
const recipeIngredientsText = (r) => (r.ingredients||[]).map(i => `${getLiquor(i.liquorId)?.name||'Unknown'} ${fmt(i.ml,0)} ml`).join(', ');
const movementLabel = (k) => ({receive:'Receive',transferIn:'Transfer In',transferOut:'Transfer Out',breakage:'Breakage',comp:'Complimentary',staff:'Staff Drink',adjust:'Adjustment'})[k] || k;
const upsertLocal = (type, record) => {
  const list = state.data[type] || (state.data[type] = []);
  const idx = list.findIndex(x => x.id === record.id);
  if(idx >= 0) list[idx] = { ...list[idx], ...record };
  else list.push(record);
};
const removeLocalById = (type, id) => {
  state.data[type] = (state.data[type] || []).filter(x => x.id !== id);
};
const entryUsageRows = (rep) => rep.rows.filter(r => r.usageMl > 0.01 || r.actual !== null || r.gapMl > 0.01)
  .sort((a,b) => (b.usageMl - a.usageMl) || a.liquor.name.localeCompare(b.liquor.name));
const saleId = (date,outlet,recipeId) => `${date}_${outlet.replace(/\s+/g,'-')}_${recipeId}`;
const moveId = (date,outlet,liquorId,kind) => `${date}_${outlet.replace(/\s+/g,'-')}_${liquorId}_${kind}`;
const countId = (date,outlet,liquorId) => `${date}_${outlet.replace(/\s+/g,'-')}_${liquorId}`;
const recipeTypeOptions = (selected) => ['cocktail','shot','mixed drink','wine glass'].map(t => `<option value="${t}" ${selected===t?'selected':''}>${t}</option>`).join('');

function renderTabs(){
  $('tabs').innerHTML = TABS.map(([id,label]) => `<button class="tab ${state.tab===id?'active':''}" data-tab="${id}">${label}</button>`).join('');
  $('tabs').querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { state.tab = b.dataset.tab; render(); });
}

function setupView(){
  state.tab = 'settings';
  $('app').innerHTML = `
    ${setupWizardHtml()}
    <section class="card">
      <h2>ยังไม่ได้ตั้งค่า Firebase</h2>
      <p class="sub">หน่อยสามารถใช้ Setup Wizard ด้านบนได้ทันที โดยไม่ต้องแก้ไฟล์ก่อน</p>
      <div class="box-note">
        ถ้าต้องการตั้งค่าแบบถาวรสำหรับทุกเครื่อง ให้กรอกค่าใน Setup Wizard แล้วกด <strong>ดาวน์โหลด firebase-config.js</strong>
        จากนั้นนำไฟล์ที่ได้ไปแทนที่ไฟล์เดิมบนเว็บของหน่อย
      </div>
    </section>`;
  bindViewEvents();
}

function summaryReport(date,outlet){
  const liquors = state.data.liquors.filter(l=>l.outlet===outlet).sort((a,b)=>a.name.localeCompare(b.name));
  const usageMap = {};
  state.data.sales.filter(s=>s.date===date && s.outlet===outlet).forEach(s => {
    const r = getRecipe(s.recipeId); if(!r) return;
    (r.ingredients||[]).forEach(i => usageMap[i.liquorId] = num(usageMap[i.liquorId]) + (num(i.ml) * num(s.qty)));
  });
  const moveMap = {};
  state.data.movements.filter(m=>m.date===date && m.outlet===outlet).forEach(m => {
    moveMap[m.liquorId] ||= {receive:0,transferIn:0,transferOut:0,breakage:0,comp:0,staff:0,adjust:0};
    moveMap[m.liquorId][m.kind] = num(moveMap[m.liquorId][m.kind]) + num(m.qtyMl);
  });
  const countMap = Object.fromEntries(state.data.counts.filter(c=>c.date===date && c.outlet===outlet).map(c=>[c.liquorId,num(c.actualMl)]));
  const previousCount = (liquorId) => state.data.counts.filter(c => c.liquorId===liquorId && c.outlet===outlet && c.date<date).sort((a,b)=>b.date.localeCompare(a.date))[0] || null;
  const usageBetween = (liquorId, fromDate, toDate) => {
    let t = 0;
    const relevant = [...new Set(state.data.sales.filter(s=>s.outlet===outlet && s.date>fromDate && s.date<toDate).map(s=>s.date))];
    relevant.forEach(d => {
      state.data.sales.filter(s=>s.outlet===outlet && s.date===d).forEach(s => {
        const r = getRecipe(s.recipeId); if(!r) return;
        (r.ingredients||[]).forEach(i => { if(i.liquorId===liquorId) t += num(i.ml)*num(s.qty); });
      });
    });
    return t;
  };
  const moveBetween = (liquorId, fromDate, toDate) => {
    const t = {receive:0,transferIn:0,transferOut:0,breakage:0,comp:0,staff:0,adjust:0};
    state.data.movements.filter(m=>m.liquorId===liquorId && m.outlet===outlet && m.date>fromDate && m.date<toDate).forEach(m => t[m.kind]+=num(m.qtyMl));
    return t;
  };
  const rows = liquors.map(liquor => {
    const prev = previousCount(liquor.id);
    const baseDate = prev ? prev.date : '';
    const base = prev ? num(prev.actualMl) : num(liquor.openingMl);
    const carryMoves = moveBetween(liquor.id, baseDate, date);
    const carryUse = usageBetween(liquor.id, baseDate, date);
    const openingMl = base + carryMoves.receive + carryMoves.transferIn + carryMoves.adjust - carryMoves.transferOut - carryMoves.breakage - carryMoves.comp - carryMoves.staff - carryUse;
    const mv = moveMap[liquor.id] || {receive:0,transferIn:0,transferOut:0,breakage:0,comp:0,staff:0,adjust:0};
    const usageMl = num(usageMap[liquor.id]);
    const theo = openingMl + mv.receive + mv.transferIn + mv.adjust - mv.transferOut - mv.breakage - mv.comp - mv.staff - usageMl;
    const actual = Number.isFinite(countMap[liquor.id]) ? countMap[liquor.id] : null;
    const closeBase = actual===null ? theo : actual;
    const parMl = num(liquor.parBottles) * num(liquor.bottleSizeMl);
    const gapMl = Math.max(parMl - closeBase, 0);
    return {
      liquor, openingMl:round(openingMl,2), usageMl:round(usageMl,2),
      receive:round(mv.receive + mv.transferIn + mv.adjust,2),
      loss:round(mv.transferOut + mv.breakage + mv.comp + mv.staff,2),
      theo:round(theo,2), actual:actual===null?null:round(actual,2),
      variance:actual===null?null:round(actual - theo,2), gapMl:round(gapMl,2), parMl:round(parMl,2),
      refillBottles: round(num(liquor.bottleSizeMl)? gapMl/num(liquor.bottleSizeMl):0, 2)
    };
  });
  return {
    rows,
    totalUsage: round(rows.reduce((s,r)=>s+r.usageMl,0),2),
    totalGap: round(rows.reduce((s,r)=>s+r.gapMl,0),2),
    lowPar: rows.filter(r=>r.gapMl>0.01).length,
    varianceCount: rows.filter(r=>r.variance!==null && Math.abs(r.variance)>0.01).length
  };
}

function dashboardView(){
  const {dashDate,dashOutlet} = state.ui;
  const rep = summaryReport(dashDate,dashOutlet);
  const sales = state.data.sales.filter(s=>s.date===dashDate && s.outlet===dashOutlet);
  return `
    <section class="grid grid-2">
      <div class="card">
        <div class="hotel-banner"><strong>${esc(activeAppOptions.appName||'Laya Liquor Usage & Par Cut')}</strong>ข้อมูลวันนี้จาก Firebase Cloud</div>
        <div class="field-grid-4 no-print">
          <div><label>วันที่</label><input id="dashDate" type="date" value="${dashDate}"></div>
          <div><label>Outlet</label><select id="dashOutlet">${outletOptions(dashOutlet)}</select></div>
        </div>
        <div class="kpis section-gap">
          <div class="kpi"><div class="label">สูตรที่ขาย</div><div class="value">${sales.length}</div></div>
          <div class="kpi"><div class="label">ใช้เหล้ารวม</div><div class="value">${fmt(rep.totalUsage,0)} ml</div></div>
          <div class="kpi"><div class="label">ต่ำกว่า Par</div><div class="value">${rep.lowPar}</div></div>
          <div class="kpi"><div class="label">มี Variance</div><div class="value">${rep.varianceCount}</div></div>
        </div>
        <div class="table-wrap">
          <table><thead><tr><th>เมนู</th><th class="right">Qty</th><th>ประเภท</th></tr></thead><tbody>
            ${sales.length ? sales.sort((a,b)=>(getRecipe(a.recipeId)?.name||'').localeCompare(getRecipe(b.recipeId)?.name||'')).map(s=>`<tr><td>${esc(getRecipe(s.recipeId)?.name||s.recipeName)}</td><td class="right">${fmt(s.qty,0)}</td><td>${esc(getRecipe(s.recipeId)?.type||'-')}</td></tr>`).join('') : '<tr><td colspan="3" class="center muted">ยังไม่มียอดขายวันนี้</td></tr>'}
          </tbody></table>
        </div>
      </div>
      <div class="card">
        <h2>ต้องจับตา</h2>
        <p class="sub">รายการที่มีการใช้หรือขาดจาก Par</p>
        <div class="table-wrap">
          <table><thead><tr><th>Liquor</th><th class="right">Used</th><th class="right">Par Gap</th></tr></thead><tbody>
          ${rep.rows.filter(r=>r.usageMl>0||r.gapMl>0).length ? rep.rows.filter(r=>r.usageMl>0||r.gapMl>0).map(r=>`<tr><td>${esc(r.liquor.name)}</td><td class="right">${fmt(r.usageMl,0)} ml</td><td class="right ${r.gapMl>0?'warn-text':'ok-text'}">${fmt(r.gapMl,0)} ml</td></tr>`).join('') : '<tr><td colspan="3" class="center muted">ยังไม่มีข้อมูล</td></tr>'}
          </tbody></table>
        </div>
      </div>
    </section>`;
}

function liquorView(){
  const editing = state.ui.editingLiquor ? getLiquor(state.ui.editingLiquor) : null;
  const rows = state.data.liquors.filter(l => l.outlet===state.ui.outlet && l.name.toLowerCase().includes(state.ui.liquorSearch.toLowerCase())).sort((a,b)=>a.name.localeCompare(b.name));
  return `
    <section class="grid grid-2">
      <div class="card">
        <h2>${editing?'แก้ไขรายการเหล้า':'เพิ่มรายการเหล้า'}</h2>
        <p class="sub">ข้อมูลชุดนี้จะถูกบันทึกลง Firestore</p>
        <form id="liquorForm">
          <div class="field-grid-3">
            <div><label>ชื่อเหล้า</label><input name="name" required value="${esc(editing?.name||'')}" placeholder="เช่น Smirnoff"></div>
            <div><label>Outlet</label><select name="outlet">${outletOptions(editing?.outlet||state.ui.outlet)}</select></div>
            <div><label>ขนาดขวด (ml)</label><input name="bottleSizeMl" type="number" min="1" step="1" value="${editing?.bottleSizeMl||700}"></div>
            <div><label>Opening เริ่มต้น (ml)</label><input name="openingMl" type="number" min="0" step="0.01" value="${editing?.openingMl||0}"></div>
            <div><label>Par (ขวด)</label><input name="parBottles" type="number" min="0" step="0.01" value="${editing?.parBottles||0}"></div>
            <div><label>Reorder Level (ขวด)</label><input name="reorderBottles" type="number" min="0" step="0.01" value="${editing?.reorderBottles||0}"></div>
            <div><label>Cost / Bottle</label><input name="costPerBottle" type="number" min="0" step="0.01" value="${editing?.costPerBottle||0}"></div>
            <div style="grid-column:span 2"><label>หมายเหตุ</label><input name="notes" value="${esc(editing?.notes||'')}" placeholder="optional"></div>
          </div>
          <div class="inline-actions" style="margin-top:16px"><button type="submit">${editing?'บันทึกการแก้ไข':'เพิ่มรายการ'}</button>${editing?'<button type="button" id="cancelLiquor" class="secondary">ยกเลิก</button>':''}</div>
        </form>
      </div>
      <div class="card">
        <h2>Liquor Master</h2>
        <div class="field-grid-3 no-print">
          <div><label>Outlet</label><select id="outletFilter">${outletOptions(state.ui.outlet)}</select></div>
          <div style="grid-column:span 2"><label>ค้นหา</label><input id="liquorSearch" value="${esc(state.ui.liquorSearch)}"></div>
        </div>
        <div class="table-wrap" style="margin-top:16px">
          <table><thead><tr><th>ชื่อเหล้า</th><th>ขนาด</th><th>Opening</th><th>Par</th><th class="no-print">จัดการ</th></tr></thead><tbody>
          ${rows.length ? rows.map(l=>`<tr><td><strong>${esc(l.name)}</strong><div class="muted">${esc(l.notes||'')}</div></td><td>${fmt(l.bottleSizeMl,0)} ml</td><td>${fmt(l.openingMl,0)} ml</td><td>${fmt(l.parBottles,2)} ขวด</td><td class="no-print"><div class="soft-actions"><button class="small secondary" data-edit-liquor="${l.id}">แก้ไข</button><button class="small red" data-delete-liquor="${l.id}">ลบ</button></div></td></tr>`).join('') : '<tr><td colspan="5" class="center muted">ยังไม่มีรายการเหล้า</td></tr>'}
          </tbody></table>
        </div>
      </div>
    </section>`;
}

function ingredientRowsHtml(){
  return state.ui.ingredients.map((r,idx)=>`<div class="field-grid-5 ingredient" data-idx="${idx}"><div><label>${idx===0?'ส่วนผสม':'&nbsp;'}</label><select class="ing-liquor">${liquorOptions(r.liquorId,false)}</select></div><div><label>${idx===0?'ml / serve':'&nbsp;'}</label><input class="ing-ml" type="number" min="0" step="0.01" value="${esc(r.ml)}"></div><div style="display:flex;align-items:flex-end"><button type="button" class="small secondary addIng">+ เพิ่ม</button></div><div style="display:flex;align-items:flex-end"><button type="button" class="small secondary removeIng" ${state.ui.ingredients.length===1?'disabled':''}>ลบ</button></div></div>`).join('');
}

function recipeView(){
  const editing = state.ui.editingRecipe ? getRecipe(state.ui.editingRecipe) : null;
  const rows = state.data.recipes.filter(r => r.outlet===state.ui.outlet && r.name.toLowerCase().includes(state.ui.recipeSearch.toLowerCase())).sort((a,b)=>a.name.localeCompare(b.name));
  return `
    <section class="grid grid-2">
      <div class="card">
        <h2>${editing?'แก้ไขสูตร':'เพิ่มสูตรเครื่องดื่ม'}</h2>
        <form id="recipeForm">
          <div class="field-grid-3">
            <div><label>ชื่อเมนู</label><input name="name" required value="${esc(editing?.name||'')}" placeholder="เช่น Margarita"></div>
            <div><label>Outlet</label><select name="outlet">${outletOptions(editing?.outlet||state.ui.outlet)}</select></div>
            <div><label>ประเภท</label><select name="type">${recipeTypeOptions(editing?.type||'cocktail')}</select></div>
          </div>
          <div style="margin-top:12px"><label>หมายเหตุ</label><input name="notes" value="${esc(editing?.notes||'')}"></div>
          <div style="margin-top:16px"><h3>ส่วนผสม</h3>${ingredientRowsHtml()}</div>
          <div class="inline-actions" style="margin-top:16px"><button type="submit">${editing?'บันทึกการแก้ไข':'เพิ่มสูตร'}</button>${editing?'<button type="button" id="cancelRecipe" class="secondary">ยกเลิก</button>':''}</div>
        </form>
      </div>
      <div class="card">
        <h2>Recipe Master</h2>
        <div class="field-grid-3 no-print">
          <div><label>Outlet</label><select id="recipeOutletFilter">${outletOptions(state.ui.outlet)}</select></div>
          <div style="grid-column:span 2"><label>ค้นหา</label><input id="recipeSearch" value="${esc(state.ui.recipeSearch)}"></div>
        </div>
        <div class="table-wrap" style="margin-top:16px"><table><thead><tr><th>เมนู</th><th>ประเภท</th><th>ส่วนผสม</th><th class="no-print">จัดการ</th></tr></thead><tbody>
          ${rows.length ? rows.map(r=>`<tr><td><strong>${esc(r.name)}</strong><div class="muted">${esc(r.notes||'')}</div></td><td>${esc(r.type)}</td><td>${esc(recipeIngredientsText(r))}</td><td class="no-print"><div class="soft-actions"><button class="small secondary" data-edit-recipe="${r.id}">แก้ไข</button><button class="small red" data-delete-recipe="${r.id}">ลบ</button></div></td></tr>`).join('') : '<tr><td colspan="4" class="center muted">ยังไม่มีสูตร</td></tr>'}
        </tbody></table></div>
      </div>
    </section>`;
}

function entryUsageSummaryHtml(rep){
  const rows = entryUsageRows(rep);
  return `
    <div class="table-wrap compact-table"><table><thead><tr><th>Liquor</th><th class="right">Used</th><th class="right">Closing</th><th class="right">Var</th></tr></thead><tbody>
      ${rows.length ? rows.map(r=>`<tr><td><strong>${esc(r.liquor.name)}</strong><div class="muted">${esc(r.liquor.outlet)}</div></td><td class="right">${fmt(r.usageMl,0)} ml</td><td class="right">${fmt(r.actual===null?r.theo:r.actual,0)} ml</td><td class="right ${r.variance===null?'':(r.variance<0?'danger-text':r.variance>0?'warn-text':'ok-text')}">${r.variance===null?'-':fmt(r.variance,0)}</td></tr>`).join('') : '<tr><td colspan="4" class="center muted">ยังไม่มีการใช้เหล้าวันนี้</td></tr>'}
    </tbody></table></div>`;
}

function entryView(){
  const recipes = state.data.recipes
    .filter(r => r.outlet===state.ui.outlet && r.name.toLowerCase().includes(state.ui.salesSearch.toLowerCase()))
    .sort((a,b)=>a.name.localeCompare(b.name));
  const salesMap = Object.fromEntries(state.data.sales.filter(s=>s.date===state.ui.date && s.outlet===state.ui.outlet).map(s=>[s.recipeId,s]));
  const moves = state.data.movements.filter(m=>m.date===state.ui.date && m.outlet===state.ui.outlet);
  const counts = state.data.counts.filter(c=>c.date===state.ui.date && c.outlet===state.ui.outlet);
  const rep = summaryReport(state.ui.date,state.ui.outlet);
  return `
    <section class="entry-layout">
      <div class="card entry-main">
        <div class="section-head">
          <div>
            <h2>Daily Sales Entry</h2>
            <p class="sub">คีย์ยอดขายจากกระดาษ แล้วบันทึก 1 ครั้งต่อเมนู · ถ้าใส่ 0 แล้วบันทึก ระบบจะลบยอดขายเมนูนั้นออก</p>
          </div>
          <div class="entry-chip-group">
            <span class="pill">${esc(state.ui.outlet)}</span>
            <span class="pill">${state.ui.date}</span>
          </div>
        </div>
        <div class="field-grid-4 no-print compact-fields">
          <div><label>วันที่</label><input id="entryDate" type="date" value="${state.ui.date}"></div>
          <div><label>Outlet</label><select id="entryOutlet">${outletOptions(state.ui.outlet)}</select></div>
          <div style="grid-column:span 2"><label>ค้นหาเมนู</label><input id="salesSearch" value="${esc(state.ui.salesSearch)}" placeholder="พิมพ์ชื่อเมนูที่ต้องการคีย์"></div>
        </div>
        <div class="sales-list" style="margin-top:16px">
        ${recipes.length ? recipes.map(r=>{
          const q = num(salesMap[r.id]?.qty);
          return `<article class="sale-card"><div class="sale-card-top"><div><div class="sale-name">${esc(r.name)}</div><div class="sale-meta">${esc(recipeIngredientsText(r))}</div></div><div class="sale-qty-badge">${fmt(q,0)}</div></div><div class="sale-controls"><div class="stepper"><button class="small secondary" data-adjust-sale="${r.id}" data-delta="-1">-1</button><button class="small secondary" data-adjust-sale="${r.id}" data-delta="1">+1</button><button class="small secondary" data-adjust-sale="${r.id}" data-delta="5">+5</button></div><div class="sale-input-wrap"><label class="mini-label" for="qty_${r.id}">Qty</label><input id="qty_${r.id}" class="sale-qty-input" type="number" min="0" step="1" value="${q||''}" placeholder="0"></div><button class="sale-save" data-save-sale="${r.id}">บันทึก</button></div></article>`;
        }).join('') : '<div class="empty">ยังไม่มีสูตรใน outlet นี้</div>'}
        </div>
      </div>
      <aside class="entry-side">
        <div class="card compact-card">
          <div class="section-head tight">
            <div>
              <h2>Movement</h2>
              <p class="sub">บันทึก receive, breakage, comp และการปรับสต๊อก</p>
            </div>
            <span class="pill warn">${moves.length} รายการ</span>
          </div>
          <div class="field-grid compact-fields">
            <div><label>เหล้า</label><select id="moveLiquor">${liquorOptions('',true)}</select></div>
            <div><label>Movement</label><select id="moveKind">${['receive','transferIn','transferOut','breakage','comp','staff','adjust'].map(k=>`<option value="${k}">${movementLabel(k)}</option>`).join('')}</select></div>
            <div><label>จำนวน (ml)</label><input id="moveQty" type="number" min="0" step="0.01"></div>
            <div><label>หมายเหตุ</label><input id="moveNote" placeholder="optional"></div>
          </div>
          <div class="inline-actions" style="margin-top:12px"><button id="saveMove">บันทึก Movement</button></div>
        </div>

        <div class="card compact-card">
          <div class="section-head tight">
            <div>
              <h2>Actual Count</h2>
              <p class="sub">เมื่อนับจริงแล้ว ระบบจะใช้ค่านี้คำนวณ variance และ par cut ทันที</p>
            </div>
            <span class="pill">${counts.length} รายการ</span>
          </div>
          <div class="field-grid compact-fields">
            <div><label>เหล้า</label><select id="countLiquor">${liquorOptions('',true)}</select></div>
            <div><label>Actual Closing (ml)</label><input id="countActual" type="number" min="0" step="0.01"></div>
          </div>
          <div class="inline-actions" style="margin-top:12px"><button id="saveCount">บันทึก Actual Count</button></div>
        </div>

        <div class="card compact-card">
          <div class="section-head tight">
            <div>
              <h2>คำนวณหลังบันทึกทันที</h2>
              <p class="sub">เมื่อบันทึกยอดขาย, movement หรือ actual count ด้านล่างนี้จะคำนวณใหม่อัตโนมัติ</p>
            </div>
          </div>
          <div class="kpis kpis-2" style="margin-bottom:12px"><div class="kpi"><div class="label">ใช้เหล้ารวม</div><div class="value">${fmt(rep.totalUsage,0)} ml</div></div><div class="kpi"><div class="label">ต่ำกว่า Par</div><div class="value">${rep.lowPar}</div></div></div>
          ${entryUsageSummaryHtml(rep)}
        </div>

        <div class="card compact-card">
          <div class="section-head tight"><h2>บันทึกวันนี้</h2></div>
          <div class="table-wrap compact-table"><table><thead><tr><th>ประเภท</th><th>รายละเอียด</th><th class="right">จำนวน</th><th class="no-print">ลบ</th></tr></thead><tbody>
            ${moves.map(m=>`<tr><td>${movementLabel(m.kind)}</td><td><strong>${esc(getLiquor(m.liquorId)?.name||'-')}</strong><div class="muted">${esc(m.note||'')}</div></td><td class="right">${fmt(m.qtyMl,0)} ml</td><td class="no-print"><button class="small red" data-delete-move="${m.id}">ลบ</button></td></tr>`).join('')}
            ${counts.map(c=>`<tr><td>Actual Count</td><td><strong>${esc(getLiquor(c.liquorId)?.name||'-')}</strong></td><td class="right">${fmt(c.actualMl,0)} ml</td><td class="no-print"><button class="small red" data-delete-count="${c.id}">ลบ</button></td></tr>`).join('')}
            ${(!moves.length && !counts.length) ? '<tr><td colspan="4" class="center muted">ยังไม่มี movement หรือ count วันนี้</td></tr>' : ''}
          </tbody></table></div>
        </div>
      </aside>
    </section>`;
}

function reportView(){
  const rep = summaryReport(state.ui.reportDate,state.ui.reportOutlet);
  return `
    <section class="card">
      <div class="field-grid-4 no-print">
        <div><label>วันที่</label><input id="reportDate" type="date" value="${state.ui.reportDate}"></div>
        <div><label>Outlet</label><select id="reportOutlet">${outletOptions(state.ui.reportOutlet)}</select></div>
        <div class="box-note" style="grid-column:span 2">รายงานนี้ sync จาก Firestore แบบทันที ถ้ามีเครื่องอื่นคีย์ข้อมูล รายงานจะอัปเดตตาม</div>
      </div>
      <div class="inline-actions no-print" style="justify-content:flex-end;margin:12px 0"><button id="printReq" class="gold">พิมพ์ใบเบิก</button></div>
      <div class="kpis"><div class="kpi"><div class="label">ใช้เหล้ารวม</div><div class="value">${fmt(rep.totalUsage,0)} ml</div></div><div class="kpi"><div class="label">Par Gap รวม</div><div class="value">${fmt(rep.totalGap,0)} ml</div></div><div class="kpi"><div class="label">ต่ำกว่า Par</div><div class="value">${rep.lowPar}</div></div><div class="kpi"><div class="label">มี Variance</div><div class="value">${rep.varianceCount}</div></div></div>
      <div class="table-wrap"><table><thead><tr><th>Liquor</th><th class="right">Opening</th><th class="right">Used</th><th class="right">Receive</th><th class="right">Loss</th><th class="right">Theo</th><th class="right">Actual</th><th class="right">Variance</th><th class="right">Par Gap</th><th class="right">Refill</th></tr></thead><tbody>
      ${rep.rows.length ? rep.rows.map(r=>`<tr><td><strong>${esc(r.liquor.name)}</strong><div class="muted">${esc(r.liquor.outlet)}</div></td><td class="right">${fmt(r.openingMl,0)}</td><td class="right">${fmt(r.usageMl,0)}</td><td class="right">${fmt(r.receive,0)}</td><td class="right">${fmt(r.loss,0)}</td><td class="right">${fmt(r.theo,0)}</td><td class="right">${r.actual===null?'-':fmt(r.actual,0)}</td><td class="right ${r.variance===null?'':(r.variance<0?'danger-text':r.variance>0?'warn-text':'ok-text')}">${r.variance===null?'-':fmt(r.variance,0)}</td><td class="right ${r.gapMl>0?'warn-text':'ok-text'}">${fmt(r.gapMl,0)}</td><td class="right">${fmt(r.refillBottles,2)} ขวด</td></tr>`).join('') : '<tr><td colspan="10" class="center muted">ยังไม่มีข้อมูล</td></tr>'}
      </tbody></table></div>
    </section>`;
}

function settingsView(){
  return `
    ${setupWizardHtml()}
    <section class="grid grid-2">
      <div class="card"><h2>Cloud Settings</h2><div class="table-wrap"><table><tbody>
        <tr><th>App Name</th><td>${esc(activeAppOptions.appName||'-')}</td></tr>
        <tr><th>Tenant ID</th><td>${esc(activeAppOptions.tenantId||'-')}</td></tr>
        <tr><th>Project ID</th><td>${esc(activeFirebaseConfig.projectId||'-')}</td></tr>
        <tr><th>apiKey</th><td>${esc(masked(activeFirebaseConfig.apiKey||'-'))}</td></tr>
        <tr><th>Config Source</th><td><span class="source-tag">${esc(currentSource())}</span></td></tr>
        <tr><th>Auth UID</th><td>${esc(currentUser?.uid||'-')}</td></tr>
        <tr><th>Connected</th><td>${ready?'<span class="pill ok">พร้อมใช้งาน</span>':'<span class="pill warn">กำลังเชื่อมต่อ</span>'}</td></tr>
      </tbody></table></div></div>
      <div class="card"><h2>ข้อมูลที่เก็บบน Firebase</h2><div class="table-wrap"><table><thead><tr><th>Collection</th><th>Count</th></tr></thead><tbody>
        <tr><td>liquors</td><td>${state.data.liquors.length}</td></tr>
        <tr><td>recipes</td><td>${state.data.recipes.length}</td></tr>
        <tr><td>sales</td><td>${state.data.sales.length}</td></tr>
        <tr><td>movements</td><td>${state.data.movements.length}</td></tr>
        <tr><td>counts</td><td>${state.data.counts.length}</td></tr>
      </tbody></table></div><div class="box-note" style="margin-top:16px">ข้อมูลของเวอร์ชันนี้เก็บใน Firestore ทั้งหมด ไม่ได้เก็บแค่ localStorage</div></div>
    </section>`;
}

function render(){
  renderTabs();
  if(!configured()) return setupView();
  const views = { dashboard:dashboardView, liquors:liquorView, recipes:recipeView, entry:entryView, report:reportView, settings:settingsView };
  if(!ready && state.tab !== 'settings') { $('app').innerHTML = '<section class="card"><h2>กำลังโหลดข้อมูลจาก Firebase...</h2><p class="sub">เมื่อเชื่อมต่อสำเร็จ หน้าจอจะอัปเดตอัตโนมัติ</p></section>'; return; }
  $('app').innerHTML = views[state.tab]();
  bindViewEvents();
}

function bindBaseEvents(){
  $('btnSetup').onclick = () => { state.tab = 'settings'; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  $('btnDemo').onclick = seedDemoData;
  $('btnExport').onclick = exportJson;
  $('btnRefresh').onclick = () => render();
}

function bindViewEvents(){
  $('setupForm') && ($('setupForm').onsubmit = saveSetupAndConnect);
  $('btnTestSetup') && ($('btnTestSetup').onclick = testSetupConnection);
  $('btnDownloadConfig') && ($('btnDownloadConfig').onclick = downloadConfigFromWizard);
  $('btnClearStoredConfig') && ($('btnClearStoredConfig').onclick = clearStoredConfig);
  $('dashDate') && ($('dashDate').oninput = e => { state.ui.dashDate = e.target.value; render(); });
  $('dashOutlet') && ($('dashOutlet').onchange = e => { state.ui.dashOutlet = e.target.value; render(); });

  $('outletFilter') && ($('outletFilter').onchange = e => { state.ui.outlet = e.target.value; state.ui.editingLiquor = null; render(); });
  $('liquorSearch') && ($('liquorSearch').oninput = e => { state.ui.liquorSearch = e.target.value; render(); });
  $('liquorForm') && ($('liquorForm').onsubmit = saveLiquor);
  $('cancelLiquor') && ($('cancelLiquor').onclick = () => { state.ui.editingLiquor = null; render(); });
  document.querySelectorAll('[data-edit-liquor]').forEach(b => b.onclick = () => { state.ui.editingLiquor = b.dataset.editLiquor; render(); });
  document.querySelectorAll('[data-delete-liquor]').forEach(b => b.onclick = () => removeRecord('liquors', b.dataset.deleteLiquor));

  $('recipeOutletFilter') && ($('recipeOutletFilter').onchange = e => { state.ui.outlet = e.target.value; state.ui.editingRecipe = null; render(); });
  $('recipeSearch') && ($('recipeSearch').oninput = e => { state.ui.recipeSearch = e.target.value; render(); });
  $('recipeForm') && ($('recipeForm').onsubmit = saveRecipe);
  $('cancelRecipe') && ($('cancelRecipe').onclick = () => { state.ui.editingRecipe = null; state.ui.ingredients = [{liquorId:'',ml:''}]; render(); });
  document.querySelectorAll('.ingredient').forEach(row => {
    const idx = Number(row.dataset.idx);
    row.querySelector('.ing-liquor').onchange = e => state.ui.ingredients[idx].liquorId = e.target.value;
    row.querySelector('.ing-ml').oninput = e => state.ui.ingredients[idx].ml = e.target.value;
    row.querySelector('.addIng').onclick = () => { state.ui.ingredients.push({liquorId:'',ml:''}); render(); };
    row.querySelector('.removeIng').onclick = () => { state.ui.ingredients.splice(idx,1); if(!state.ui.ingredients.length) state.ui.ingredients=[{liquorId:'',ml:''}]; render(); };
  });
  document.querySelectorAll('[data-edit-recipe]').forEach(b => b.onclick = () => startRecipeEdit(b.dataset.editRecipe));
  document.querySelectorAll('[data-delete-recipe]').forEach(b => b.onclick = () => removeRecord('recipes', b.dataset.deleteRecipe));

  $('entryDate') && ($('entryDate').oninput = e => { state.ui.date = e.target.value; render(); });
  $('entryOutlet') && ($('entryOutlet').onchange = e => { state.ui.outlet = e.target.value; render(); });
  $('salesSearch') && ($('salesSearch').oninput = e => { state.ui.salesSearch = e.target.value; render(); });
  document.querySelectorAll('[data-adjust-sale]').forEach(b => b.onclick = () => adjustSale(b.dataset.adjustSale, Number(b.dataset.delta)));
  document.querySelectorAll('[data-save-sale]').forEach(b => b.onclick = () => saveSale(b.dataset.saveSale));
  $('saveMove') && ($('saveMove').onclick = saveMovement);
  $('saveCount') && ($('saveCount').onclick = saveCount);
  document.querySelectorAll('[data-delete-move]').forEach(b => b.onclick = () => removeRecord('movements', b.dataset.deleteMove));
  document.querySelectorAll('[data-delete-count]').forEach(b => b.onclick = () => removeRecord('counts', b.dataset.deleteCount));

  $('reportDate') && ($('reportDate').oninput = e => { state.ui.reportDate = e.target.value; render(); });
  $('reportOutlet') && ($('reportOutlet').onchange = e => { state.ui.reportOutlet = e.target.value; render(); });
  $('printReq') && ($('printReq').onclick = printRequisition);
}

async function saveSetupAndConnect(e){
  e.preventDefault();
  const payload = setupFormData();
  if(!configuredConfig(payload.firebaseConfig)) return alert('กรอกค่า Firebase ให้ครบก่อน');
  localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(payload));
  hydrateEffectiveSettings();
  status('บันทึกค่า Firebase ใน browser แล้ว กำลังเชื่อมต่อ...','warn');
  state.tab = 'settings';
  await connectFirebase();
}

async function testSetupConnection(){
  const payload = setupFormData();
  if(!configuredConfig(payload.firebaseConfig)) return alert('กรอกค่า Firebase ให้ครบก่อน');
  status('กำลังทดสอบการเชื่อมต่อ Firebase...','warn');
  let testApp = null;
  try {
    testApp = initializeApp(payload.firebaseConfig, `setup-test-${Date.now()}`);
    const testAuth = getAuth(testApp);
    getFirestore(testApp);
    await signInAnonymously(testAuth);
    status('ทดสอบผ่าน: Firebase และ Anonymous Auth ใช้งานได้','ok');
  } catch(err) {
    console.error(err);
    status(`ทดสอบไม่ผ่าน: ${err.message}`,'danger');
  } finally {
    if(testApp) { try { await deleteApp(testApp); } catch(_) {} }
  }
}

function downloadConfigFromWizard(){
  const payload = setupFormData();
  downloadTextFile('firebase-config.js', configJsText(payload.firebaseConfig, payload.appOptions), 'application/javascript;charset=utf-8');
  status('ดาวน์โหลด firebase-config.js แล้ว','ok');
}

async function clearStoredConfig(){
  if(!confirm('ต้องการล้างค่า Firebase ที่บันทึกไว้ใน browser นี้หรือไม่?')) return;
  localStorage.removeItem(CONFIG_STORAGE_KEY);
  hydrateEffectiveSettings();
  status('ล้างค่า browser/localStorage แล้ว','warn');
  await connectFirebase();
}

async function connectFirebase(){
  ready = false;
  currentUser = null;
  cleanup();
  if(authUnsub){ authUnsub(); authUnsub = null; }
  if(liveApp){ try { await deleteApp(liveApp); } catch(_) {} liveApp = null; }
  db = null; auth = null;
  render();
  if(!configured()){
    status('ยังไม่ได้ตั้งค่า Firebase — ใช้ Setup Wizard ด้านล่างได้เลย','warn');
    return;
  }
  try {
    liveApp = initializeApp(activeFirebaseConfig, `laya-live-${Date.now()}`);
    db = getFirestore(liveApp);
    auth = getAuth(liveApp);
    authUnsub = onAuthStateChanged(auth, async (user) => {
      if(user){
        currentUser = user;
        cleanup();
        ['liquors','recipes','sales','movements','counts'].forEach(n => unsubs.push(bindCollection(n)));
      } else {
        await signInAnonymously(auth);
      }
    });
  } catch(err) {
    console.error(err);
    status(`เชื่อม Firebase ไม่สำเร็จ: ${err.message}`,'danger');
  }
}

async function saveLiquor(e){
  e.preventDefault();
  const fd = new FormData(e.target);
  const id = state.ui.editingLiquor || `liquor_${Math.random().toString(36).slice(2,10)}`;
  const payload = { id, name: String(fd.get('name')||'').trim(), outlet: String(fd.get('outlet')||'Mangrove'), bottleSizeMl:num(fd.get('bottleSizeMl')), openingMl:num(fd.get('openingMl')), parBottles:num(fd.get('parBottles')), reorderBottles:num(fd.get('reorderBottles')), costPerBottle:num(fd.get('costPerBottle')), notes:String(fd.get('notes')||'').trim(), updatedAt:serverTimestamp() };
  if(!payload.name) return alert('กรอกชื่อเหล้า');
  if(!state.ui.editingLiquor) payload.createdAt = serverTimestamp();
  await setDoc(dRef('liquors', id), payload, { merge:true });
  state.ui.editingLiquor = null; status('บันทึกรายการเหล้าเรียบร้อย','ok');
}

function startRecipeEdit(id){
  const r = getRecipe(id); if(!r) return;
  state.ui.editingRecipe = id; state.ui.ingredients = (r.ingredients||[]).map(i => ({liquorId:i.liquorId, ml:i.ml})); if(!state.ui.ingredients.length) state.ui.ingredients=[{liquorId:'',ml:''}]; render();
}

async function saveRecipe(e){
  e.preventDefault();
  const fd = new FormData(e.target);
  const ingredients = state.ui.ingredients.map(i => ({liquorId:i.liquorId, ml:num(i.ml)})).filter(i => i.liquorId && i.ml>0);
  if(!ingredients.length) return alert('เพิ่มส่วนผสมอย่างน้อย 1 รายการ');
  const id = state.ui.editingRecipe || `recipe_${Math.random().toString(36).slice(2,10)}`;
  const payload = { id, name:String(fd.get('name')||'').trim(), outlet:String(fd.get('outlet')||'Mangrove'), type:String(fd.get('type')||'cocktail'), notes:String(fd.get('notes')||'').trim(), ingredients, updatedAt:serverTimestamp() };
  if(!payload.name) return alert('กรอกชื่อเมนู');
  if(!state.ui.editingRecipe) payload.createdAt = serverTimestamp();
  await setDoc(dRef('recipes', id), payload, { merge:true });
  state.ui.editingRecipe = null; state.ui.ingredients = [{liquorId:'',ml:''}]; status('บันทึกสูตรเรียบร้อย','ok');
}

function adjustSale(recipeId, delta){
  const input = $(`qty_${recipeId}`); if(!input) return;
  const next = Math.max(num(input.value)+delta,0);
  input.value = next || '';
}

async function saveSale(recipeId){
  const qty = num($(`qty_${recipeId}`)?.value);
  const r = getRecipe(recipeId); if(!r) return alert('ไม่พบสูตร');
  const id = saleId(state.ui.date, state.ui.outlet, recipeId);
  if(qty<=0) {
    await deleteDoc(dRef('sales', id));
    removeLocalById('sales', id);
    render();
    status(`ลบยอดขาย ${r.name} แล้ว`,'warn');
    return;
  }
  const record = { id, date:state.ui.date, outlet:state.ui.outlet, recipeId, recipeName:r.name, qty };
  await setDoc(dRef('sales', id), { ...record, updatedAt:serverTimestamp(), createdAt:serverTimestamp() }, { merge:true });
  upsertLocal('sales', record);
  render();
  status(`บันทึกยอดขาย ${r.name} = ${qty}`,'ok');
}

async function saveMovement(){
  const liquorId = $('moveLiquor').value, kind = $('moveKind').value, qtyMl = num($('moveQty').value), note = String($('moveNote').value||'').trim();
  if(!liquorId || qtyMl<=0) return alert('กรอก movement ให้ครบ');
  const id = moveId(state.ui.date, state.ui.outlet, liquorId, kind);
  const record = { id, date:state.ui.date, outlet:state.ui.outlet, liquorId, kind, qtyMl, note };
  await setDoc(dRef('movements', id), { ...record, updatedAt:serverTimestamp(), createdAt:serverTimestamp() }, { merge:true });
  upsertLocal('movements', record);
  $('moveQty').value=''; $('moveNote').value='';
  render();
  status('บันทึก movement แล้ว และคำนวณใหม่ทันที','ok');
}

async function saveCount(){
  const liquorId = $('countLiquor').value, actualMl = num($('countActual').value,-1);
  if(!liquorId || actualMl<0) return alert('กรอก actual count ให้ครบ');
  const id = countId(state.ui.date, state.ui.outlet, liquorId);
  const record = { id, date:state.ui.date, outlet:state.ui.outlet, liquorId, actualMl };
  await setDoc(dRef('counts', id), { ...record, updatedAt:serverTimestamp(), createdAt:serverTimestamp() }, { merge:true });
  upsertLocal('counts', record);
  $('countActual').value='';
  render();
  status('บันทึก actual count แล้ว และคำนวณใหม่ทันที','ok');
}

async function removeRecord(type,id){
  if(!confirm('ยืนยันการลบ?')) return;
  await deleteDoc(dRef(type,id));
  removeLocalById(type, id);
  render();
  status('ลบรายการแล้ว','warn');
}

function printRequisition(){
  const rep = summaryReport(state.ui.reportDate,state.ui.reportOutlet); const rows = rep.rows.filter(r=>r.gapMl>0.01);
  const win = window.open('', '_blank', 'width=1100,height=800');
  win.document.write(`<html><head><title>Par Requisition</title><style>body{font-family:Segoe UI,Tahoma,sans-serif;padding:24px;color:#172033}.head{display:flex;justify-content:space-between;gap:16px;border-bottom:2px solid #153b70;padding-bottom:10px;margin-bottom:14px}.hotel{font-size:1.25rem;font-weight:800;color:#153b70}table{width:100%;border-collapse:collapse}th,td{border:1px solid #d7dfeb;padding:10px;text-align:left}th{background:#f3f7ff}.sign{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;margin-top:40px}.box{padding-top:24px;border-top:1px solid #8ea2c0;text-align:center}</style></head><body><div class="head"><div><div class="hotel">Laya Resort Phuket</div><div>${esc(activeAppOptions.appName)}</div><div>Par Requisition Form</div></div><div><div><strong>Date:</strong> ${state.ui.reportDate}</div><div><strong>Outlet:</strong> ${esc(state.ui.reportOutlet)}</div></div></div><table><thead><tr><th>Liquor</th><th>Closing Base (ml)</th><th>Par (ml)</th><th>Gap (ml)</th><th>Suggested Refill (Bottle)</th></tr></thead><tbody>${rows.length?rows.map(r=>`<tr><td>${esc(r.liquor.name)}</td><td>${fmt(r.actual===null?r.theo:r.actual,0)}</td><td>${fmt(r.parMl,0)}</td><td>${fmt(r.gapMl,0)}</td><td>${fmt(r.refillBottles,2)}</td></tr>`).join(''):'<tr><td colspan="5">ไม่มีรายการต่ำกว่า Par</td></tr>'}</tbody></table><div class="sign"><div class="box">Prepared By</div><div class="box">Checked By</div><div class="box">Approved By</div></div></body></html>`);
  win.document.close(); win.focus(); win.print();
}

async function exportJson(){
  const blob = new Blob([JSON.stringify({tenantId:activeAppOptions.tenantId, exportedAt:new Date().toISOString(), data:state.data}, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`laya-liquor-firebase-export-${today}.json`; a.click(); URL.revokeObjectURL(url); status('ดาวน์โหลด JSON เรียบร้อย','ok');
}

async function seedDemoData(){
  if(!db) return alert('Firebase ยังไม่พร้อม');
  if(!confirm('โหลดข้อมูลตัวอย่างลง Firestore?')) return;
  const batch = writeBatch(db);
  const liquors = [
    {id:'demo_vodka',name:'Smirnoff',outlet:'Mangrove',bottleSizeMl:700,openingMl:2100,parBottles:4,reorderBottles:2,costPerBottle:420,notes:'Demo'},
    {id:'demo_gin',name:'Gordon\'s Gin',outlet:'Mangrove',bottleSizeMl:700,openingMl:1400,parBottles:3,reorderBottles:1,costPerBottle:480,notes:'Demo'},
    {id:'demo_tequila',name:'Jose Cuervo',outlet:'Mangrove',bottleSizeMl:700,openingMl:1400,parBottles:2,reorderBottles:1,costPerBottle:650,notes:'Demo'},
    {id:'demo_rum',name:'Bacardi',outlet:'The Taste',bottleSizeMl:700,openingMl:1400,parBottles:3,reorderBottles:1,costPerBottle:450,notes:'Demo'}
  ];
  const recipes = [
    {id:'demo_margarita',name:'Margarita',outlet:'Mangrove',type:'cocktail',notes:'Demo',ingredients:[{liquorId:'demo_tequila',ml:45}]},
    {id:'demo_vodka_shot',name:'Vodka Shot',outlet:'Mangrove',type:'shot',notes:'Demo',ingredients:[{liquorId:'demo_vodka',ml:30}]},
    {id:'demo_gintonic',name:'Gin Tonic',outlet:'Mangrove',type:'mixed drink',notes:'Demo',ingredients:[{liquorId:'demo_gin',ml:45}]},
    {id:'demo_mojito',name:'Mojito',outlet:'The Taste',type:'cocktail',notes:'Demo',ingredients:[{liquorId:'demo_rum',ml:45}]}
  ];
  liquors.forEach(x=>batch.set(dRef('liquors',x.id), {...x, createdAt:serverTimestamp(), updatedAt:serverTimestamp()}, {merge:true}));
  recipes.forEach(x=>batch.set(dRef('recipes',x.id), {...x, createdAt:serverTimestamp(), updatedAt:serverTimestamp()}, {merge:true}));
  batch.set(dRef('sales', saleId(today,'Mangrove','demo_margarita')), {id:saleId(today,'Mangrove','demo_margarita'), date:today, outlet:'Mangrove', recipeId:'demo_margarita', recipeName:'Margarita', qty:8, createdAt:serverTimestamp(), updatedAt:serverTimestamp()}, {merge:true});
  batch.set(dRef('sales', saleId(today,'Mangrove','demo_vodka_shot')), {id:saleId(today,'Mangrove','demo_vodka_shot'), date:today, outlet:'Mangrove', recipeId:'demo_vodka_shot', recipeName:'Vodka Shot', qty:6, createdAt:serverTimestamp(), updatedAt:serverTimestamp()}, {merge:true});
  batch.set(dRef('sales', saleId(today,'Mangrove','demo_gintonic')), {id:saleId(today,'Mangrove','demo_gintonic'), date:today, outlet:'Mangrove', recipeId:'demo_gintonic', recipeName:'Gin Tonic', qty:5, createdAt:serverTimestamp(), updatedAt:serverTimestamp()}, {merge:true});
  batch.set(dRef('movements', moveId(today,'Mangrove','demo_vodka','receive')), {id:moveId(today,'Mangrove','demo_vodka','receive'), date:today, outlet:'Mangrove', liquorId:'demo_vodka', kind:'receive', qtyMl:700, note:'Demo receive', createdAt:serverTimestamp(), updatedAt:serverTimestamp()}, {merge:true});
  batch.set(dRef('counts', countId(today,'Mangrove','demo_vodka')), {id:countId(today,'Mangrove','demo_vodka'), date:today, outlet:'Mangrove', liquorId:'demo_vodka', actualMl:2050, createdAt:serverTimestamp(), updatedAt:serverTimestamp()}, {merge:true});
  await batch.commit();
  status('โหลดข้อมูลตัวอย่างลง Firebase แล้ว','ok');
}

function mapSnap(snap){ return snap.docs.map(d => ({ id:d.id, ...d.data() })); }
function bindCollection(name){ return onSnapshot(cRef(name), snap => { state.data[name] = mapSnap(snap); ready = true; status(`เชื่อมต่อ Firebase แล้ว · Sync ล่าสุด ${new Date().toLocaleTimeString('th-TH')}`,'ok'); render(); }, err => { console.error(err); status(`เกิดปัญหากับ ${name}: ${err.message}`,'danger'); }); }
function cleanup(){ unsubs.forEach(fn => fn && fn()); unsubs = []; }

async function init(){
  bindBaseEvents();
  hydrateEffectiveSettings();
  render();
  await connectFirebase();
}

init();
