const DB_NAME = 'biuum-pwa-v1';
let opening;
function database() {
  if (!opening) opening = new Promise((resolve,reject) => {
    const request = indexedDB.open(DB_NAME,1);
    request.onupgradeneeded = () => request.result.createObjectStore('records');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('기기 저장 공간을 열지 못했습니다. 브라우저 저장 허용을 확인해 주세요.'));
    request.onblocked = () => reject(new Error('다른 비움 화면을 닫고 다시 시도해 주세요.'));
  });
  return opening;
}
export const cache = {
  async get(key) {
    const db = await database();
    return new Promise((resolve,reject) => { const r=db.transaction('records').objectStore('records').get(key); r.onsuccess=()=>resolve(r.result); r.onerror=()=>reject(r.error); });
  },
  async set(key,value) {
    const db = await database();
    return new Promise((resolve,reject) => { const tx=db.transaction('records','readwrite'); tx.objectStore('records').put(value,key); tx.oncomplete=()=>resolve(); tx.onerror=()=>reject(tx.error); tx.onabort=()=>reject(tx.error); });
  },
  async delete(key) {
    const db = await database();
    return new Promise((resolve,reject) => { const tx=db.transaction('records','readwrite'); tx.objectStore('records').delete(key); tx.oncomplete=()=>resolve(); tx.onerror=()=>reject(tx.error); });
  },
  async clear() {
    const db = await database();
    return new Promise((resolve,reject) => { const tx=db.transaction('records','readwrite'); tx.objectStore('records').clear(); tx.oncomplete=()=>resolve(); tx.onerror=()=>reject(tx.error); });
  }
};
