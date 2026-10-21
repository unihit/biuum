import {GoogleStore} from './google-store.js';
import {cache} from './cache.js';
import {newItem,patchItem,photoBlob,ApiError} from './model.js';
import {googleErrorMessage} from './google-errors.js';
import {validateSettings as validateConfig} from './setup-link.js';
const CONFIG_KEY='biuum-connection-v1';
const ROLE_KEY='biuum-device-role-v1';
const DEVICE_KEY='biuum-device-id-v1';
const AUTO_KEY='biuum-google-auto-v1';
const INTENT_KEY='biuum-claim-intent-v1';
const CLAIM_NAME='biuum-device.json';
const DRIVE='https://www.googleapis.com/drive/v3';
const UPLOAD='https://www.googleapis.com/upload/drive/v3';
const SCOPES=['https://www.googleapis.com/auth/drive','https://www.googleapis.com/auth/userinfo.email'];
let config;
try { config=JSON.parse(localStorage.getItem(CONFIG_KEY)||'{}'); } catch { config={}; }
config={clientId:'',ownerEmail:'',sheetId:'',folderId:'',tabName:'물품',...config};
const readRole=()=>{try{return localStorage.getItem(ROLE_KEY)==='writer'?'writer':'reader';}catch{return 'reader';}};
const autoEnabled=()=>{try{return localStorage.getItem(AUTO_KEY)==='1';}catch{return false;}};
const intent=()=>{try{return localStorage.getItem(INTENT_KEY)==='1';}catch{return false;}};
const setIntent=value=>{try{value?localStorage.setItem(INTENT_KEY,'1'):localStorage.removeItem(INTENT_KEY);}catch{}};
let mode='locked',token='',expiresAt=0,account=null,backend=null,busy=false,session=0;
let role=readRole(),notice='',claimId=null,lastSnapshot='';
const objectUrls=new Set();
const notify=()=>window.dispatchEvent(new CustomEvent('biuum-status'));
function remount() { for(const url of objectUrls) URL.revokeObjectURL(url); objectUrls.clear(); window.dispatchEvent(new CustomEvent('biuum-store-change')); notify(); }
function requireIdle() { if(busy) throw new Error('저장이 끝난 후 다시 시도해 주세요.'); }
function requireOnline() {
  if(!navigator.onLine) throw new Error('오프라인에서는 조회만 가능합니다. 인터넷 연결 후 저장해 주세요.');
}
function setNotice(text) { notice=text||''; notify(); }
function resetConnection() { token='';expiresAt=0;account=null;backend=null;mode='locked';claimId=null;session++;clearRefresh();remount(); }
// Only one device may write. The claim lives in the photo folder so every device sees it.
function deviceId() { try { let id=localStorage.getItem(DEVICE_KEY); if(!id) { id=crypto.randomUUID(); localStorage.setItem(DEVICE_KEY,id); } return id; } catch { return 'unknown-device'; } }
function deviceName() {
  const ua=navigator.userAgent||'';
  const os=/Android/i.test(ua)?'Android':/iPhone|iPad|iPod/i.test(ua)?'iPhone':/Macintosh/i.test(ua)?'Mac':/Windows/i.test(ua)?'Windows':'기타';
  const browser=/Edg\//i.test(ua)?'Edge':/Chrome\//i.test(ua)?'Chrome':/Safari\//i.test(ua)?'Safari':'브라우저';
  return os+' · '+browser;
}
async function findClaim() {
  const q=`name='${CLAIM_NAME}' and trashed=false and '${config.folderId}' in parents`;
  const result=await request(`${DRIVE}/files?q=${encodeURIComponent(q)}&orderBy=createdTime&fields=files(id,name)`);
  claimId=result.files?.[0]?.id||null;
  return claimId;
}
async function readClaim() {
  if(!claimId && !(await findClaim())) return null;
  try { return await request(`${DRIVE}/files/${encodeURIComponent(claimId)}?alt=media`); }
  catch(error) {
    if(error.status===404) { claimId=null; return null; }
    // A corrupt claim file is treated as empty so the writer can repair it.
    if(error instanceof SyntaxError) return null;
    throw error;
  }
}
async function writeClaim(claim,create) {
  if(!create) return request(`${UPLOAD}/files/${encodeURIComponent(claimId)}?uploadType=media`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(claim)});
  const boundary='biuum_'+crypto.randomUUID();
  const metadata={name:CLAIM_NAME,mimeType:'application/json',parents:[config.folderId],appProperties:{biuum:'device-v1'}};
  const body=new Blob([`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(claim)}\r\n--${boundary}--\r\n`]);
  const result=await request(`${UPLOAD}/files?uploadType=multipart&fields=id`,{method:'POST',headers:{'Content-Type':`multipart/related; boundary=${boundary}`},body});
  claimId=result.id; return result;
}
async function demote(claim) {
  role='reader';
  try { localStorage.setItem(ROLE_KEY,'reader'); } catch {}
  setIntent(false);
  const name=claim?.writerName;
  setNotice(name?`이미 '${name}'가 등록 기기예요. 이 기기는 조회 전용으로 바꿨어요.`:'다른 기기가 등록 기기예요. 이 기기는 조회 전용으로 바꿨어요.');
  remount();
  return false;
}
async function ensureClaim(takeover=false) {
  if(role!=='writer') return true;
  const me=deviceId();
  let claim=await readClaim();
  if(claim && claim.writerId!==me && !takeover) return demote(claim);
  if(!claim || claim.writerId!==me) {
    const next={version:1,writerId:me,writerName:deviceName(),claimedAt:new Date().toISOString()};
    const existed=Boolean(claim);
    await writeClaim(next,!claimId);
    if(!existed) {
      // Two devices may create the claim at once: the oldest file wins.
      claimId=null; await findClaim();
      const settled=await readClaim();
      if(settled && settled.writerId!==me) return demote(settled);
      claim=settled||next;
    } else claim=next;
  }
  setIntent(false);
  notice='';
  return true;
}
async function releaseClaim() {
  if(mode!=='google' || role!=='writer') return;
  try {
    const claim=await readClaim();
    if(claim?.writerId===deviceId() && claimId) await request(`${DRIVE}/files/${encodeURIComponent(claimId)}`,{method:'DELETE'});
  } catch { /* 등록 기기 기록을 지우지 못해도 이 기기는 조회 전용으로 전환 */ }
  claimId=null;
}
async function assertWriter() {
  if(role!=='writer') throw new Error('이 기기는 조회 전용이에요. 등록 기기에서 수정해 주세요.');
  if(mode!=='google') return;
  const claim=await readClaim();
  if(!claim) {
    if(await ensureClaim()) return;
    throw new Error('다른 기기가 등록 기기로 바뀌었어요. 이 기기는 이제 조회 전용입니다.');
  }
  if(claim.writerId!==deviceId()) { await demote(claim); throw new Error('다른 기기가 등록 기기로 바뀌었어요. 이 기기는 이제 조회 전용입니다.'); }
}
function urls(photos) { return Object.fromEntries(Object.entries(photos).map(([id,blob])=>{ const url=URL.createObjectURL(blob); objectUrls.add(url); return [id,url]; })); }
function loadGis() {
  if(window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((resolve,reject)=>{
    const script=document.createElement('script'); script.src='https://accounts.google.com/gsi/client'; script.async=true;
    const timeout=setTimeout(()=>reject(new Error('Google 로그인 모듈을 불러오지 못했습니다. 연결을 확인해 주세요.')),15000);
    script.onload=()=>{clearTimeout(timeout);resolve();}; script.onerror=()=>{clearTimeout(timeout);script.remove();reject(new Error('Google 로그인 모듈을 불러오지 못했습니다.'));}; document.head.append(script);
  });
}
// Preload so requestAccessToken remains inside the connection button's user gesture.
const gisReady=navigator.onLine ? loadGis().catch(()=>{}) : Promise.resolve();
let tokenClient=null,tokenWaiter=null,refreshTimer=null,autoTried=false;
function clearRefresh() { clearTimeout(refreshTimer); refreshTimer=null; }
function settleToken(ok) {
  const waiter=tokenWaiter; tokenWaiter=null;
  if(waiter) { clearTimeout(waiter.timer); waiter.done(ok); }
  notify();
}
function tokenRequest(prompt) {
  if(!config.clientId || !window.google?.accounts?.oauth2) return Promise.resolve(false);
  if(!tokenClient) {
    const oauth=window.google.accounts.oauth2;
    tokenClient=oauth.initTokenClient({client_id:config.clientId,scope:SCOPES.join(' '),
      error_callback:()=>settleToken(false),
      callback:value=>{
        if(value.error || !value.access_token || !oauth.hasGrantedAllScopes(value,...SCOPES)) settleToken(false);
        else {
          token=value.access_token;
          expiresAt=Date.now()+Math.max(0,Number(value.expires_in)-60)*1000;
          session++; scheduleRefresh(); settleToken(true);
        }
      }
    });
  }
  if(tokenWaiter) return tokenWaiter.promise;
  const waiter={done:null,timer:null,promise:null};
  waiter.promise=new Promise(resolve=>{waiter.done=resolve;});
  waiter.timer=setTimeout(()=>settleToken(false),prompt===''?15000:120000);
  tokenWaiter=waiter;
  try { tokenClient.requestAccessToken({prompt,login_hint:config.ownerEmail}); }
  catch { settleToken(false); }
  return waiter.promise;
}
function scheduleRefresh() {
  clearRefresh();
  if(!token) return;
  refreshTimer=setTimeout(()=>{refreshToken();},Math.max(60000,expiresAt-Date.now()-300000));
  refreshTimer?.unref?.();
}
async function refreshToken() {
  if(!token || !autoEnabled() || !window.google?.accounts?.oauth2) return false;
  const ok=await tokenRequest('');
  return Boolean(ok && token && Date.now()<expiresAt);
}
async function request(url,options={},type='json',retried=false) {
  if(!navigator.onLine) throw new Error('오프라인에서는 조회만 가능합니다. 인터넷 연결 후 저장해 주세요.');
  if(!token || Date.now()>=expiresAt) {
    if(!(await refreshToken())) { token='';expiresAt=0;notify(); throw new Error('Google 연결이 만료됐어요. 위의 Google 연결 버튼을 눌러 주세요.'); }
  }
  const generation=session;
  let response;
  try { response=await fetch(url,{...options,headers:{'Authorization':'Bearer '+token,...(!(options.body instanceof Blob) && options.body ? {'Content-Type':'application/json'}:{}),...options.headers},cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(30000)}); }
  catch { throw new ApiError('네트워크 응답을 받지 못했습니다. 저장 작업은 완료됐을 수도 있으므로 확인 후 재시도해 주세요.'); }
  if(generation!==session) throw new Error('Google 연결이 변경됐습니다.');
  if(response.status===401) {
    if(!retried && await refreshToken()) return request(url,options,type,true);
    token='';expiresAt=0;notify(); throw new ApiError('Google 연결이 만료됐습니다. 다시 연결해 주세요.',401);
  }
  if(!response.ok) {
    const payload=await response.json().catch(()=>({}));
    throw new ApiError(googleErrorMessage(response.status,url,payload),response.status);
  }
  if(type==='blob') return response.blob();
  if(response.status===204) return {};
  return response.json();
}
function prefix() { return `${config.ownerEmail.toLowerCase()}:${config.sheetId}:${config.folderId}:${config.tabName}:`; }
const demoSeed=()=>[
  newItem({name:'접이식 캠핑 의자',price:25000,place:'베란다 선반',description:'체험용 예시 물품입니다.'},'demo-chair',[],new Date().toISOString()),
  {...newItem({name:'유리 화병',price:8000,place:'거실 수납장'},'demo-vase',[],new Date().toISOString()),status:'selling',listedAt:new Date().toISOString()},
  {...newItem({name:'책상 조명',price:15000,place:'작업실'},'demo-lamp',[],new Date().toISOString()),status:'reserved'}
];
async function demo(action,args) {
  let db=await cache.get('demo');
  if(!db) {db={items:demoSeed(),photos:{}};await cache.set('demo',db);}
  if(action==='listItems') return structuredClone(db.items);
  if(action==='getPhotos') return urls(Object.fromEntries(args[0].filter(id=>db.photos[id]).map(id=>[id,db.photos[id]])));
  let result;
  if(action==='createItem') {
    const input=args[0]; if(input.photos.length>3) throw new Error('사진은 최대 3장까지 추가할 수 있어요.');
    const blobs=input.photos.map(photoBlob),id=crypto.randomUUID(),ids=blobs.map((_,i)=>id+'-'+i);
    result=newItem(input,id,ids,new Date().toISOString()); ids.forEach((key,i)=>db.photos[key]=blobs[i]); db.items.push(result);
  } else if(action==='updateItem') {
    const item=db.items.find(entry=>entry.id===args[0]); if(!item) throw new Error('물품을 찾을 수 없어요.');
    result=patchItem(item,args[1],args[2],new Date(Math.max(Date.now(),Date.parse(item.updatedAt)+1)).toISOString()); db.items=db.items.map(entry=>entry.id===item.id?result:entry);
  } else throw new Error('지원하지 않는 작업입니다.');
  await cache.set('demo',db); return structuredClone(result);
}
async function openConnection(takeover=false) {
  const user=await request('https://www.googleapis.com/oauth2/v3/userinfo');
  if(!user.email_verified || user.email?.toLowerCase()!==config.ownerEmail.toLowerCase()) throw new Error('설정한 본인 Google 계정으로 연결해 주세요.');
  const folder=await request(`${DRIVE}/files/${encodeURIComponent(config.folderId)}?fields=id,mimeType,trashed,capabilities(canAddChildren)`);
  if(folder.mimeType!=='application/vnd.google-apps.folder' || folder.trashed || !folder.capabilities?.canAddChildren) throw new Error('사진 폴더에 저장할 수 없습니다. 폴더 ID와 권한을 확인해 주세요.');
  backend=new GoogleStore(config,request,cache);
  lastSnapshot=JSON.stringify(await backend.listItems());
  account=user.email; mode='google';
  if(role==='writer') await ensureClaim(takeover);
  remount();
}
async function autoConnect() {
  if(autoTried || !autoEnabled() || mode==='google' || !config.clientId || !navigator.onLine) return;
  autoTried=true;
  try {
    await gisReady;
    if(!window.google?.accounts?.oauth2 || !(await tokenRequest(''))) return;
    busy=true;notify();
    try { await openConnection(intent()); }
    finally { busy=false;notify(); }
  } catch { token='';expiresAt=0;backend=null;account=null;mode='locked';session++;clearRefresh();notify(); }
}
async function pullIfReader() {
  if(mode!=='google' || role!=='reader' || busy || !navigator.onLine) return;
  if(typeof document!=='undefined' && document.hidden) return;
  try {
    const snapshot=JSON.stringify(await backend.listItems());
    if(snapshot!==lastSnapshot) { lastSnapshot=snapshot; remount(); }
  } catch { /* 다음 주기에 다시 시도 */ }
}
export const store={
  get status() { return {mode,account,busy,role,notice,connected:mode==='google' && !!token && Date.now()<expiresAt,config:{...config}}; },
  async saveConfig(value) {
    requireIdle(); const next=validateConfig(value);
    localStorage.setItem(CONFIG_KEY,JSON.stringify(next)); config=next;
    token='';account=null;backend=null;mode='locked';claimId=null;session++;remount();
  },
  async connect() {
    requireIdle();validateConfig(config);
    busy=true;notify();
    try {
      if(!navigator.onLine) throw new Error('인터넷 연결 후 Google에 연결해 주세요.');
      await gisReady;
      if(!window.google?.accounts?.oauth2) { await loadGis(); throw new Error('로그인 준비가 끝났습니다. Google 연결을 다시 눌러 주세요.'); }
      if(!(await tokenRequest('select_account'))) throw new Error('파일 저장 및 계정 확인 권한을 모두 승인해야 연결할 수 있습니다.');
      try { localStorage.setItem(AUTO_KEY,'1'); } catch {}
      await openConnection(intent());
    } catch(error) { resetConnection(); throw error; }
    finally { busy=false;notify(); }
  },
  async disconnect() { requireIdle(); resetConnection(); try { localStorage.removeItem(AUTO_KEY); } catch {} setNotice(''); },
  async useDemo() { requireIdle();token='';expiresAt=0;account=null;backend=null;mode='demo';claimId=null;session++;clearRefresh();remount(); },
  async useOffline() {
    requireIdle();if(!config.ownerEmail || !config.sheetId || !(await cache.get(prefix()+'items'))) throw new Error('이 기기에 저장된 Google 목록이 없습니다. 먼저 Google에 연결해 주세요.');
    token='';expiresAt=0;backend=null;account=config.ownerEmail;mode='offline';claimId=null;session++;clearRefresh();remount();
  },
  async clearCache() {
    requireIdle();token='';expiresAt=0;account=null;backend=null;mode='locked';claimId=null;session++;clearRefresh();
    await cache.clear();remount();
  },
  async setRole(next,{takeover=false}={}) {
    requireIdle();
    setNotice('');
    const want=next==='writer'?'writer':'reader';
    if(want==='reader') await releaseClaim();
    role=want;
    try { localStorage.setItem(ROLE_KEY,want); } catch {}
    setIntent(want==='writer');
    if(want==='writer' && mode==='google') {
      busy=true;notify();
      try { await ensureClaim(takeover); }
      catch(error) {
        role='reader';
        try { localStorage.setItem(ROLE_KEY,'reader'); } catch {}
        setIntent(false);
        throw error;
      }
      finally { busy=false;notify(); }
    }
    remount();
  },
  async writerInfo() {
    if(mode!=='google') return null;
    try {
      const claim=await readClaim();
      return claim && claim.writerId!==deviceId() ? claim : null;
    } catch { return null; }
  },
  async call(action,...args) {
    const mutation=['createItem','updateItem'].includes(action);
    if(mutation && mode==='google' && role!=='writer') throw new Error('이 기기는 조회 전용이에요. 등록 기기에서 수정해 주세요.');
    if(mutation) {
      if(busy) throw new Error('이미 저장 중입니다.');
      busy=true;notify();
      if(mode==='google') {
        try { await assertWriter(); }
        catch(error) { busy=false;notify(); throw error; }
      }
    }
    try {
      if(mode==='demo') return await demo(action,args);
      if(mode==='locked') { if(action==='listItems') return []; throw new Error('먼저 위에서 Google에 연결해 주세요. 체험은 Google에 저장되지 않습니다.'); }
      if(mode==='offline') {
        if(mutation) throw new Error('저장된 목록 보기에서는 수정할 수 없습니다. Google에 다시 연결해 주세요.');
        const items=await cache.get(prefix()+'items') || [];
        if(action==='listItems') return items.map(({rowNumber,...item})=>item);
        const allowed=new Set(items.flatMap(item=>item.photoIds)); const photos={};
        for(const id of args[0]) { if(!allowed.has(id)) throw new Error('등록되지 않은 사진입니다.'); const blob=await cache.get(prefix()+'photo:'+id); if(blob) photos[id]=blob; }
        return urls(photos);
      }
      requireOnline();
      if(typeof backend?.[action]!=='function') throw new Error('지원하지 않는 작업입니다.');
      const result=await backend[action](...args);
      return action==='getPhotos' ? urls(result) : result;
    } finally {if(mutation) {busy=false;notify();}}
  }
};
window.addEventListener('online',()=>{notify();if(!autoTried) autoConnect();});
window.addEventListener('offline',notify);
if(typeof document!=='undefined') document.addEventListener('visibilitychange',()=>{ if(!document.hidden) pullIfReader(); });
setInterval(()=>{if(token && Date.now()>=expiresAt-60000) refreshToken();},60000);
setInterval(pullIfReader,30000);
if(config.clientId && autoEnabled()) gisReady.then(autoConnect);
