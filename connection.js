import {store} from './store.js';
import {decodeSetup,setupUrl,validateSettings} from './setup-link.js';
import qrcode from './qr-generator.js';
const $=id=>document.getElementById(id),dialog=$('settings-dialog'),form=$('settings-form');
let installing;
const messages={locked:['Google 연결 전','Google 연결 후 목록을 불러옵니다.'],google:['Google에 연결됨','목록은 Sheets에, 사진은 비공개 Drive에 저장됩니다.'],offline:['저장된 목록 보기 · 조회 전용','이 기기의 목록과 이전에 읽은 사진만 표시됩니다. 수정하려면 Google에 연결하세요.'],demo:['체험 모드 · 기기에만 저장','예시 데이터입니다. Google의 물품 목록에는 영향을 주지 않습니다.']};
function update() {
  const s=store.status,[title,description]=messages[s.mode];
  $('connection-title').textContent=s.mode==='google'&&!s.connected?'Google 재연결 필요':title;
  $('connection-description').textContent=(s.account?s.account+' · ':'')+(!navigator.onLine && s.mode==='google'?'인터넷 연결이 끊겼습니다. 저장된 목록 보기로 전환할 수 있습니다.':description);
  $('connection-dot').classList.toggle('connected',s.connected);
  $('connect').textContent=s.connected?'Google 다시 연결':'Google 연결';
  $('connect').disabled=s.busy||!navigator.onLine;$('settings-open').disabled=s.busy;
  $('show-qr').disabled=s.busy;
  form.querySelectorAll('button,input').forEach(element=>element.disabled=s.busy);
}
function message(error,target='connection-message') {const element=$(target);element.textContent=error instanceof Error?error.message:String(error);element.hidden=false;}
function populate(value=store.status.config) { for(const key of ['clientId','ownerEmail','sheetId','folderId','tabName']) form.elements.namedItem(key).value=value[key] || (key==='tabName'?'물품':''); }
async function action(fn,close=false) {
  $('settings-error').hidden=true;$('connection-message').hidden=true;
  try {await fn();if(close)dialog.close();}catch(error){message(error,dialog.open?'settings-error':'connection-message');}finally{update();}
}
$('settings-open').addEventListener('click',()=>{populate();$('settings-error').hidden=true;dialog.showModal();});
$('settings-close').addEventListener('click',()=>dialog.close());
function showQr(settings) {
  const link=setupUrl(settings,location.href);
  const qr=qrcode(0,'M');qr.addData(link,'Byte');qr.make();
  const count=qr.getModuleCount(),cell=6,border=4;
  const canvas=document.createElement('canvas');canvas.width=canvas.height=(count+border*2)*cell;
  const context=canvas.getContext('2d');if(!context)throw new Error('QR 이미지를 만들지 못했습니다. 연결 링크 복사를 사용해 주세요.');
  context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.fillStyle='#000';
  for(let row=0;row<count;row++)for(let column=0;column<count;column++)if(qr.isDark(row,column))context.fillRect((column+border)*cell,(row+border)*cell,cell,cell);
  const image=canvas.toDataURL('image/png');$('connection-qr').src=image;$('qr-download').href=image;$('qr-dialog').showModal();
}
$('show-qr').addEventListener('click',()=>{
  try{showQr(store.status.config);}catch(error){populate();if(!dialog.open)dialog.showModal();message('먼저 연결 설정을 저장하거나 개인 설정 링크·QR로 불러와 주세요.','settings-error');}
});
$('settings-show-qr').addEventListener('click',()=>{try{showQr(Object.fromEntries(new FormData(form)));}catch(error){message(error,'settings-error');}});
$('qr-close').addEventListener('click',()=>$('qr-dialog').close());
$('qr-dialog').addEventListener('close',()=>{$('connection-qr').removeAttribute('src');$('qr-download').removeAttribute('href');});
form.addEventListener('submit',event=>{event.preventDefault();action(()=>store.saveConfig(Object.fromEntries(new FormData(form))),true);});
$('connect').addEventListener('click',async()=>{
  if(!store.status.config.clientId) {populate();dialog.showModal();message('먼저 연결 설정을 저장해 주세요.','settings-error');return;}
  $('connect').disabled=true;
  await action(()=>store.connect());
});
$('config-file').addEventListener('change',async event=>{
  const file=event.target.files[0]; if(!file)return;
  try {if(file.size>20000)throw new Error('설정 파일이 너무 큽니다.');const value=JSON.parse(await file.text());populate({...store.status.config,...value});}catch{message('설정 JSON 파일을 확인해 주세요.','settings-error');}finally{event.target.value='';}
});
function consumeSetupLink() {
  if(!location.hash.startsWith('#setup='))return;
  const fragment=location.hash;
  // The fragment is never sent in HTTP requests. Remove it before showing settings.
  history.replaceState(null,'',location.pathname+location.search);
  try {
    if(store.status.busy)throw new Error('Google 연결이나 저장이 끝난 뒤 설정 링크를 다시 열어 주세요.');
    const settings=decodeSetup(fragment);populate(settings);
    $('setup-note').hidden=false;
    $('settings-error').hidden=true;
    if(!dialog.open)dialog.showModal();
  }catch(error){message(error);}
}
$('settings-open').addEventListener('click',()=>{$('setup-note').hidden=true;});
$('save-config-file').addEventListener('click',()=>{
  try {
    const settings=validateSettings(Object.fromEntries(new FormData(form)));
    const url=URL.createObjectURL(new Blob([JSON.stringify(settings,null,2)],{type:'application/json'}));
    const anchor=document.createElement('a');anchor.href=url;anchor.download='biuum-connection.local.json';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
  }catch(error){message(error,'settings-error');}
});
$('copy-setup-link').addEventListener('click',async()=>{
  try {
    const link=setupUrl(Object.fromEntries(new FormData(form)),location.href);
    try{await navigator.clipboard.writeText(link);$('transfer-note').textContent='개인 연결 링크를 복사했습니다. 다른 기기에서 열면 입력 없이 설정을 불러옵니다.';}
    catch{$('setup-link-text').value=link;$('setup-link-text').hidden=false;$('setup-link-text').select();$('transfer-note').textContent='아래 연결 링크를 길게 눌러 복사해 주세요.';}
    $('transfer-note').hidden=false;
  }catch(error){message(error,'settings-error');}
});
window.addEventListener('hashchange',consumeSetupLink);
$('quick-connect').addEventListener('click',()=>action(async()=>{
  await store.saveConfig(Object.fromEntries(new FormData(form)));
  dialog.close();
  await store.connect();
}));
$('demo').addEventListener('click',()=>action(()=>store.useDemo(),true));
$('offline').addEventListener('click',()=>action(()=>store.useOffline(),true));
$('disconnect').addEventListener('click',()=>action(()=>store.disconnect(),true));
$('clear-cache').addEventListener('click',()=>action(()=>store.clearCache(),true));
window.addEventListener('biuum-status',update);
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installing=event;$('install').hidden=false;});
$('install').addEventListener('click',async()=>{if(!installing)return;await installing.prompt();installing=null;$('install').hidden=true;});
window.addEventListener('appinstalled',()=>{$('install').hidden=true;});
if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(()=>message('기기에서 앱 캐시를 등록하지 못했습니다. 온라인 기능은 계속 사용할 수 있습니다.'));
update();
consumeSetupLink();
