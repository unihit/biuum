import {GoogleStore} from './google-store.js';
import {cache} from './cache.js';
import {newItem,patchItem,photoBlob,ApiError} from './model.js';
const CONFIG_KEY='biuum-connection-v1';
let config;
try { config=JSON.parse(localStorage.getItem(CONFIG_KEY)||'{}'); } catch { config={}; }
config={clientId:'',ownerEmail:'',sheetId:'',folderId:'',tabName:'물품',...config};
let mode='locked',token='',expiresAt=0,account=null,backend=null,busy=false,session=0;
const objectUrls=new Set();
const notify=()=>window.dispatchEvent(new CustomEvent('biuum-status'));
function remount() { for(const url of objectUrls) URL.revokeObjectURL(url); objectUrls.clear(); window.dispatchEvent(new CustomEvent('biuum-store-change')); notify(); }
function requireIdle() { if(busy) throw new Error('저장이 끝난 후 다시 시도해 주세요.'); }
function requireOnline() {
  if(!navigator.onLine) throw new Error('오프라인에서는 조회만 가능합니다. 인터넷 연결 후 저장해 주세요.');
  if(!token || Date.now()>=expiresAt) { token=''; notify(); throw new Error('Google 연결이 만료됐어요. 위의 Google 연결 버튼을 눌러 주세요.'); }
}
async function request(url,options={},type='json') {
  requireOnline();
  const generation=session;
  let response;
  try { response=await fetch(url,{...options,headers:{'Authorization':'Bearer '+token,...(!(options.body instanceof Blob) && options.body ? {'Content-Type':'application/json'}:{}),...options.headers},cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(30000)}); }
  catch { throw new ApiError('네트워크 응답을 받지 못했습니다. 저장 작업은 완료됐을 수도 있으므로 확인 후 재시도해 주세요.'); }
  if(generation!==session) throw new Error('Google 연결이 변경됐습니다.');
  if(response.status===401) { token=''; expiresAt=0; notify(); throw new ApiError('Google 연결이 만료됐습니다. 다시 연결해 주세요.',401); }
  if(!response.ok) {
    // Never print API payloads or headers containing credentials.
    const messages={403:'Google 권한이 부족하거나 API가 활성화되지 않았습니다.',404:'설정한 파일을 찾을 수 없거나 접근 권한이 없습니다.',429:'요청이 많습니다. 잠시 후 다시 시도해 주세요.'};
    throw new ApiError(messages[response.status] || `Google 요청이 실패했습니다 (${response.status}).`,response.status);
  }
  if(type==='blob') return response.blob();
  if(response.status===204) return {};
  return response.json();
}
function validateConfig(value) {
  const next={clientId:String(value.clientId||'').trim(),ownerEmail:String(value.ownerEmail||'').trim().toLowerCase(),sheetId:String(value.sheetId||'').trim(),folderId:String(value.folderId||'').trim(),tabName:String(value.tabName||'물품').trim()};
  if(!/^\S+\.apps\.googleusercontent\.com$/.test(next.clientId)) throw new Error('Google OAuth 웹 클라이언트 ID를 입력해 주세요.');
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next.ownerEmail)) throw new Error('사용할 본인 Google 계정 이메일을 입력해 주세요.');
  if(!/^[\w-]+$/.test(next.sheetId) || !/^[\w-]+$/.test(next.folderId)) throw new Error('시트 ID와 사진 폴더 ID를 입력해 주세요.');
  if(!next.tabName) throw new Error('물품 탭 이름을 입력해 주세요.');
  return next;
}
function prefix() { return `${config.ownerEmail.toLowerCase()}:${config.sheetId}:${config.folderId}:${config.tabName}:`; }
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
export const store={
  get status() { return {mode,account,busy,connected:mode==='google' && !!token && Date.now()<expiresAt,config:{...config}}; },
  async saveConfig(value) {
    requireIdle(); const next=validateConfig(value);
    localStorage.setItem(CONFIG_KEY,JSON.stringify(next)); config=next;
    token='';account=null;backend=null;mode='locked';session++;remount();
  },
  async connect() {
    requireIdle();validateConfig(config);
    busy=true;notify();
    try {
    if(!navigator.onLine) throw new Error('인터넷 연결 후 Google에 연결해 주세요.');
    await gisReady;
    if(!window.google?.accounts?.oauth2) { await loadGis(); throw new Error('로그인 준비가 끝났습니다. Google 연결을 다시 눌러 주세요.'); }
    const oauth=window.google.accounts.oauth2;
    const scopes=['https://www.googleapis.com/auth/drive','https://www.googleapis.com/auth/userinfo.email'];
    // Existing Apps Script files require access beyond drive.file unless individually granted.
    const response=await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('Google 연결 응답을 받지 못했습니다. 팝업 차단을 확인하고 Chrome·Edge·Safari에서 다시 연결해 주세요.')),120000);
      const complete=value=>{clearTimeout(timer);value.error?reject(new Error('Google 연결을 완료하지 못했습니다.')):resolve(value);};
      const client=oauth.initTokenClient({client_id:config.clientId,scope:scopes.join(' '),callback:complete,error_callback:()=>{clearTimeout(timer);reject(new Error('Google 연결 창이 닫혔거나 차단됐습니다. 일반 브라우저에서 다시 연결해 주세요.'));}});
      client.requestAccessToken({prompt:'select_account',login_hint:config.ownerEmail});
    });
    if(!oauth.hasGrantedAllScopes(response,...scopes)) throw new Error('파일 저장 및 계정 확인 권한을 모두 승인해야 연결할 수 있습니다.');
    token=response.access_token;expiresAt=Date.now()+Math.max(0,Number(response.expires_in)-60)*1000;session++;
    try {
      const user=await request('https://www.googleapis.com/oauth2/v3/userinfo');
      if(!user.email_verified || user.email?.toLowerCase()!==config.ownerEmail.toLowerCase()) throw new Error('설정한 본인 Google 계정으로 연결해 주세요.');
      const folder=await request(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(config.folderId)}?fields=id,mimeType,trashed,capabilities(canAddChildren)`);
      if(folder.mimeType!=='application/vnd.google-apps.folder' || folder.trashed || !folder.capabilities?.canAddChildren) throw new Error('사진 폴더에 저장할 수 없습니다. 폴더 ID와 권한을 확인해 주세요.');
      backend=new GoogleStore(config,request,cache); await backend.listItems();
      account=user.email;mode='google';remount();
    } catch(error) { token='';expiresAt=0;backend=null;account=null;mode='locked';session++;remount();throw error; }
    } finally {busy=false;notify();}
  },
  async disconnect() { requireIdle();token='';expiresAt=0;account=null;backend=null;mode='locked';session++;remount(); },
  async useDemo() { requireIdle();token='';expiresAt=0;account=null;backend=null;mode='demo';session++;remount(); },
  async useOffline() {
    requireIdle();if(!config.ownerEmail || !config.sheetId || !(await cache.get(prefix()+'items'))) throw new Error('이 기기에 저장된 Google 목록이 없습니다. 먼저 Google에 연결해 주세요.');
    token='';expiresAt=0;backend=null;account=config.ownerEmail;mode='offline';session++;remount();
  },
  async clearCache() {
    requireIdle();token='';expiresAt=0;account=null;backend=null;mode='locked';session++;
    await cache.clear();remount();
  },
  async call(action,...args) {
    const mutation=['createItem','updateItem'].includes(action);
    if(mutation && busy) throw new Error('이미 저장 중입니다.');
    if(mutation) {busy=true;notify();}
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
window.addEventListener('online',notify);window.addEventListener('offline',notify);
setInterval(()=>{if(token && Date.now()>=expiresAt) {token='';notify();}},30000);
