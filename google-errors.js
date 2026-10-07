// Only allowlisted diagnostic fields are displayed; never render raw API messages,
// response headers, access tokens, file IDs, email addresses or request bodies.
export function googleErrorMessage(status,url,payload={}) {
  const endpoint=new URL(url);
  const service=endpoint.hostname==='sheets.googleapis.com'?'Google Sheets API':endpoint.pathname.includes('/drive/')?'Google Drive API':'Google 계정 확인';
  const error=payload?.error || {};
  const details=Array.isArray(error.details)?error.details:[];
  const reasons=[...(Array.isArray(error.errors)?error.errors:[]).map(entry=>entry.reason),...details.map(entry=>entry.reason)].filter(reason=>typeof reason==='string');
  const reason=reasons.find(value=>['SERVICE_DISABLED','accessNotConfigured','ACCESS_TOKEN_SCOPE_INSUFFICIENT','insufficientPermissions','insufficientFilePermissions','storageQuotaExceeded','rateLimitExceeded','userRateLimitExceeded','dailyLimitExceeded','quotaExceeded'].includes(value));
  if(reason==='SERVICE_DISABLED'||reason==='accessNotConfigured') {
    const consumer=details.map(entry=>entry.metadata?.consumer).find(value=>/^projects\/\d+$/.test(value||''));
    const project=consumer?` 프로젝트 번호 ${consumer.split('/')[1]}에서`:'';
    return `${service}가${project} 활성화되지 않았습니다. 새 OAuth 클라이언트를 만든 Google Cloud 프로젝트에서 이 API를 사용 설정해 주세요. (${reason})`;
  }
  if(reason==='ACCESS_TOKEN_SCOPE_INSUFFICIENT'||reason==='insufficientPermissions') return `${service} 접근 범위가 부족합니다. Google에 다시 연결하고 파일 접근 권한을 승인해 주세요. (${reason})`;
  if(reason==='insufficientFilePermissions') return `${service} 파일 권한이 부족합니다. 연결한 본인 계정이 시트·사진 폴더를 편집할 수 있는지 확인해 주세요. (${reason})`;
  if(reason==='storageQuotaExceeded') return 'Google Drive 저장 공간이 부족합니다. 저장 공간을 확인해 주세요. (storageQuotaExceeded)';
  if(['rateLimitExceeded','userRateLimitExceeded','dailyLimitExceeded','quotaExceeded'].includes(reason)||status===429) return `${service} 요청 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.`;
  if(status===404) return `${service} 파일을 찾을 수 없거나 접근 권한이 없습니다. 시트·사진 폴더 ID와 연결 계정을 확인해 주세요.`;
  const safeReason=reasons.find(value=>/^[A-Za-z_]{1,60}$/.test(value));
  if(status===403) return `${service} 요청이 거절됐습니다. 해당 API 사용 설정과 본인 계정의 파일 권한을 확인해 주세요. (403${safeReason?' / '+safeReason:''})`;
  return `${service} 요청이 실패했습니다. (${status}${safeReason?' / '+safeReason:''})`;
}
