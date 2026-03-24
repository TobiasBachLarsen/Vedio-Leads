// ── LOGO ──────────────────────────────────────────────────────────────────────
document.getElementById('logo-img').src='/login.png';

// ── API ───────────────────────────────────────────────────────────────────────
const API=''; // Samme origin — server.js serverer frontend og API

// ── STATE ─────────────────────────────────────────────────────────────────────

// ICP scores + pipeline state + notes per CVR (in-memory, saved to storage)
let leadNotes={},leadTags={},leadFollowup={},leadAssigned={};
let leadContacts={};
let res=[],leads=[],lists=[{id:'all',name:'Alle leads'}],aList='all',aView='search';


let selCo=null,ckd=new Set(),sC='name',sD=1,techSel=new Set();
let sbOpen=true,isServerMode=false,apiTotal=0,apiFrom=0,apiProvider='datafordeler';
let currentUser=null,authToken='';

// ── AUTH HELPERS ─────────────────────────────────────────────────────────────
function ah(extra){return Object.assign({'Content-Type':'application/json'},authToken?{'Authorization':'Bearer '+authToken}:{},extra||{});}

function lsKey(k){return currentUser?`vl_${currentUser.id}_${k}`:`vl_${k}`;}

function showLogin(){
  document.getElementById('login-overlay').style.display='flex';
  document.getElementById('app').style.display='none';
  setTimeout(()=>document.getElementById('login-email').focus(),100);
}

function applyAvatarToEl(el, user){
  if(!el)return;
  if(user.avatar){
    el.innerHTML='<img src="'+user.avatar+'" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block">';
    el.style.background='transparent';
    el.style.fontSize='0';
  } else {
    el.innerHTML='';
    const initials=user.name.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase();
    el.textContent=initials;
    el.style.background='#fff';
    el.style.fontSize='';
  }
}

function showApp(){
  document.getElementById('login-overlay').style.display='none';
  document.getElementById('app').style.display='flex';
  if(currentUser){
    const up=document.getElementById('user-profile');
    const av=document.getElementById('user-avatar');
    const nm=document.getElementById('user-name');
    if(up)up.style.display='block';
    applyAvatarToEl(av,currentUser);
    if(nm)nm.textContent=currentUser.name;
  }
}

async function doLogin(){
  const email=document.getElementById('login-email').value.trim().toLowerCase();
  const pw=document.getElementById('login-pw').value;
  const errEl=document.getElementById('login-err');
  errEl.style.display='none';
  if(!email||!pw){errEl.textContent='Udfyld email og adgangskode';errEl.style.display='block';return;}
  try{
    const r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:pw})});
    const d=await r.json();
    if(r.ok){
      authToken=d.token;currentUser=d.user;
      localStorage.setItem('vl_token',authToken);
      showApp();await loadUserState();sv('search');
      setTimeout(()=>{['q','q-ex','f-ci','f-cx','qs'].forEach(id=>{const el=document.getElementById(id);if(el)el.addEventListener('input',debounce(applyF,350));});},80);
      return;
    }
    errEl.textContent=d.error||'Forkert email eller adgangskode';errEl.style.display='block';
  }catch(err){errEl.textContent='Kunne ikke forbinde til serveren';errEl.style.display='block';}
}

async function logout(){
  if(isServerMode){try{await fetch('/api/auth/logout',{method:'POST',headers:ah()});}catch(e){}}
  authToken='';currentUser=null;
  localStorage.removeItem('vl_token');
  localStorage.removeItem('vl_current_user');
  leadNotes={};leadTags={};leadFollowup={};
  leadContacts={};
  leads=[];lists=[{id:'all',name:'Alle leads'}];
  showLogin();
}

async function loadUserState(){
  try{
    const d=await fetch('/api/leads',{headers:ah()}).then(r=>r.json());
    leads=d.leads||[];
    lists=[{id:'all',name:'Alle leads'},...(d.lists||[]).filter(l=>l.id!=='all')];
  }catch(e){}
  // Per-user localStorage meta
  try{
    const nt=localStorage.getItem(lsKey('notes'));
    const tg=localStorage.getItem(lsKey('tags'));
    const fu=localStorage.getItem(lsKey('fu'));
    const ct=localStorage.getItem(lsKey('contacts'));
    if(nt)leadNotes=JSON.parse(nt);
    if(tg)leadTags=JSON.parse(tg);
    if(fu)leadFollowup=JSON.parse(fu);
    if(ct)leadContacts=JSON.parse(ct);
  }catch(e){}
  rSB();applyF();
}

(async()=>{
  // Detect if running via server
  try{
    const status=await fetch('/api/status');
    const sd=await status.json().catch(()=>null);
    if(status.ok && sd && sd.status){
      isServerMode=true;
      apiProvider=sd.provider||'datafordeler';
      // Try stored token
      const storedToken=localStorage.getItem('vl_token');
      if(storedToken){
        const me=await fetch('/api/auth/me',{headers:{'Authorization':'Bearer '+storedToken}});
        if(me.ok){
          authToken=storedToken;
          currentUser=await me.json();
          showApp();
          await loadUserState();
          sv('search');
          setTimeout(()=>{
            ['q','q-ex','f-ci','f-cx','qs'].forEach(id=>{const el=document.getElementById(id);if(el)el.addEventListener('input',debounce(applyF,350));});
          },80);
          return;
        } else {
          localStorage.removeItem('vl_token');
        }
      }
      showLogin();return;
    }
  }catch(e){}
  showLogin();
})();

function debounce(fn,ms){let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),ms);};}

async function save(){
  try{
    localStorage.setItem(lsKey('notes'),JSON.stringify(leadNotes));
    localStorage.setItem(lsKey('tags'),JSON.stringify(leadTags));
    localStorage.setItem(lsKey('fu'),JSON.stringify(leadFollowup));
    localStorage.setItem(lsKey('contacts'),JSON.stringify(leadContacts));
    if(!isServerMode){
      localStorage.setItem('vl_l',JSON.stringify(leads));
      localStorage.setItem('vl_ls',JSON.stringify(lists));
    }
  }catch(e){}
}

