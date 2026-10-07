import {parseRows,toRow,newItem,patchItem,photoBlob,range,ApiError} from './model.js';
const DRIVE = 'https://www.googleapis.com/drive/v3';
const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';
export class GoogleStore {
  constructor(config, request, cache) {
    this.config = {...config}; this.request=request; this.cache=cache;
    this.prefix = `${config.ownerEmail.toLowerCase()}:${config.sheetId}:${config.folderId}:${config.tabName}:`;
    this.lastItems=[];
  }
  key(name) { return this.prefix + name; }
  sheetUrl(cells, suffix='') {
    return `${SHEETS}/${encodeURIComponent(this.config.sheetId)}/values/${encodeURIComponent(range(this.config.tabName,cells))}${suffix}`;
  }
  async listItems() {
    const result=await this.request(this.sheetUrl('A:J','?valueRenderOption=UNFORMATTED_VALUE'));
    this.lastItems=parseRows(result.values);
    // Cache failures must not turn a successful cloud operation into a failed save.
    await this.cache.set(this.key('items'),this.lastItems).catch(()=>{});
    return this.lastItems.map(({rowNumber,...item})=>item);
  }
  async createItem(input={}) {
    const photos=input.photos || [];
    if (!Array.isArray(photos) || photos.length > 3) throw new Error('사진은 최대 3장까지 추가할 수 있어요.');
    const blobs=photos.map(photoBlob);
    // Validate all fields before any remote file is created.
    newItem(input,'validation',[],new Date().toISOString());
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(input))))).map(n=>n.toString(16).padStart(2,'0')).join('');
    const pendingKey=this.key('pending:'+hash);
    let pending=await this.cache.get(pendingKey);
    if (!pending) {
      const result=blobs.length ? await this.request(`${DRIVE}/files/generateIds?count=${blobs.length}&space=drive&type=files`) : {ids:[]};
      if (result.ids?.length !== blobs.length) throw new Error('사진 저장 준비에 실패했습니다.');
      pending={id:crypto.randomUUID(),ids:result.ids,now:new Date().toISOString()};
      // Persist retry identity before writes. Identical retry reuses file and item IDs.
      await this.cache.set(pendingKey,pending);
    } else {
      const existing=(await this.listItems()).find(item=>item.id===pending.id);
      if (existing) { await this.cache.delete(pendingKey).catch(()=>{}); return existing; }
    }
    for (let i=0;i<blobs.length;i++) {
      const fileId=pending.ids[i];
      let exists=false;
      try {
        const metadata=await this.request(`${DRIVE}/files/${encodeURIComponent(fileId)}?fields=id,parents,mimeType,trashed`);
        if (metadata.trashed || metadata.mimeType!=='image/jpeg' || !metadata.parents?.includes(this.config.folderId)) throw new Error('재시도 사진의 위치가 변경됐습니다.');
        exists=true;
      } catch(error) { if (error.status!==404) throw error; }
      if (!exists) {
        const boundary='biuum_'+crypto.randomUUID();
        const metadata={id:fileId,name:`${pending.id}-${i+1}.jpg`,mimeType:'image/jpeg',parents:[this.config.folderId]};
        const body=new Blob([`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: image/jpeg\r\n\r\n`,blobs[i],`\r\n--${boundary}--\r\n`]);
        await this.request('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',{method:'POST',headers:{'Content-Type':`multipart/related; boundary=${boundary}`},body});
      }
    }
    const item=newItem(input,pending.id,pending.ids,pending.now);
    try {
      await this.request(this.sheetUrl('A:J',':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS'),{method:'POST',body:JSON.stringify({values:[toRow(item)]})});
    } catch(error) {
      // A lost response can follow a committed append. Reconcile before retry/cleanup.
      let checked=false,existing;
      try { existing=(await this.listItems()).find(entry=>entry.id===item.id); checked=true; } catch {}
      if (existing) { await this.cache.delete(pendingKey).catch(()=>{}); return existing; }
      if (checked && error instanceof ApiError && error.status>=400 && error.status<500 && error.status!==408 && error.status!==429) {
        let cleaned=true;
        for (const id of pending.ids) {
          try { await this.request(`${DRIVE}/files/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify({trashed:true})}); } catch { cleaned=false; }
        }
        if (cleaned) await this.cache.delete(pendingKey).catch(()=>{});
      }
      throw new Error('저장 결과를 확인하지 못했습니다. 같은 내용으로 다시 저장하면 중복 여부를 먼저 확인합니다. '+error.message);
    }
    await this.cache.delete(pendingKey).catch(()=>{});
    this.lastItems=[...this.lastItems.filter(entry=>entry.id!==item.id),item];
    await this.cache.set(this.key('items'),this.lastItems).catch(()=>{});
    for (let i=0;i<blobs.length;i++) await this.cache.set(this.key('photo:'+pending.ids[i]),blobs[i]).catch(()=>{});
    return item;
  }
  async updateItem(id,patch,expectedUpdatedAt) {
    await this.listItems();
    const item=this.lastItems.find(entry=>entry.id===id);
    if (!item) throw new Error('물품을 찾을 수 없어요. 목록을 새로고침해 주세요.');
    const now=new Date(Math.max(Date.now(),Date.parse(item.updatedAt)+1 || 0)).toISOString();
    const next=patchItem(item,patch,expectedUpdatedAt,now);
    // Sheets exposes no atomic compare-and-set here: a cross-device race remains.
    await this.request(this.sheetUrl(`A${item.rowNumber}:J${item.rowNumber}`,'?valueInputOption=RAW'),{method:'PUT',body:JSON.stringify({values:[toRow(next)]})});
    this.lastItems=this.lastItems.map(entry=>entry.id===id?next:entry);
    await this.cache.set(this.key('items'),this.lastItems).catch(()=>{});
    const {rowNumber,...result}=next; return result;
  }
  async getPhotos(ids) {
    if (!Array.isArray(ids) || ids.length>12) throw new Error('한 번에 사진 12장까지 불러올 수 있어요.');
    const allowed=new Set(this.lastItems.flatMap(item=>item.photoIds));
    const result={};
    // Bound network concurrency without turning the batch into a dozen serial calls.
    for (let i=0;i<ids.length;i+=3) await Promise.all(ids.slice(i,i+3).map(async id=>{
      if (!allowed.has(id)) throw new Error('이 앱에 등록되지 않은 사진이에요.');
      let blob=await this.cache.get(this.key('photo:'+id)).catch(()=>undefined);
      if (!blob) {
        const metadata=await this.request(`${DRIVE}/files/${encodeURIComponent(id)}?fields=id,mimeType,size,parents,trashed`);
        if (metadata.trashed || metadata.mimeType!=='image/jpeg' || Number(metadata.size)>102400 || !metadata.parents?.includes(this.config.folderId)) throw new Error('사진 위치 또는 형식이 변경됐습니다.');
        blob=await this.request(`${DRIVE}/files/${encodeURIComponent(id)}?alt=media`,{},'blob');
        if (blob.size>102400) throw new Error('사진 용량이 변경됐습니다.');
        await this.cache.set(this.key('photo:'+id),blob).catch(()=>{});
      }
      result[id]=blob;
    }));
    return result;
  }
}
