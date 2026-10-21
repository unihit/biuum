import test from 'node:test';
import assert from 'node:assert/strict';
import {HEADERS,toRow,newItem} from '../model.js';
import {cache} from '../cache.js';

// Browser stubs: store.js runs in the browser, so the test provides the same globals.
const storage=new Map();
globalThis.localStorage={
  getItem:key=>storage.has(key)?storage.get(key):null,
  setItem:(key,value)=>storage.set(key,String(value)),
  removeItem:key=>storage.delete(key)
};
const events=new EventTarget();
Object.defineProperty(globalThis,'navigator',{configurable:true,value:{onLine:true,userAgent:'Mozilla/5.0 (Linux; Android 14) Chrome/120 Mobile Safari/537.36'}});
const tokenCalls=[];
let tokenSeq=0;
globalThis.window={
  addEventListener:(...args)=>events.addEventListener(...args),
  dispatchEvent:event=>events.dispatchEvent(event),
  google:{accounts:{oauth2:{
    initTokenClient({callback}){
      return {requestAccessToken({prompt}){
        tokenCalls.push(prompt);
        setTimeout(()=>callback({access_token:'token'+(++tokenSeq),expires_in:3600}),0);
      }};
    },
    hasGrantedAllScopes(){return true;}
  }}}
};
const memories=new Map();
cache.get=async key=>structuredClone(memories.get(key));
cache.set=async(key,value)=>memories.set(key,structuredClone(value));
cache.delete=async key=>memories.delete(key);

const state={
  claim:null,claimFile:null,fail401Once:false,
  sheets:[HEADERS,toRow(newItem({name:'의자',price:1000,place:'베란다'},'id-1',[],'2026-10-01T00:00:00.000Z'))]
};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
globalThis.fetch=async(url,options={})=>{
  const target=String(url),method=options.method||'GET';
  if(target.includes('oauth2/v3/userinfo')) return json({email:'owner@example.com',email_verified:true});
  if(target.includes('/drive/v3/files/folder')&&target.includes('capabilities')) return json({mimeType:'application/vnd.google-apps.folder',trashed:false,capabilities:{canAddChildren:true}});
  if(target.includes('/values/')){
    if(state.fail401Once){state.fail401Once=false;return json({error:{code:401}},401);}
    return json({values:state.sheets});
  }
  if(target.includes('/drive/v3/files/claim1')&&method==='DELETE'){state.claimFile=null;state.claim=null;return new Response(null,{status:204});}
  if(target.includes('biuum-device.json')) return json({files:state.claimFile?[{id:state.claimFile.id,name:'biuum-device.json'}]:[]});
  if(target.includes('/upload/drive/v3/files?')&&method==='POST'){
    const text=await options.body.text();
    state.claim=JSON.parse(/\r\nContent-Type: application\/json\r\n\r\n(\{.*\})\r\n--/.exec(text)[1]);
    state.claimFile={id:'claim1'};
    return json({id:'claim1'});
  }
  if(target.includes('/upload/drive/v3/files/claim1')&&method==='PATCH'){state.claim=JSON.parse(options.body);return json({id:'claim1'});}
  if(target.includes('/drive/v3/files/claim1?alt=media')) return json(state.claim||{});
  return json({});
};

const realInterval=globalThis.setInterval;
globalThis.setInterval=()=>0;
const {store}=await import('../store.js');
globalThis.setInterval=realInterval;

test('조회 기기는 등록 기록 없이 읽기만 하고 쓰기를 거부한다',async()=>{
  await store.saveConfig({clientId:'123-abc.apps.googleusercontent.com',ownerEmail:'owner@example.com',sheetId:'sheet1',folderId:'folder',tabName:'물품'});
  assert.equal(store.status.role,'reader');
  await store.connect();
  assert.equal(store.status.mode,'google');
  assert.equal(state.claimFile,null);
  assert.equal(tokenCalls[0],'select_account');
  await assert.rejects(store.call('createItem',{name:'x',price:1,place:'y',photos:[],description:''}),/조회 전용/);
});

test('등록 기기는 기록을 만들고 저장하며 조회 전용 전환 시 기록을 해제한다',async()=>{
  await store.setRole('writer');
  assert.equal(store.status.role,'writer');
  assert.equal(state.claim?.writerName,'Android · Chrome');
  const listed=await store.call('listItems');
  const target=listed.find(item=>item.id==='id-1');
  const updated=await store.call('updateItem',target.id,{status:'selling'},target.updatedAt);
  assert.equal(updated.status,'selling');
  await store.setRole('reader');
  assert.equal(state.claimFile,null);
  assert.equal(store.status.role,'reader');
});

test('만료 응답은 조용히 토큰을 갱신하고 한 번 재시도한다',async()=>{
  await store.setRole('writer');
  state.fail401Once=true;
  const before=tokenSeq;
  const items=await store.call('listItems');
  assert.equal(items.length,1);
  assert.equal(tokenSeq,before+1);
  assert.equal(tokenCalls.at(-1),'');
});

test('다른 기기가 등록 기기가 되면 이 기기는 조회 전용으로 전환된다',async()=>{
  state.claim={version:1,writerId:'other-device',writerName:'iPhone · Safari',claimedAt:new Date().toISOString()};
  await assert.rejects(store.call('updateItem','id-1',{status:'reserved'},'2026-10-01T00:00:00.000Z'),/조회 전용/);
  assert.equal(store.status.role,'reader');
  assert.match(store.status.notice,/iPhone/);
});

test('새로고침하면 조용한 프롬프트로 다시 연결한다',async()=>{
  globalThis.setInterval=()=>0;
  try {
    const fresh=await import('../store.js?reload=1');
    await new Promise(resolve=>setTimeout(resolve,100));
    assert.equal(fresh.store.status.mode,'google');
    assert.equal(tokenCalls.at(-1),'');
  } finally {
    globalThis.setInterval=realInterval;
  }
});