// ── FILTERS + LIVE SEARCH ────────────────────────────────────────────────────
async function applyF(fromOffset=0){
  const q=(document.getElementById('q').value||document.getElementById('qs').value||'').trim();
  const branche=document.getElementById('f-b').value,form=document.getElementById('f-form').value;
  const fe1=document.getElementById('fe1').value,fe2=document.getElementById('fe2').value;
  const fy1=document.getElementById('fy1').value,fy2=document.getElementById('fy2').value;
  const fam=document.getElementById('fam').value,faM=document.getElementById('faM').value;
  const ci=document.getElementById('f-ci').value.trim();
  const cx=document.getElementById('f-cx').value.toLowerCase().trim();
  const fzm=document.getElementById('fzm').value,fzM=document.getElementById('fzM').value;
  const needEm=false,needPh=false,needSoc=false,needVid=false;
  const qex=(document.getElementById('q-ex').value||'').trim().toLowerCase();
  const adProtect=['alle','skjul','kun'].find(k=>document.getElementById('rk-'+k)?.classList.contains('on'))||'alle';

  // Server mode: søgning kræver branche eller mindst 2 tegn
  const hasAnyFilter = branche||form||ci||fzm||fam||faM||fy1||fy2||qex;
  const canServerSearch = isServerMode && (q.length>=2 || !!branche);

  // Tom søgning i server mode — vis intro-tilstand, ikke demo-data
  if(isServerMode && q.length<2 && !hasAnyFilter){
    res=[];apiTotal=0;apiFrom=0;
    clearApiError();
    document.getElementById('tbody').innerHTML=`<tr><td colspan="11" style="text-align:center;padding:70px 20px;color:var(--gray2)">
      <div style="font-size:28px;margin-bottom:12px"></div>
      <div style="font-size:14px;font-weight:600;color:var(--pdarker);margin-bottom:6px">Søg efter virksomheder</div>
      <div style="font-size:12px">Skriv mindst 2 tegn i søgefeltet — navn, CVR eller branche</div>
    </td></tr>`;
    document.getElementById('thead').innerHTML='';
    const lmw=document.getElementById('load-more-wrap');if(lmw)lmw.style.display='none';
    const sb=document.getElementById('stbar');if(sb)sb.innerHTML='';
    return;
  }

  if(canServerSearch){
    setLoading(true);
    const params=new URLSearchParams();
    if(q)params.set('q',q);
    if(branche)params.set('branche',branche);
    if(form)params.set('form',form);
    if(ci)params.set('city',ci);
    if(fzm)params.set('zip',fzm);
    if(fe1)params.set('empMin',fe1);if(fe2)params.set('empMax',fe2);
    if(fy1)params.set('foundedFrom',fy1);if(fy2)params.set('foundedTo',fy2);
    if(needEm)params.set('hasEmail','true');if(needPh)params.set('hasPhone','true');
    if(adProtect!=='alle')params.set('adProtect',adProtect);
    params.set('from',fromOffset);
    params.set('size','500');
    try{
      const r=await fetch(`/api/search?${params}`);
      const data=await r.json();
      if(!r.ok){
        showApiError(data.error||'Søgning fejlede',data.code);
        setLoading(false);
        localFilter(q,qex,form,branche,fe1,fe2,fy1,fy2,ci,cx,fzm,fzM,needEm,needPh,needSoc,needVid,adProtect);
        return;
      }
      clearApiError();
      // Opdater aktiv provider fra søgesvaret
      if(data.provider)apiProvider=data.provider+(data.fallback?' fallback':'');
      let co=data.companies||[];
      apiTotal=data.total||co.length;
      apiFrom=fromOffset;

      // Client-side efterfiltrering (uanset provider)
      if(qex)co=co.filter(c=>!c.name.toLowerCase().includes(qex)&&!(c.industry||'').toLowerCase().includes(qex));
      if(cx)co=co.filter(c=>!(c.city||'').toLowerCase().includes(cx));
      if(fzM)co=co.filter(c=>+c.zip<=+fzM);
      if(needSoc)co=co.filter(c=>c.ig||c.fb||c.tt||c.li);
      if(needVid)co=co.filter(c=>c.ig||c.tt);
      if(techSel.size>0)co=co.filter(c=>[...techSel].some(t=>(c.tech||[]).includes(t)));

      const mapC=c=>({...c,
        ic:c.industryCode||c.ic||'',ind:c.industry||c.ind||'',
        emp:c.employeeCount||c.emp||0,emps:c.employees||c.emps||'',
        ph:c.phone||c.ph||'',em:c.email||c.em||'',
        addr:c.address||c.addr||'',st:c.status||c.st||'active',yr:c.founded||c.yr||'',
        ageM:c.ageM||0,eq:c.equity||c.eq||0,omsaetning:c.revenue||c.omsaetning||0,
        bf:c.grossProfit||c.bf||0,res:c.result||c.res||0,
        ig:c.ig||'',fb:c.fb||'',tt:c.tt||'',li:c.li||'',tech:c.tech||[],
      });
      const mapped=co.map(mapC);
      // Merge lokale leads der matcher søgningen (vises altid uanset API)
      const ql2=(q||'').toLowerCase();
      const localMatches=leads.filter(l=>{
        if(mapped.find(x=>x.cvr===l.cvr))return false; // allerede i API-resultater
        if(q&&!(l.name?.toLowerCase().includes(ql2)||l.cvr?.includes(q)||l.city?.toLowerCase().includes(ql2)))return false;
        if(qex&&l.name?.toLowerCase().includes(qex))return false;
        return true;
      }).map(mapC);
      if(fromOffset>0){res=[...res,...mapped,...localMatches];}else{res=[...mapped,...localMatches];}
    }catch(err){
      showApiError('Netværksfejl: '+err.message);
      setLoading(false);
      localFilter(q,qex,form,branche,fe1,fe2,fy1,fy2,ci,cx,fzm,fzM,needEm,needPh,needSoc,needVid,adProtect);
      return;
    }
    setLoading(false);
  } else {
    localFilter(q,qex,form,branche,fe1,fe2,fy1,fy2,ci,cx,fzm,fzM,needEm,needPh,needSoc,needVid,adProtect);
    return;
  }
  sortR();render();
}

function localFilter(){
  apiTotal=0;apiFrom=0;
  res=[];sortR();render();
}

async function loadMore(){
  const btn=document.getElementById('load-more-btn');
  btn.disabled=true;btn.textContent='Indlæser…';
  await applyF(apiFrom+res.length);
  btn.disabled=false;btn.textContent='Indlæs flere resultater';
}

function setLoading(on){
  const sb=document.getElementById('stbar');
  if(on){sb.innerHTML='<span style="color:var(--gray2)">Søger…</span>';}
}

function showApiError(msg,code){
  let html=`<span style="color:var(--red);font-weight:600">${e(msg)}</span>`;
  let errDiv=document.getElementById('api-error-bar');
  if(!errDiv){
    errDiv=document.createElement('div');
    errDiv.id='api-error-bar';
    errDiv.style.cssText='padding:6px 12px;background:#fee2e2;border-bottom:1px solid #fca5a5;font-size:11.5px;display:flex;align-items:center;gap:8px';
    const stbar=document.getElementById('stbar');
    stbar.parentNode.insertBefore(errDiv,stbar.nextSibling);
  }
  errDiv.innerHTML=html+`<span onclick="clearApiError()" style="margin-left:auto;cursor:pointer;color:var(--gray2);font-size:14px">✕</span>`;
  errDiv.style.display='flex';
}

function clearApiError(){
  const el=document.getElementById('api-error-bar');
  if(el)el.style.display='none';
}

