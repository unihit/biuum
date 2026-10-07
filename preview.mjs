import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
const root=resolve(import.meta.dirname);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.json':'application/json'};
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  let path;try{path=decodeURIComponent(url.pathname);}catch{res.writeHead(400);res.end();return;}
  // Serve a nested path too, so repository-scoped PWA assets can be checked locally.
  if(path.startsWith('/biuum/'))path=path.slice('/biuum'.length);
  if(path.endsWith('/'))path+='index.html';
  const file=resolve(root,'.'+path);
  if(!file.startsWith(root+sep)||path.includes('/.')||extname(file)==='.local.json'){res.writeHead(403);res.end();return;}
  try{const data=await readFile(file);res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);}catch{res.writeHead(404);res.end('Not found');}
});
const port=Number(process.argv[2] || 4173);
server.listen(port,'127.0.0.1',()=>console.log(`비움 미리보기: http://localhost:${port}/biuum/`));
