import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import vm from 'node:vm';
const root=new URL('../',import.meta.url);
test('manifest icons and every offline shell asset exist at a repository-relative path',async()=>{
  const manifest=JSON.parse(await readFile(new URL('manifest.webmanifest',root),'utf8'));
  assert.equal(manifest.start_url,'./');assert.equal(manifest.scope,'./');
  for(const icon of manifest.icons) {assert.ok(icon.src.startsWith('./'));await access(new URL(icon.src,root));}
  const events={},context={self:{registration:{scope:'https://example.github.io/biuum/'},addEventListener:(name,handler)=>events[name]=handler},URL,Request};
  const source=await readFile(new URL('sw.js',root),'utf8');vm.runInNewContext(source,context);
  const assets=vm.runInNewContext('ASSETS',context);
  for(const asset of assets)await access(new URL(asset==='./'?'index.html':asset,root));
  let intercepted=false;
  const respondWith=()=>intercepted=true;
  for(const url of ['https://www.googleapis.com/drive/v3/files/private?alt=media','https://accounts.google.com/gsi/client','https://example.github.io/biuum/connection.local.json']) {
    events.fetch({request:new Request(url),respondWith});assert.equal(intercepted,false);
  }
  events.fetch({request:new Request('https://example.github.io/biuum/index.html',{headers:{Authorization:'Bearer example'}}),respondWith});assert.equal(intercepted,false);
});
