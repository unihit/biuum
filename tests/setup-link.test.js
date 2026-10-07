import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeSetup,decodeSetup,setupUrl} from '../setup-link.js';
const settings={clientId:'example.apps.googleusercontent.com',ownerEmail:'owner@example.com',sheetId:'sheet-1',folderId:'folder_1',tabName:'물품 · 판매'};
test('setup QR payload roundtrips Unicode, stays in fragment, and excludes credentials',()=>{
  const input={...settings,access_token:'SECRET',clientSecret:'SECRET',unknown:'SECRET'};
  const link=setupUrl(input,'https://example.github.io/biuum/?previous=query');
  const url=new URL(link);
  assert.equal(url.pathname,'/biuum/');assert.equal(url.search,'');assert.ok(url.hash.startsWith('#setup='));
  assert.deepEqual(decodeSetup(url.hash),settings);
  assert.doesNotMatch(atob(url.hash.slice(7).replaceAll('-','+').replaceAll('_','/')),/SECRET|access_token/);
});
test('malformed and oversized links cannot change connection settings',()=>{
  for(const hash of ['#setup=bad-json','#setup='+ 'A'.repeat(4097),'#setup=../elsewhere','#other=hello'])assert.throws(()=>decodeSetup(hash));
  assert.throws(()=>encodeSetup({...settings,folderId:'https://elsewhere.example'}));
  assert.throws(()=>setupUrl(settings,'javascript:alert(1)'));
});