function setRk(v){['alle','skjul','kun'].forEach(k=>document.getElementById('rk-'+k).classList.toggle('on',k===v));applyF();}
function tChipTech(el,name){techSel.has(name)?(techSel.delete(name),el.classList.remove('on')):(techSel.add(name),el.classList.add('on'));applyF();}
function resetF(){
  ['q','q-ex','f-ci','f-cx','qs','fe1','fe2','fy1','fy2','f-eq','f-res','fam','faM','fzm','fzM'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('f-form').value='';document.getElementById('f-b').value='';
  techSel.clear();
  document.querySelectorAll('.chip').forEach(c=>c.classList.remove('on'));
  setRk('alle');applyF();
}

function togAcc(id){
  const b=document.getElementById('acc-'+id),a=document.getElementById('arr-'+id);
  const o=b.classList.toggle('open');a.classList.toggle('open',o);
}

// ── SORT + RENDER ──────────────────────────────────────────────────────────────
function sortR(){
  res.sort((a,b)=>{
    const av=sC==='emp'?a.emp:sC==='eq'?a.eq:sC==='omsaetning'?a.omsaetning:(a[sC]||'');
    const bv=sC==='emp'?b.emp:sC==='eq'?b.eq:sC==='omsaetning'?b.omsaetning:(b[sC]||'');
    return av<bv?-sD:av>bv?sD:0;
  });
}
function setSort(c){sC===c?sD*=-1:(sC=c,sD=1);sortR();render();}
function si(k){return`<span style="opacity:${sC===k?1:.3};font-size:9px;margin-left:2px">${sC===k?(sD>0?'▲':'▼'):'⇅'}</span>`;}
function render(){if(aView==='search')rTbl();else rLeads();}

function sv(v){
  aView=v;
  document.getElementById('nv-s').classList.toggle('on',v==='search');
  document.getElementById('nv-l').classList.toggle('on',v==='leads');

  selCo=null;hdDp();ckd.clear();upSel();
  const bw=document.querySelector('.body-wrap');
  const tb=document.querySelector('.toolbar');
  const sb=document.getElementById('stbar');
  const selb=document.getElementById('selbar');
  bw.style.display='';tb.style.display='';sb.style.display='';if(selb)selb.style.display='';
  const isLeads=v==='leads';
  document.getElementById('sb-lists').style.display='none';
  document.getElementById('sb-footer').style.display='none';
  document.getElementById('leads-list-bar').style.display=isLeads?'':'none';
  rSB();render();
}




function showToast(msg,dur=2500){
  let t=document.getElementById('toast-msg');
  if(!t){t=document.createElement('div');t.id='toast-msg';t.style.cssText='position:fixed;bottom:24px;right:24px;background:var(--pdarker);color:#fff;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:600;z-index:9999;transition:opacity .3s';document.body.appendChild(t);}
  t.textContent=msg;t.style.opacity='1';
  clearTimeout(t._t);t._t=setTimeout(()=>{t.style.opacity='0';},dur);
}



// ── TABLE ─────────────────────────────────────────────────────────────────────
function rTbl(){
  document.getElementById('thead').innerHTML=`<tr>
    <th style="width:28px"><input type="checkbox" class="cb" onchange="togAll(this)"></th>
    <th class="sort${sC==='name'?' sorted':''}" style="width:20%" onclick="setSort('name')">Virksomhed ${si('name')}</th>
    <th style="width:72px">CVR</th>
    <th style="width:12%">Hjemmeside</th>
    <th style="width:90px">Tlf-nr</th>
    <th style="width:14%">E-mail</th>
    <th class="sort${sC==='city'?' sorted':''}" style="width:8%" onclick="setSort('city')">By ${si('city')}</th>
    <th class="sort${sC==='emp'?' sorted':''}" style="width:42px" onclick="setSort('emp')">Ans. ${si('emp')}</th>
    <th class="sort${sC==='omsaetning'?' sorted':''}" style="width:78px" onclick="setSort('omsaetning')">Omsætning ${si('omsaetning')}</th>
    <th class="sort${sC==='ind'?' sorted':''}" style="width:14%" onclick="setSort('ind')">Branche ${si('ind')}</th>
    <th style="width:50px"></th>
  </tr>`;

  document.getElementById('tbody').innerHTML=res.map(c=>{
    return`<tr data-cvr="${c.cvr}" class="${selCo?.cvr===c.cvr?'sel':''} ${ckd.has(c.cvr)?'chk':''}">
      <td onclick="event.stopPropagation()"><input type="checkbox" class="cb" ${ckd.has(c.cvr)?'checked':''} onchange="togCk('${c.cvr}',this.checked)"></td>
      <td><span class="co-name" title="${e(c.name)}">${trunc(e(c.name),22)}</span></td>
      <td style="font-family:monospace;font-size:11px;color:var(--gray2)">${c.cvr}</td>
      <td>${c.web?`<a href="https://${c.web}" target="_blank" style="color:var(--p1);text-decoration:none;font-size:11px">${c.web}</a>`:'<span style="color:var(--gray2);font-size:11px">—</span>'}</td>
      <td>${c.ph?`<a href="tel:${c.ph}" style="color:var(--p1);text-decoration:none;font-size:11px">${fp(c.ph)}</a>`:'<span style="color:var(--gray2);font-size:11px">—</span>'}</td>
      <td>${c.em?`<a href="mailto:${c.em}" style="color:var(--p1);text-decoration:none;font-size:11px">${c.em}</a>`:'<span style="color:var(--gray2);font-size:11px">—</span>'}</td>
      <td style="color:var(--gray)">${c.city}</td>
      <td style="color:var(--gray)">${c.emps}</td>
      <td style="font-weight:600;font-size:11.5px;color:${c.omsaetning>0?'var(--pdarker)':'var(--gray2)'}">${fmtKr(c.omsaetning)}</td>
      <td style="color:var(--gray);font-size:11.5px" title="${e(c.ind)}">${trunc(c.ind,18)}</td>
      <td onclick="event.stopPropagation()">
        <div style="display:flex;gap:3px;align-items:center">
          ${isL(c.cvr)?'<button class="ib added" title="I leads">✓</button>':`<button class="ib" onclick="showListPicker(['${c.cvr}'])" title="Tilføj lead">+</button>`}
          <button class="ib" onclick="selC('${c.cvr}')" title="Detaljer">→</button>
        </div>
      </td>
    </tr>`;
  }).join('');

  document.getElementById('tbody').onclick=ev=>{
    const tr=ev.target.closest('tr[data-cvr]');
    if(tr&&!ev.target.closest('td:last-child')&&ev.target.tagName!=='INPUT')selC(tr.dataset.cvr);
  };
  rStb();upSel();
}

function rLeads(){
  const vis=aList==='all'?leads:leads.filter(l=>l.listId===aList);
  if(!vis.length){
    document.getElementById('thead').innerHTML='';
    document.getElementById('tbody').innerHTML=`<tr><td colspan="12" style="text-align:center;padding:60px;color:var(--gray2)">Ingen leads endnu — gå til Søg og tilføj virksomheder</td></tr>`;
    rStb();return;
  }
  document.getElementById('thead').innerHTML=`<tr>
    <th style="width:28px"><input type="checkbox" class="cb" onchange="togAll(this)"></th>
    <th class="sort${sC==='name'?' sorted':''}" style="width:20%" onclick="setSort('name')">Virksomhed ${si('name')}</th>
    <th style="width:72px">CVR</th>
    <th style="width:12%">Hjemmeside</th>
    <th style="width:90px">Tlf-nr</th>
    <th style="width:14%">E-mail</th>
    <th class="sort${sC==='city'?' sorted':''}" style="width:8%" onclick="setSort('city')">By ${si('city')}</th>
    <th class="sort${sC==='emp'?' sorted':''}" style="width:42px" onclick="setSort('emp')">Ans. ${si('emp')}</th>
    <th class="sort${sC==='omsaetning'?' sorted':''}" style="width:78px" onclick="setSort('omsaetning')">Omsætning ${si('omsaetning')}</th>
    <th class="sort${sC==='ind'?' sorted':''}" style="width:14%" onclick="setSort('ind')">Branche ${si('ind')}</th>
    <th style="width:75px">Tilføjet</th>
    <th style="width:36px"></th>
  </tr>`;
  document.getElementById('tbody').innerHTML=vis.map(c=>{
    return`<tr data-cvr="${c.cvr}" class="${selCo?.cvr===c.cvr?'sel':''} ${ckd.has(c.cvr)?'chk':''}">
      <td onclick="event.stopPropagation()"><input type="checkbox" class="cb" ${ckd.has(c.cvr)?'checked':''} onchange="togCk('${c.cvr}',this.checked)"></td>
      <td><span class="co-name">${trunc(e(c.name),22)}</span></td>
      <td style="font-family:monospace;font-size:11px;color:var(--gray2)">${c.cvr}</td>
      <td>${c.web?`<a href="https://${c.web}" target="_blank" style="color:var(--p1);text-decoration:none;font-size:11px">${c.web}</a>`:'<span style="color:var(--gray2);font-size:11px">—</span>'}</td>
      <td>${c.ph?`<a href="tel:${c.ph}" style="color:var(--p1);text-decoration:none;font-size:11px">${fp(c.ph)}</a>`:'<span style="color:var(--gray2);font-size:11px">—</span>'}</td>
      <td>${c.em?`<a href="mailto:${c.em}" style="color:var(--p1);text-decoration:none;font-size:11px">${c.em}</a>`:'<span style="color:var(--gray2);font-size:11px">—</span>'}</td>
      <td style="color:var(--gray)">${c.city}</td>
      <td style="color:var(--gray)">${c.emps}</td>
      <td style="font-weight:600;font-size:11.5px;color:${c.omsaetning>0?'var(--pdarker)':'var(--gray2)'}">${fmtKr(c.omsaetning)}</td>
      <td style="color:var(--gray);font-size:11.5px" title="${e(c.ind)}">${trunc(c.ind,18)||'—'}</td>
      <td style="color:var(--gray2);font-size:11px">${c.addedAt?new Date(c.addedAt).toLocaleDateString('da-DK'):'—'}</td>
      <td onclick="event.stopPropagation()"><button class="ib rm" onclick="remL('${c.cvr}')" title="Fjern">✕</button></td>
    </tr>`;
  }).join('');
  document.getElementById('tbody').onclick=ev=>{
    const tr=ev.target.closest('tr[data-cvr]');
    if(tr&&!ev.target.closest('td:last-child')&&ev.target.tagName!=='INPUT')selLD(tr.dataset.cvr);
  };
  rStb();upSel();
}

function stageClass(s){return{
  // Legacy stages
  'Ny':'s-new','Kvalificeret':'s-qual','I dialog':'s-dialog','Tilbud':'s-prop','Forhandling':'s-prop','Vundet':'s-won','Tabt':'s-lost',
  // SDR stages
  'Kontaktet':'s-dialog','Møde booket':'s-prop','Ikke interesseret':'s-lost',
  // AE stages
  'Demo Booket':'s-new','Tilbud sendt':'s-dialog'
}[s]||'s-new';}

function rStb(){
  const sb=document.getElementById('stbar');
  if(aView==='leads'){const vis=aList==='all'?leads:leads.filter(l=>l.listId===aList);sb.innerHTML=`<span class="hi">${vis.length}</span> leads`;return;}
  const hp=res.filter(r=>r.ph||r.phone).length,inL=res.filter(r=>isL(r.cvr)).length;
  const totalLabel=apiTotal>0&&apiTotal>res.length
    ?`<span class="hi">${res.length}</span> af <span class="hi">${apiTotal.toLocaleString('da-DK')}</span>`
    :`<span class="hi">${res.length}</span>`;
  sb.innerHTML=`${totalLabel} virksomheder &nbsp;·&nbsp; ${hp} har tlf. &nbsp;·&nbsp; ${inL} i leads`;

  // Vis "Indlæs flere" knap hvis API har flere resultater
  const lmw=document.getElementById('load-more-wrap');
  const lmi=document.getElementById('load-more-info');
  if(lmw&&isServerMode&&apiTotal>res.length&&aView==='search'){
    lmw.style.display='block';
    if(lmi)lmi.textContent=`(${res.length} af ${apiTotal.toLocaleString('da-DK')} indlæst)`;
  }else if(lmw){lmw.style.display='none';}
}

// ── DETAIL PANEL ───────────────────────────────────────────────────────────────
function selC(cvr){const c=res.find(x=>x.cvr===cvr);if(!c)return;selCo=c;rTbl();showDp(c);}
function selLD(cvr){const c=leads.find(x=>x.cvr===cvr);if(!c)return;selCo=c;rLeads();showDp(c);}
function hdDp(){
  document.getElementById('dp').classList.add('h');
  selCo=null;
}

function showDp(c){
  const dp=document.getElementById('dp');dp.classList.remove('h');
  const inL=isL(c.cvr);
  const notes=leadNotes[c.cvr]||'';
  const tags=(leadTags[c.cvr]||[]);
  const _pool=res.length>0?res:leads;
  const mxO=Math.max(..._pool.map(d=>d.omsaetning||0),1);
  const mxB=Math.max(..._pool.map(d=>Math.max(d.bf||0,0)),1);
  const mxE=Math.max(..._pool.map(d=>Math.max(d.eq||0,0)),1);

  dp.innerHTML=`
    <div class="dp-head">
      <div>
        <div class="dp-name">${e(c.name)}</div>
        <div class="dp-cvr">CVR ${c.cvr} · ${c.form}</div>
      </div>
      <span class="dp-close" onclick="hdDp()">×</span>
    </div>
    <div class="dp-tabs">
      <div class="dp-tab on" data-tab="info">Info</div>
      <div class="dp-tab" data-tab="contacts">Personer</div>
    </div>

    <!-- INFO TAB -->
    <div class="dp-body on" id="tab-info">
      <div class="dp-stat-grid">
        <div class="dp-stat"><div class="dp-stat-l">Stiftet</div><div class="dp-stat-v">${c.yr}</div></div>
        <div class="dp-stat"><div class="dp-stat-l">Ansatte</div><div class="dp-stat-v">${c.emps}</div></div>
        <div class="dp-stat"><div class="dp-stat-l">Alder</div><div class="dp-stat-v">${Math.floor(c.ageM/12)} år</div></div>
        <div class="dp-stat"><div class="dp-stat-l">Status</div><div class="dp-stat-v"><span class="pill ${c.st==='active'?'pill-active':'pill-inactive'}">${c.st==='active'?'Aktiv':'Inaktiv'}</span></div></div>
      </div>
      ${(c.contactName||c.contactTitle)?`<div style="background:var(--p7);border:1px solid var(--border);border-radius:8px;padding:9px 12px;margin-bottom:6px;display:flex;align-items:center;gap:10px">
        <div style="width:30px;height:30px;border-radius:50%;background:var(--p3);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#fff;flex-shrink:0">${(c.contactName||'?')[0].toUpperCase()}</div>
        <div>
          <div style="font-size:12.5px;font-weight:700;color:var(--pdarker)">${e(c.contactName||'—')}</div>
          ${c.contactTitle?`<div style="font-size:10.5px;color:var(--gray)">${e(c.contactTitle)}</div>`:''}
        </div>
      </div>`:''}
      <div class="dp-row"><span class="dp-k">Adresse</span><span class="dp-v">${[c.addr,c.zip,c.city].filter(Boolean).join(', ')||'—'}</span></div>
      <div class="dp-row"><span class="dp-k">Branche</span><span class="dp-v">${c.ind||'—'}</span></div>
      <div class="dp-row"><span class="dp-k">Telefon</span><span class="dp-v">${c.ph?`<a href="tel:${c.ph}">${fp(c.ph)}</a>`:'<span style="color:var(--gray2);font-size:11px">Ikke udfyldt</span>'}</span></div>
      <div class="dp-row"><span class="dp-k">Email</span><span class="dp-v">${c.em?`<a href="mailto:${c.em}">${c.em}</a>`:'<span style="color:var(--gray2);font-size:11px">Ikke udfyldt</span>'}</span></div>
      <div class="dp-row"><span class="dp-k">Website</span><span class="dp-v">${c.web?`<a href="https://${c.web}" target="_blank">${c.web}</a>`:'<span style="color:var(--gray2);font-size:11px">Ikke udfyldt</span>'}</span></div>
      ${c.tech&&c.tech.length?`<div class="dp-row"><span class="dp-k">Teknologi</span><span class="dp-v" style="font-size:10.5px">${c.tech.join(', ')}</span></div>`:''}
      <div style="margin-top:10px;display:flex;flex-direction:column;gap:5px">
        ${inL?`
          <button class="btn btn-sm" style="width:100%;justify-content:center;gap:6px" onclick="openEditLead('${c.cvr}')">Rediger oplysninger</button>
          <button class="btn" style="width:100%;justify-content:center;color:var(--green);border-color:rgba(22,163,74,.3)" disabled>✓ Allerede i leads</button>
          <button class="btn btn-danger btn-sm" style="width:100%;justify-content:center" onclick="remL('${c.cvr}')">Fjern fra leads</button>`
          :`<button class="btn btn-primary" style="width:100%;justify-content:center" onclick="showListPicker(['${c.cvr}'])">+ Tilføj til leads</button>`}
      </div>
      <a style="display:block;text-align:center;font-size:10.5px;color:var(--gray2);padding:7px;cursor:pointer" onclick="alert('Åbner Virk.dk i server-versionen')">Åbn på Virk.dk →</a>
    </div>

    <!-- PERSONER TAB -->
    <div class="dp-body" id="tab-contacts">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <div class="dp-section" style="margin:0">Registrerede personer</div>
        <button class="btn btn-primary btn-sm" onclick="toggleContactForm('${c.cvr}')">＋ Tilføj</button>
      </div>

      ${(c.directors||[]).length>0?`
      <div style="margin-bottom:12px">
        <div style="font-size:10px;font-weight:700;color:var(--gray2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Fra CVR-registret</div>
        ${c.directors.map(d=>`
          <div class="contact-card" style="border-color:var(--p5);background:var(--p7)">
            <div class="contact-av" style="background:var(--p1)">${(d.name||'?').split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase()}</div>
            <div style="flex:1;min-width:0">
              <div style="font-size:12.5px;font-weight:700;color:var(--pdarker)">${e(d.name||'')}</div>
              <div style="font-size:11px;color:var(--gray)">${e(d.title||'Direktør')}</div>
            </div>
            <span style="font-size:9px;color:var(--gray2);background:var(--p6);padding:2px 6px;border-radius:4px;white-space:nowrap">CVR</span>
          </div>`).join('')}
      </div>`:''}

      <div id="contact-form-${c.cvr}" class="contact-form" style="display:none">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
          <input class="contact-inp" id="cf-name" placeholder="Navn *">
          <input class="contact-inp" id="cf-title" placeholder="Stilling / titel">
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
          <input class="contact-inp" id="cf-phone" placeholder="Telefon">
          <input class="contact-inp" id="cf-email" type="email" placeholder="Email">
        </div>
        <input class="contact-inp" id="cf-linkedin" placeholder="LinkedIn URL">
        <div style="display:flex;gap:6px;justify-content:flex-end">
          <button class="btn btn-sm" onclick="toggleContactForm('${c.cvr}')">Annuller</button>
          <button class="btn btn-primary btn-sm" onclick="saveContact('${c.cvr}')">Gem person</button>
        </div>
      </div>

      ${(leadContacts[c.cvr]||[]).length>0?`<div style="font-size:10px;font-weight:700;color:var(--gray2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Manuelt tilføjede</div>`:''}
      <div id="contacts-list-${c.cvr}">
        ${(leadContacts[c.cvr]||[]).map(ct=>`
            <div class="contact-card" id="cc-${ct.id}">
              <div class="contact-av" style="background:${ct.color||'var(--p3)'}">${(ct.name||'?').split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase()}</div>
              <div style="flex:1;min-width:0">
                <div style="font-size:12.5px;font-weight:700;color:var(--pdarker)">${e(ct.name||'')}</div>
                ${ct.title?`<div style="font-size:11px;color:var(--gray)">${e(ct.title)}</div>`:''}
                <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:4px">
                  ${ct.phone?`<a href="tel:${ct.phone}" style="font-size:11px;color:var(--p1);text-decoration:none">${e(ct.phone)}</a>`:''}
                  ${ct.email?`<a href="mailto:${ct.email}" style="font-size:11px;color:var(--p1);text-decoration:none">${e(ct.email)}</a>`:''}
                  ${ct.linkedin?`<a href="${ct.linkedin}" target="_blank" style="font-size:11px;color:var(--p1);text-decoration:none">in LinkedIn</a>`:''}
                </div>
              </div>
              <span class="contact-del" onclick="removeContact('${c.cvr}','${ct.id}')" title="Fjern">×</span>
            </div>`).join('')}
      </div>
    </div>


  `;

  // Tab click handlers
  dp.querySelectorAll('.dp-tab').forEach(t=>t.addEventListener('click',()=>showTab(t.dataset.tab||t.textContent.trim().toLowerCase())));
}

function showTab(id){
  document.querySelectorAll('.dp-tab').forEach((t,i)=>t.classList.toggle('on',['info','contacts'][i]===id));
  document.querySelectorAll('.dp-body').forEach(b=>b.classList.remove('on'));
  document.getElementById('tab-'+id).classList.add('on');
}

async function setNote(cvr,note){leadNotes[cvr]=note;await save();}
async function addTag(ev,cvr){
  if(ev.key==='Enter'){
    const v=ev.target.value.trim();if(!v)return;
    leadTags[cvr]=[...(leadTags[cvr]||[]).filter(t=>t!==v),v];
    await save();ev.target.value='';showDp(selCo);
  }
}
async function removeTag(cvr,tag){leadTags[cvr]=(leadTags[cvr]||[]).filter(t=>t!==tag);await save();showDp(selCo);}

// ── LEADS ─────────────────────────────────────────────────────────────────────
function isL(cvr){return leads.some(l=>l.cvr===cvr);}
async function qAdd(cvr,listId){
  const c=[...res,...leads].find(x=>x.cvr===cvr);if(!c||isL(cvr))return;
  const lid=listId||(aList==='all'?'ungrouped':aList);
  const lead={...c,listId:lid,addedAt:new Date().toISOString()};
  if(isServerMode){
    try{await fetch('/api/leads',{method:'POST',headers:ah(),body:JSON.stringify({company:lead,listId:lid})});}catch(e){}
  }
  leads.push(lead);
  await save();rSB();render();if(selCo?.cvr===cvr)showDp(leads.find(l=>l.cvr===cvr)||c);
}
function showListPicker(cvrs){
  // cvrs: array of CVR strings to add
  const toAdd=cvrs.filter(c=>!isL(c));
  if(!toAdd.length){alert('Alle valgte er allerede i leads');return;}
  const bg=document.createElement('div');bg.className='modal-bg';bg.id='list-picker-bg';
  bg.innerHTML=`<div class="modal" style="width:320px">
    <h3>Tilføj ${toAdd.length} til liste</h3>
    <p>Vælg hvilken liste de skal tilføjes til:</p>
    <div style="display:flex;flex-direction:column;gap:6px" id="lp-lists">
      ${lists.map(l=>`<button class="btn btn-sm" style="justify-content:flex-start;padding:10px 14px;font-size:13px" onclick="doListAdd('${l.id}')">${e(l.name)}</button>`).join('')}
      <button class="btn btn-sm" style="justify-content:flex-start;padding:10px 14px;font-size:13px;color:var(--p1)" onclick="doListAdd('ungrouped')">Uden liste</button>
    </div>
    <div class="modal-actions"><button class="btn btn-sm" onclick="closeListPicker()">Annuller</button></div>
  </div>`;
  bg.onclick=ev=>{if(ev.target===bg)closeListPicker();};
  document.body.appendChild(bg);
  window._lpCvrs=toAdd;
}
function closeListPicker(){const bg=document.getElementById('list-picker-bg');if(bg)bg.remove();}
async function doListAdd(listId){
  const cvrs=window._lpCvrs||[];
  closeListPicker();
  for(const cvr of cvrs)await qAdd(cvr,listId==='all'?'ungrouped':listId);
  ckd.clear();upSel();
}
async function remL(cvr){
  if(isServerMode){try{await fetch(`/api/leads/${cvr}`,{method:'DELETE',headers:ah()});}catch(e){}}
  leads=leads.filter(l=>l.cvr!==cvr);await save();rSB();if(selCo?.cvr===cvr)hdDp();render();
}

function rSB(){
  // Pre-compute counts once
  const counts=new Map();
  counts.set('all',leads.length);
  lists.forEach(l=>{if(l.id!=='all')counts.set(l.id,leads.filter(x=>x.listId===l.id).length);});
  const isOn=id=>aList===id&&aView==='leads';

  document.getElementById('lc').innerHTML=lists.map(l=>`
    <div class="sb-li${isOn(l.id)?' on':''}" onclick="swList('${l.id}')">
      <span class="sb-li-nm">${e(l.name)}</span>
      <span class="sb-li-c">${counts.get(l.id)}</span>
      ${l.id!=='all'?`<span class="sb-li-del" onclick="event.stopPropagation();delList('${l.id}')">×</span>`:''}
    </div>`).join('');
  const llb=document.getElementById('llb-lists');
  if(llb)llb.innerHTML=lists.map(l=>`
    <div class="llb-list${isOn(l.id)?' on':''}" onclick="swList('${l.id}')">
      ${e(l.name)}
      <span class="llb-count">${counts.get(l.id)}</span>
      ${l.id!=='all'?`<span class="llb-del" onclick="event.stopPropagation();delList('${l.id}')">×</span>`:''}
    </div>`).join('');
}

function swList(id){aList=id;rSB();if(aView!=='leads')sv('leads');else render();}
function togNL(id='nli',disp='block'){
  const n=document.getElementById(id);n.style.display=n.style.display==='none'?disp:'none';
  if(n.style.display!=='none'){n.focus();n.onkeydown=ev=>{
    if(ev.key==='Enter'){const v=ev.target.value.trim();if(v){lists.push({id:'l'+Date.now(),name:v});save();rSB();}n.value='';n.style.display='none';}
    if(ev.key==='Escape'){n.value='';n.style.display='none';}
  };}
}
async function delList(id){
  if(!confirm('Slet listen?'))return;
  lists=lists.filter(l=>l.id!==id);leads=leads.map(l=>l.listId===id?{...l,listId:'ungrouped'}:l);
  if(aList===id)aList='all';await save();rSB();if(aView==='leads')render();
}

// ── BULK ──────────────────────────────────────────────────────────────────────
function togCk(cvr,on){if(on)ckd.add(cvr);else ckd.delete(cvr);upSel();}
function togAll(cb){
  const pool=aView==='leads'?(aList==='all'?leads:leads.filter(l=>l.listId===aList)):res;
  if(cb.checked)pool.forEach(c=>ckd.add(c.cvr));else ckd.clear();render();upSel();
}
function upSel(){
  const sb=document.getElementById('selbar');if(!ckd.size){sb.classList.add('h');return;}
  sb.classList.remove('h');
  sb.innerHTML=`<strong>${ckd.size}</strong> valgt &nbsp;
    <button class="btn btn-primary btn-sm" onclick="bulkAdd()">+ Tilføj som leads</button>
    ${aView==='leads'?'<button class="btn btn-danger btn-sm" onclick="bulkRem()">Fjern valgte</button>':''}
    <button class="btn btn-sm" onclick="expSel()">⬇ CSV</button>
    <button class="btn btn-sm" style="margin-left:auto" onclick="ckd.clear();render();upSel()">× Fravælg</button>`;
}
function bulkAdd(){showListPicker([...ckd]);}
async function bulkRem(){for(const c of[...ckd])await remL(c);ckd.clear();upSel();}
function expSel(){const pool=aView==='leads'?leads:res;doCSV(pool.filter(c=>ckd.has(c.cvr)),'vedio_leads_valgte');}
function addAll(){showListPicker(res.map(c=>c.cvr));}


// ── EXPORT ─────────────────────────────────────────────────────────────────────
function togSB(){sbOpen=!sbOpen;document.getElementById('sb').style.width=sbOpen?'280px':'0';}
function togFilterPop(){const p=document.getElementById('filter-popover'),o=document.getElementById('fp-overlay');const isOpen=p.classList.toggle('open');o.classList.toggle('open',isOpen);}
function doExport(){const vis=aList==='all'?leads:leads.filter(l=>l.listId===aList);if(!vis.length){alert('Ingen leads endnu');return;}doCSV(vis,'vedio_leads');}
function doCSV(data,fn){
  const f=[
    ['cvr','CVR'],['name','Navn'],['web','Website'],['ph','Telefon'],['em','Email'],
    ['addr','Adresse'],['zip','Postnr'],['city','By'],
    ['ind','Branche'],['form','Form'],
    ['emps','Ansatte'],['st','Status'],['yr','Stiftet'],
    ['omsaetning','Omsætning'],['eq','Egenkapital'],['res','Resultat'],
    ['addedAt','Tilføjet']
  ];
  const getExtra=(c)=>[
    ['Note',leadNotes[c.cvr]||''],['Tags',(leadTags[c.cvr]||[]).join(', ')],
    ['Followup',leadFollowup[c.cvr]||'']
  ];
  const header=[...f.map(x=>x[1]),'Note','Tags','Followup'].map(x=>`"${x}"`).join(';');
  const rows=data.map(c=>[
    ...f.map(x=>`"${(c[x[0]]||'').toString().replace(/"/g,'""')}"`),
    ...getExtra(c).map(x=>`"${x[1].toString().replace(/"/g,'""')}"`)
  ].join(';'));
  const csv='\uFEFF'+[header,...rows].join('\n');
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));
  a.download=fn+'_'+new Date().toISOString().slice(0,10)+'.csv';a.click();
}

