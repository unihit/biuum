import test from 'node:test';
import assert from 'node:assert/strict';
import {googleErrorMessage} from '../google-errors.js';
test('disabled API identifies service and credential project without exposing raw message',()=>{
  const message=googleErrorMessage(403,'https://sheets.googleapis.com/v4/spreadsheets/private-id',{error:{message:'SECRET TOKEN private-id',details:[{reason:'SERVICE_DISABLED',metadata:{consumer:'projects/576119906648'}}]}});
  assert.match(message,/Google Sheets API/);assert.match(message,/576119906648/);assert.match(message,/SERVICE_DISABLED/);assert.doesNotMatch(message,/SECRET|private-id/);
});
test('OAuth scopes and per-file permissions have separate actionable messages',()=>{
  const url='https://www.googleapis.com/drive/v3/files/private';
  assert.match(googleErrorMessage(403,url,{error:{errors:[{reason:'insufficientPermissions'}]}}),/アクセス|접근 범위/);
  assert.match(googleErrorMessage(403,url,{error:{errors:[{reason:'insufficientFilePermissions'}]}}),/파일 권한/);
});
test('unknown payloads do not render arbitrary messages or identifiers',()=>{
  const result=googleErrorMessage(403,'https://www.googleapis.com/drive/v3/files/private',{error:{message:'Bearer token',errors:[{reason:'owner@example.com'}]}});
  assert.match(result,/403/);assert.doesNotMatch(result,/Bearer|owner|private/);
});
