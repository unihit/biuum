export const HEADERS = ['id','name','price','status','place','description','photoIds','createdAt','updatedAt','listedAt'];
export const STATUSES = ['ready','selling','reserved','sold','archived'];
export const text = (value, max) => String(value ?? '').trim().slice(0, max);
export function price(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || !Number.isInteger(number) || number < 0 || number > 1e9) throw new Error('가격을 확인해 주세요.');
  return number;
}
// Preserve the original app's escape convention for old and new rows. All writes use RAW.
const encodeCell = value => /^[=+\-@']/.test(value) ? "'" + value : value;
const decodeCell = value => /^'[=+\-@']/.test(String(value || '')) ? String(value).slice(1) : String(value || '');
function date(value) {
  if (typeof value === 'number') return new Date((value - 25569) * 86400000).toISOString();
  return String(value || '');
}
export function parseRows(values) {
  if (!values || values[0]?.slice(0, HEADERS.length).join('|') !== HEADERS.join('|')) throw new Error('물품 시트의 첫 행 구성이 원래 앱과 다릅니다. 설정의 시트와 탭을 확인해 주세요.');
  return values.slice(1).flatMap((row, index) => {
    if (!row[0]) return [];
    let photoIds;
    try { photoIds = JSON.parse(String(row[6] || '[]')); } catch { throw new Error(`${index + 2}행의 사진 목록이 올바르지 않습니다.`); }
    if (!Array.isArray(photoIds) || photoIds.some(id => typeof id !== 'string') || photoIds.length > 3) throw new Error(`${index + 2}행의 사진 목록을 확인해 주세요.`);
    if (!STATUSES.includes(row[3])) throw new Error(`${index + 2}행의 상태를 확인해 주세요.`);
    return [{id:String(row[0]), name:decodeCell(row[1]), price:price(row[2]), status:row[3], place:decodeCell(row[4]), description:decodeCell(row[5]), photoIds, createdAt:date(row[7]), updatedAt:date(row[8]), listedAt:date(row[9]), rowNumber:index + 2}];
  });
}
export function toRow(item) {
  return [item.id,encodeCell(item.name),item.price,item.status,encodeCell(item.place),encodeCell(item.description),JSON.stringify(item.photoIds),item.createdAt,item.updatedAt,item.listedAt];
}
export function newItem(input, id, photoIds, now) {
  return {id,name:text(input.name,80) || '이름 없는 물품',price:price(input.price),status:'ready',place:text(input.place,100),description:text(input.description,1000),photoIds,createdAt:now,updatedAt:now,listedAt:''};
}
export function patchItem(item, patch, expected, now) {
  if (String(expected) !== item.updatedAt) throw new Error('다른 화면에서 수정됐어요. 새로고침 후 다시 시도해 주세요.');
  const status = patch.status === undefined ? item.status : patch.status;
  if (!STATUSES.includes(status)) throw new Error('올바르지 않은 상태예요.');
  let photoIds = item.photoIds;
  if (patch.photoIds !== undefined) {
    const ids = patch.photoIds;
    if (!Array.isArray(ids) || ids.length !== photoIds.length || ids.some(id => typeof id !== 'string') || [...new Set(ids)].length !== ids.length || ids.some(id => !photoIds.includes(id))) throw new Error('이 물품에 등록된 사진 중에서 썸네일을 선택해 주세요.');
    photoIds = [...ids];
  }
  return {...item,photoIds,name:patch.name === undefined ? item.name : text(patch.name,80) || '이름 없는 물품',price:patch.price === undefined ? item.price : price(patch.price),place:patch.place === undefined ? item.place : text(patch.place,100),description:patch.description === undefined ? item.description : text(patch.description,1000),status,updatedAt:now,listedAt:status === 'selling' && !item.listedAt ? now : item.listedAt};
}
export function photoBlob(data) {
  if (typeof data !== 'string' || data.length > 160000 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(data)) throw new Error('사진은 100KB 이하 JPEG여야 합니다.');
  let decoded;
  try { decoded = atob(data.split(',')[1]); } catch { throw new Error('사진 데이터를 읽지 못했습니다.'); }
  const bytes = Uint8Array.from(decoded, c => c.charCodeAt(0));
  if (bytes.length < 4 || bytes.length > 102400 || bytes[0] !== 255 || bytes[1] !== 216) throw new Error('사진 형식 또는 용량을 확인해 주세요.');
  return new Blob([bytes], {type:'image/jpeg'});
}
export const range = (tab, cells) => `'${tab.replaceAll("'", "''")}'!${cells}`;
export class ApiError extends Error {
  constructor(message, status=0) { super(message); this.status=status; }
}