// ── UTILS ──────────────────────────────────────────────────────────────────────
function fmtKr(n){if(!n||n===0)return'—';const abs=Math.abs(n);const s=abs>=1000000?(Math.round(abs/100000)/10).toFixed(1)+'m':abs>=1000?Math.round(abs/1000)+'k':abs.toString();return(n<0?'-':'')+s;}
function fp(p){const d=(p||'').replace(/\D/g,'');return d.length===8?d.replace(/(\d{2})(\d{2})(\d{2})(\d{2})/,'$1 $2 $3 $4'):p||'';}
function e(s){return(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function trunc(s,n){return s&&s.length>n?s.slice(0,n)+'…':s||'';}
// ── CONTACTS ──────────────────────────────────────────────────────────────────
const CONTACT_COLORS=['#8258a8','#2563eb','#16a34a','#d97706','#0891b2','#7c3aed','#db2777','#dc2626'];
function toggleContactForm(cvr){
  const f=document.getElementById('contact-form-'+cvr);
  if(!f)return;
  const open=f.style.display!=='none';
  f.style.display=open?'none':'flex';
  if(!open){setTimeout(()=>{const n=document.getElementById('cf-name');if(n)n.focus();},50);}
}
async function saveContact(cvr){
  const name=(document.getElementById('cf-name')?.value||'').trim();
  if(!name){document.getElementById('cf-name')?.focus();return;}
  const ct={
    id:'c'+Date.now(),
    name,
    title:(document.getElementById('cf-title')?.value||'').trim(),
    phone:(document.getElementById('cf-phone')?.value||'').trim(),
    email:(document.getElementById('cf-email')?.value||'').trim(),
    linkedin:(document.getElementById('cf-linkedin')?.value||'').trim(),
    color:CONTACT_COLORS[Math.floor(Math.random()*CONTACT_COLORS.length)],
    createdAt:new Date().toISOString(),
  };
  leadContacts[cvr]=[...(leadContacts[cvr]||[]),ct];
  if(isServerMode){try{await fetch('/api/meta/'+cvr,{method:'PATCH',headers:ah(),body:JSON.stringify({contacts:leadContacts[cvr]})});}catch(e){}}
  await save();
  if(selCo&&selCo.cvr===cvr)showDp(selCo);
  showTab('contacts');
}
async function removeContact(cvr,id){
  leadContacts[cvr]=(leadContacts[cvr]||[]).filter(c=>c.id!==id);
  if(isServerMode){try{await fetch('/api/meta/'+cvr,{method:'PATCH',headers:ah(),body:JSON.stringify({contacts:leadContacts[cvr]})});}catch(e){}}
  await save();
  if(selCo&&selCo.cvr===cvr)showDp(selCo);
  showTab('contacts');
}

// ── PROFILE MODAL ─────────────────────────────────────────────────────────────
const PROFILE_COLORS=['#8258a8','#2563eb','#16a34a','#d97706','#dc2626','#0891b2','#7c3aed','#db2777','#059669','#ea580c'];
let profileAvatarData=null; // pending base64 or null-to-clear

function openProfileModal(){
  if(!currentUser)return;
  profileAvatarData=undefined; // undefined = no change pending
  // Populate fields
  document.getElementById('pf-name').value=currentUser.name||'';
  document.getElementById('pf-email').value=currentUser.email||'';
  document.getElementById('pf-pw-current').value='';
  document.getElementById('pf-pw-new').value='';
  document.getElementById('pf-pw-confirm').value='';
  document.getElementById('profile-pw-section').style.display='none';
  document.getElementById('pw-toggle-arrow').textContent='▶';
  // Hide message
  const msg=document.getElementById('profile-msg');
  msg.className='profile-msg';msg.textContent='';
  // Avatar preview
  const bigAv=document.getElementById('profile-avatar-big');
  applyAvatarToEl(bigAv,currentUser);
  bigAv.style.width='80px';bigAv.style.height='80px';bigAv.style.fontSize='28px';
  document.getElementById('profile-avatar-remove').style.display=currentUser.avatar?'block':'none';
  // Color swatches
  const cr=document.getElementById('profile-color-row');
  cr.innerHTML=PROFILE_COLORS.map(c=>`<div class="profile-color-swatch${(currentUser.color||'#8258a8')===c?' sel':''}" style="background:${c}" onclick="selectProfileColor('${c}')" title="${c}"></div>`).join('');
  // Show modal
  document.getElementById('profile-modal').style.display='flex';
  setTimeout(()=>document.getElementById('pf-name').focus(),60);
}

function closeProfileModal(){
  document.getElementById('profile-modal').style.display='none';
  profileAvatarData=undefined;
}

function togglePwSection(){
  const sec=document.getElementById('profile-pw-section');
  const arr=document.getElementById('pw-toggle-arrow');
  const open=sec.style.display!=='none';
  sec.style.display=open?'none':'flex';
  arr.textContent=open?'▶':'▼';
}

function selectProfileColor(c){
  document.querySelectorAll('.profile-color-swatch').forEach(s=>s.classList.remove('sel'));
  event.target.classList.add('sel');
}

function handleAvatarUpload(input){
  const file=input.files[0];
  if(!file)return;
  if(file.size>2*1024*1024){showProfileMsg('Billede må max være 2 MB','err');input.value='';return;}
  const reader=new FileReader();
  reader.onload=ev=>{
    profileAvatarData=ev.target.result; // base64
    const bigAv=document.getElementById('profile-avatar-big');
    bigAv.innerHTML='<img src="'+profileAvatarData+'" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block">';
    bigAv.style.background='transparent';bigAv.style.fontSize='0';
    document.getElementById('profile-avatar-remove').style.display='block';
  };
  reader.readAsDataURL(file);
  input.value='';
}

function removeAvatar(){
  profileAvatarData=null; // null = explicitly remove
  const bigAv=document.getElementById('profile-avatar-big');
  const initials=(currentUser.name||'?').split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase();
  bigAv.innerHTML='';bigAv.textContent=initials;
  bigAv.style.background=currentUser.color||'var(--p1)';bigAv.style.fontSize='28px';
  document.getElementById('profile-avatar-remove').style.display='none';
}

function showProfileMsg(txt,type){
  const msg=document.getElementById('profile-msg');
  msg.textContent=txt;msg.className='profile-msg '+type;
  if(type==='ok')setTimeout(()=>{msg.className='profile-msg';msg.textContent='';},3000);
}

async function saveProfile(){
  if(!currentUser)return;
  const name=document.getElementById('pf-name').value.trim();
  const email=document.getElementById('pf-email').value.trim();
  const selSwatch=document.querySelector('.profile-color-swatch.sel');
  const color=selSwatch?selSwatch.style.background:currentUser.color;
  if(!name){showProfileMsg('Navn må ikke være tomt','err');return;}
  if(!email||!email.includes('@')){showProfileMsg('Ugyldig email','err');return;}
  const body={name,email,color};
  if(profileAvatarData!==undefined)body.avatar=profileAvatarData;

  // Try server first
  if(isServerMode&&authToken){
    try{
      const r=await fetch('/api/auth/profile',{method:'PATCH',headers:ah(),body:JSON.stringify(body)});
      const d=await r.json();
      if(r.ok){
        currentUser=Object.assign(currentUser,d);
        applyAvatarToEl(document.getElementById('user-avatar'),currentUser);
        document.getElementById('user-name').textContent=currentUser.name;
        showProfileMsg('Profil gemt ✓','ok');
        setTimeout(closeProfileModal,1200);
        return;
      }
    }catch(ex){}
  }

  // Local save
  Object.assign(currentUser,body);
  if(profileAvatarData===null)delete currentUser.avatar;
  else if(profileAvatarData)currentUser.avatar=profileAvatarData;
  localStorage.setItem('vl_current_user',JSON.stringify(currentUser));
  applyAvatarToEl(document.getElementById('user-avatar'),currentUser);
  document.getElementById('user-name').textContent=currentUser.name;
  showProfileMsg('Profil gemt ✓','ok');
  setTimeout(closeProfileModal,1200);
}

async function changePassword(){
  const cur=document.getElementById('pf-pw-current').value;
  const nw=document.getElementById('pf-pw-new').value;
  const cf=document.getElementById('pf-pw-confirm').value;
  if(!cur||!nw||!cf){showProfileMsg('Udfyld alle adgangskode-felter','err');return;}
  if(nw!==cf){showProfileMsg('De to nye adgangskoder matcher ikke','err');return;}
  if(nw.length<3){showProfileMsg('Ny adgangskode skal være mindst 3 tegn','err');return;}

  // Try server first
  if(isServerMode&&authToken){
    try{
      const r=await fetch('/api/auth/change-password',{method:'POST',headers:ah(),body:JSON.stringify({currentPassword:cur,newPassword:nw})});
      const d=await r.json();
      if(!r.ok){showProfileMsg(d.error||'Fejl ved skift af adgangskode','err');return;}
      document.getElementById('pf-pw-current').value='';
      document.getElementById('pf-pw-new').value='';
      document.getElementById('pf-pw-confirm').value='';
      showProfileMsg('Adgangskode ændret ✓','ok');
      return;
    }catch(ex){}
  }

  // Local password change
  const acc=LOCAL_ACCOUNTS.find(a=>a.email===currentUser.email);
  if(!acc||acc.password!==cur){showProfileMsg('Forkert nuværende adgangskode','err');return;}
  acc.password=nw;
  document.getElementById('pf-pw-current').value='';
  document.getElementById('pf-pw-new').value='';
  document.getElementById('pf-pw-confirm').value='';
  showProfileMsg('Adgangskode ændret ✓','ok');
}

// ── EDIT LEAD ─────────────────────────────────────────────────────────────────
let editLeadCvr=null;
function openEditLead(cvr){
  const c=leads.find(l=>l.cvr===cvr);if(!c)return;
  editLeadCvr=cvr;
  document.getElementById('edit-lead-title').textContent='Rediger: '+c.name;
  document.getElementById('ef-contactName').value=c.contactName||'';
  document.getElementById('ef-contactTitle').value=c.contactTitle||'';
  document.getElementById('ef-ph').value=c.ph||'';
  document.getElementById('ef-em').value=c.em||'';
  document.getElementById('ef-web').value=c.web||'';
  document.getElementById('ef-name').value=c.name||'';
  document.getElementById('ef-ind').value=c.ind||'';
  document.getElementById('ef-addr').value=c.addr||'';
  document.getElementById('ef-zip').value=c.zip||'';
  document.getElementById('ef-city').value=c.city||'';
  document.getElementById('ef-omsaetning').value=c.omsaetning||'';
  document.getElementById('ef-emps').value=c.emps||'';
  const modal=document.getElementById('edit-lead-modal');
  modal.style.display='flex';
  setTimeout(()=>document.getElementById('ef-contactName').focus(),50);
}
function closeEditLead(){
  document.getElementById('edit-lead-modal').style.display='none';
  editLeadCvr=null;
}
async function saveEditLead(){
  if(!editLeadCvr)return;
  const updates={
    name:(document.getElementById('ef-name').value.trim()||undefined),
    contactName:document.getElementById('ef-contactName').value.trim(),
    contactTitle:document.getElementById('ef-contactTitle').value.trim(),
    ph:document.getElementById('ef-ph').value.trim(),
    em:document.getElementById('ef-em').value.trim(),
    web:document.getElementById('ef-web').value.trim(),
    ind:document.getElementById('ef-ind').value.trim(),
    addr:document.getElementById('ef-addr').value.trim(),
    zip:document.getElementById('ef-zip').value.trim(),
    city:document.getElementById('ef-city').value.trim(),
    omsaetning:parseInt(document.getElementById('ef-omsaetning').value)||0,
    emps:parseInt(document.getElementById('ef-emps').value)||0,
  };
  if(!updates.name)delete updates.name;
  const lead=leads.find(l=>l.cvr===editLeadCvr);
  if(lead)Object.assign(lead,updates);
  if(isServerMode){
    try{await fetch('/api/leads/'+editLeadCvr,{method:'PATCH',headers:ah(),body:JSON.stringify(updates)});}catch(ex){}
  }
  await save();
  const btn=document.querySelector('#edit-lead-modal .btn-primary');
  if(btn){btn.textContent='✓ Gemt!';setTimeout(()=>{btn.textContent='Gem ændringer';},1200);}
  closeEditLead();
  const updated=leads.find(l=>l.cvr===editLeadCvr||l.cvr===(lead&&lead.cvr));
  const target=leads.find(l=>l.cvr===(lead?lead.cvr:editLeadCvr));
  if(selCo&&target&&selCo.cvr===target.cvr){selCo=target;showDp(target);}
  rLeads();render();
}

document.addEventListener('keydown',ev=>{if(ev.key==='Escape'){hdDp();closeEditLead();closeProfileModal();ckd.clear();upSel();}});
document.querySelectorAll('[data-tip]').forEach(el=>{let t=null;el.addEventListener('mouseenter',()=>{t=document.createElement('div');t.className='data-tip-popup';t.textContent=el.dataset.tip;document.body.appendChild(t);const r=el.getBoundingClientRect();t.style.left=r.left+r.width/2-t.offsetWidth/2+'px';t.style.top=r.top-t.offsetHeight-6+'px';});el.addEventListener('mouseleave',()=>{if(t){t.remove();t=null;}});});
document.getElementById('edit-lead-modal').addEventListener('click',ev=>{if(ev.target.id==='edit-lead-modal')closeEditLead();});
document.getElementById('profile-modal').addEventListener('click',ev=>{if(ev.target.id==='profile-modal')closeProfileModal();});


