import test from 'node:test';
import assert from 'node:assert/strict';
import {HEADERS,newItem,toRow,parseRows,patchItem,photoBlob,range,ApiError} from '../model.js';
import {GoogleStore} from '../google-store.js';
const config={ownerEmail:'owner@example.com',sheetId:'sheet',folderId:'folder',tabName:'물품'};
function memory() {const data=new Map();return {data,get:async key=>structuredClone(data.get(key)),set:async(key,value)=>data.set(key,structuredClone(value)),delete:async key=>data.delete(key)};}
const now='2026-10-07T00:00:00.000Z';
const jpeg='data:image/jpeg;base64,'+Buffer.from([255,216,255,217]).toString('base64');
test('old escaped cells and dates roundtrip; blank rows retain actual sheet row numbers',()=>{
  const item=newItem({name:'=SUM(A1)',place:"'보관",description:'@메모',price:0},'a',['photo'],now);
  const rows=parseRows([HEADERS,[],toRow(item)]);assert.equal(rows[0].rowNumber,3);
  const {rowNumber,...result}=rows[0];assert.deepEqual(result,item);
  assert.throws(()=>parseRows([['wrong']]),/첫 행/);
  assert.equal(range("물품'탭",'A:J'),"'물품''탭'!A:J");
});
test('validation rejects corrupt photos and invalid price before cloud writes',async()=>{
  let calls=0;const store=new GoogleStore(config,async()=>{calls++;},memory());
  await assert.rejects(()=>store.createItem({price:-1,photos:[jpeg]}),/가격/);
  await assert.rejects(()=>store.createItem({photos:['data:image/png;base64,AAAA']}),/JPEG/);
  await assert.rejects(()=>store.createItem({photos:[jpeg,jpeg,jpeg,jpeg]}),/최대 3/);
  assert.equal(calls,0);
  assert.throws(()=>photoBlob('data:image/jpeg;base64,AAAA'),/형식/);
});
test('status transitions preserve first listing date; stale updates are rejected',()=>{
  const item=newItem({},'id',[],now),listed=patchItem(item,{status:'selling'},now,'2026-10-08T00:00:00Z');
  assert.equal(listed.listedAt,'2026-10-08T00:00:00Z');
  const reserved=patchItem(listed,{status:'reserved'},listed.updatedAt,'2026-10-09T00:00:00Z');
  assert.equal(reserved.listedAt,listed.listedAt);
  assert.throws(()=>patchItem(reserved,{status:'sold'},now,'later'),/他|다른 화면/);
  assert.throws(()=>patchItem(item,{status:'bad'},now,'later'),/올바르지/);
});
test('lost append response is reconciled without duplicate rows',async()=>{
  const rows=[HEADERS];let appends=0;
  const request=async(url,options={})=>{
    if(options.method==='POST' && url.includes(':append')){appends++;rows.push(JSON.parse(options.body).values[0]);throw new ApiError('lost response',0);}
    return {values:rows};
  };
  const cache=memory(),store=new GoogleStore(config,request,cache);
  await store.listItems();const item=await store.createItem({name:'의자',photos:[]});
  assert.equal(item.name,'의자');assert.equal(appends,1);assert.equal(rows.length,2);
  assert.equal([...cache.data.keys()].filter(key=>key.includes('pending:')).length,0);
});
test('uncommitted uncertain append retry reuses item and photo identities',async()=>{
  const rows=[HEADERS],files=new Set(),cache=memory();let appends=0,uploads=0,generated=0,firstId;
  const request=async(url,options={})=>{
    if(url.includes('generateIds')){generated++;return {ids:['photo-fixed']};}
    if(url.includes('/files/photo-fixed')){
      if(!files.has('photo-fixed'))throw new ApiError('not found',404);
      return {id:'photo-fixed',parents:['folder'],mimeType:'image/jpeg'};
    }
    if(url.includes('/upload/')){uploads++;files.add('photo-fixed');return {id:'photo-fixed'};}
    if(options.method==='POST' && url.includes(':append')){
      appends++;const row=JSON.parse(options.body).values[0];
      if(appends===1){firstId=row[0];throw new ApiError('uncertain',0);}
      assert.equal(row[0],firstId);rows.push(row);return {};
    }
    return {values:rows};
  };
  const store=new GoogleStore(config,request,cache);await store.listItems();
  const input={name:'retry',photos:[jpeg]};
  await assert.rejects(()=>store.createItem(input),/같은 내용/);
  const result=await store.createItem(input);
  assert.equal(result.id,firstId);assert.equal(uploads,1);assert.equal(generated,1);assert.equal(rows.length,2);
});
test('definitive failed append moves created files to trash after confirming no row',async()=>{
  const cache=memory();let trashed=0;
  const request=async(url,options={})=>{
    if(url.includes('generateIds'))return {ids:['p']};
    if(url.includes('/files/p')){if(options.method==='PATCH'){trashed++;assert.equal(JSON.parse(options.body).trashed,true);return {};}throw new ApiError('missing',404);}
    if(url.includes('/upload/'))return {id:'p'};
    if(url.includes(':append'))throw new ApiError('forbidden',403);
    return {values:[HEADERS]};
  };
  const store=new GoogleStore(config,request,cache);await store.listItems();
  await assert.rejects(()=>store.createItem({photos:[jpeg]}));assert.equal(trashed,1);
  assert.equal([...cache.data.keys()].filter(key=>key.includes('pending:')).length,0);
});
test('photo requests reject unregistered IDs and files moved outside folder',async()=>{
  const store=new GoogleStore(config,async()=>({mimeType:'image/jpeg',size:100,parents:['elsewhere']}),memory());
  store.lastItems=[newItem({},'a',['p'],now)];
  await assert.rejects(()=>store.getPhotos(['unknown']),/등록되지/);
  await assert.rejects(()=>store.getPhotos(['p']),/위치/);
});
test('stale sheet edit performs no PUT; valid edit uses current row and RAW',async()=>{
  const original=newItem({name:'old'},'a',[],now);let puts=0;
  const request=async(url,options={})=>{
    if(options.method==='PUT'){puts++;assert.ok(url.includes('A3%3AJ3'));assert.ok(url.includes('valueInputOption=RAW'));assert.equal(JSON.parse(options.body).values[0][1],'new');return {};}
    return {values:[HEADERS,[],toRow(original)]};
  };
  const store=new GoogleStore(config,request,memory());
  await assert.rejects(()=>store.updateItem('a',{name:'new'},'stale'),/다른 화면/);assert.equal(puts,0);
  const result=await store.updateItem('a',{name:'new'},now);assert.equal(result.name,'new');assert.equal(puts,1);
});
test('successive creations remain in offline cache',async()=>{
  const cache=memory(),rows=[HEADERS];
  const store=new GoogleStore(config,async(url,options={})=>{if(url.includes(':append')){rows.push(JSON.parse(options.body).values[0]);return {};}return {values:rows};},cache);
  await store.listItems();await store.createItem({name:'one',photos:[]});await store.createItem({name:'two',photos:[]});
  assert.equal((await cache.get(store.key('items'))).length,2);
});
