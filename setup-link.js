export function validateSettings(value) {
  const result={clientId:String(value.clientId||'').trim(),ownerEmail:String(value.ownerEmail||'').trim().toLowerCase(),sheetId:String(value.sheetId||'').trim(),folderId:String(value.folderId||'').trim(),tabName:String(value.tabName||'물품').trim()};
  if(!/^\S+\.apps\.googleusercontent\.com$/.test(result.clientId) || result.clientId.length>200) throw new Error('Google OAuth 웹 클라이언트 ID를 입력해 주세요.');
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.ownerEmail) || result.ownerEmail.length>254) throw new Error('사용할 본인 Google 계정 이메일을 입력해 주세요.');
  if(!/^[\w-]{1,150}$/.test(result.sheetId) || !/^[\w-]{1,150}$/.test(result.folderId)) throw new Error('시트 ID와 사진 폴더 ID를 입력해 주세요.');
  if(!result.tabName || result.tabName.length>100) throw new Error('물품 탭 이름을 확인해 주세요.');
  return result;
}
export function encodeSetup(value) {
  const bytes=new TextEncoder().encode(JSON.stringify(validateSettings(value)));
  return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
}
export function decodeSetup(fragment) {
  const match=/^#setup=([A-Za-z0-9_-]{1,4096})$/.exec(fragment);
  if(!match) throw new Error('설정 링크를 읽지 못했습니다. 개인 연결 QR이나 링크를 다시 열어 주세요.');
  try {
    const raw=match[1].replaceAll('-','+').replaceAll('_','/');
    const bytes=Uint8Array.from(atob(raw),c=>c.charCodeAt(0));
    return validateSettings(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)));
  } catch {throw new Error('설정 링크 내용이 올바르지 않습니다. QR이나 링크를 다시 확인해 주세요.');}
}
export function setupUrl(value,pageUrl) {
  const url=new URL('./',pageUrl);
  if(!['https:','http:'].includes(url.protocol)) throw new Error('웹 앱에서 연결 링크를 만들어 주세요.');
  url.hash='setup='+encodeSetup(value);
  return url.href;
}
