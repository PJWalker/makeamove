import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = resolve(import.meta.dirname, "..");
const outputDirectory = join(root, ".dependencygraph");
const port = Number(process.env.DEP_GRAPH_PORT ?? 4175);

interface CruiserDependency {
  resolved: string;
  circular?: boolean;
  valid: boolean;
}

interface CruiserModule {
  source: string;
  dependencies: CruiserDependency[];
  valid: boolean;
}

interface CruiseResult {
  modules: CruiserModule[];
  summary?: {
    violations: unknown[];
  };
}

function cluster(source: string): string {
  const match = /^src\/([^/]+)/.exec(source);
  if (match) return match[1];
  if (source.startsWith("scripts/")) return "scripts";
  if (source.startsWith("lint/")) return "lint";
  return "other";
}

async function generate(): Promise<void> {
  await mkdir(outputDirectory, { recursive: true });
  const { stdout } = await execFileAsync(
    "npx",
    ["depcruise", "src", "scripts", "lint", "--config", "--output-type", "json", "--progress", "none", "--metrics"],
    { cwd: root, maxBuffer: 20 * 1024 * 1024 },
  );
  const result = JSON.parse(stdout) as CruiseResult;
  const sources = new Set(result.modules.map((module) => module.source));
  const nodes = result.modules.map((module) => ({
    id: module.source,
    cluster: cluster(module.source),
    valid: module.valid,
  }));
  const links = result.modules.flatMap((module) =>
    module.dependencies
      .filter((dependency) => sources.has(dependency.resolved))
      .map((dependency) => ({
        source: module.source,
        target: dependency.resolved,
        circular: Boolean(dependency.circular),
        valid: dependency.valid,
      })),
  );
  const graph = {
    nodes,
    links,
    violations: result.summary?.violations ?? [],
    generatedAt: new Date().toISOString(),
  };
  await writeFile(join(outputDirectory, "graph.json"), `${JSON.stringify(graph, null, 2)}\n`);
  await writeFile(join(outputDirectory, "index.html"), html);
  console.log(`Wrote ${nodes.length} modules and ${links.length} dependencies to .dependencygraph/`);
}

const html = String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Make a Move dependency graph</title>
  <style>
    :root { color-scheme: dark; --ink:#e8e7e1; --muted:#999c96; --panel:#171916; --line:#353832; --accent:#e5b85c; }
    * { box-sizing:border-box; }
    body { margin:0; overflow:hidden; background:#10120f; color:var(--ink); font:14px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; }
    canvas { display:block; width:100vw; height:100vh; cursor:grab; }
    canvas.dragging { cursor:grabbing; }
    .topbar { position:fixed; z-index:2; inset:16px 16px auto 16px; display:flex; align-items:center; gap:10px; pointer-events:none; }
    .topbar > * { pointer-events:auto; }
    h1 { margin:0 12px 0 0; font-size:14px; letter-spacing:0; white-space:nowrap; }
    input { width:min(360px, 35vw); height:36px; border:1px solid var(--line); border-radius:6px; background:rgba(23,25,22,.94); color:var(--ink); padding:0 11px; outline:none; }
    input:focus { border-color:var(--accent); }
    button { height:36px; border:1px solid var(--line); border-radius:6px; background:rgba(23,25,22,.94); color:var(--ink); padding:0 10px; cursor:pointer; }
    button:hover { border-color:#656a60; }
    .panel { position:fixed; z-index:2; right:16px; bottom:16px; width:min(310px, calc(100vw - 32px)); max-height:calc(100vh - 84px); overflow:auto; border:1px solid var(--line); border-radius:8px; background:rgba(23,25,22,.96); padding:12px; }
    .panel[hidden] { display:none; }
    .panel h2 { font-size:13px; margin:0 0 8px; overflow-wrap:anywhere; }
    .panel dl { display:grid; grid-template-columns:auto 1fr; gap:4px 10px; margin:0; color:var(--muted); }
    .panel dd { margin:0; color:var(--ink); overflow-wrap:anywhere; }
    .legend { position:fixed; z-index:2; left:16px; bottom:16px; display:flex; flex-wrap:wrap; gap:6px 12px; width:min(560px, calc(100vw - 360px)); border:1px solid var(--line); border-radius:8px; background:rgba(23,25,22,.92); padding:8px 10px; }
    .legend button { height:auto; border:0; background:none; padding:2px 0; color:var(--muted); }
    .legend button.active { color:var(--ink); }
    .dot { display:inline-block; width:8px; height:8px; border-radius:50%; margin-right:5px; }
    .stats { color:var(--muted); margin-left:auto; white-space:nowrap; }
  </style>
</head>
<body>
  <div class="topbar">
    <h1>Make a Move</h1>
    <input id="search" type="search" placeholder="Find module or cluster" autocomplete="off" />
    <button id="reset" title="Reset view">Reset</button>
    <button id="pause" title="Pause layout">Pause</button>
    <div id="stats" class="stats"></div>
  </div>
  <canvas id="graph"></canvas>
  <div id="legend" class="legend"></div>
  <aside id="details" class="panel" hidden></aside>
<script>
const palette = ['#e5b85c','#79a99a','#b487bd','#cd8068','#79a6c9','#98a36b','#c29a78','#8f99b5','#d39c9f','#78aeb1'];
let graph;
const canvas = document.querySelector('#graph');
const context = canvas.getContext('2d');
const search = document.querySelector('#search');
const details = document.querySelector('#details');
const legend = document.querySelector('#legend');
let width = innerWidth, height = innerHeight, dpr = devicePixelRatio || 1;
let clusterSeeds = {};
let selected = null, hovered = null, running = true, clusterFilter = null;
let view = {x:0,y:0,scale:1};
let drag = null;

function resize(){
  dpr = devicePixelRatio || 1;
  width = innerWidth; height = innerHeight;
  canvas.width = width*dpr; canvas.height = height*dpr;
  canvas.style.width = width+'px'; canvas.style.height = height+'px';
  context.setTransform(dpr,0,0,dpr,0,0);
}

fetch('./graph.json').then(r=>r.json()).then(data=>{
  graph=data;
  const clusters=[...new Set(data.nodes.map(n=>n.cluster))];
  const colors=Object.fromEntries(clusters.map((c,i)=>[c,palette[i%palette.length]]));
  graph.colors=colors;
  const cx=width*.5, cy=height*.5;
  clusterSeeds=Object.fromEntries(clusters.map((cluster,i)=>{
    const angle=i/clusters.length*Math.PI*2-Math.PI*.5;
    const radius=Math.min(width,height)*.29;
    return [cluster,{x:cx+Math.cos(angle)*radius,y:cy+Math.sin(angle)*radius}];
  }));
  data.nodes.forEach((node,i)=>{
    const seed=clusterSeeds[node.cluster];
    const angle=i*2.399963;
    const radius=20+Math.sqrt(i%97)*7;
    node.x=seed.x+Math.cos(angle)*radius; node.y=seed.y+Math.sin(angle)*radius;
    node.vx=0; node.vy=0;
  });
  data.links.forEach(link=>{ link.sourceNode=data.nodes.find(n=>n.id===link.source); link.targetNode=data.nodes.find(n=>n.id===link.target); });
  graph.links=data.links.filter(link=>link.sourceNode&&link.targetNode);
  document.querySelector('#stats').textContent = data.nodes.length+' modules · '+graph.links.length+' edges';
  legend.innerHTML=clusters.map(c=>'<button data-cluster="'+c+'"><span class="dot" style="background:'+colors[c]+'"></span>'+c+'</button>').join('');
  legend.querySelectorAll('button').forEach(button=>button.addEventListener('click',()=>{
    clusterFilter=clusterFilter===button.dataset.cluster ? null : button.dataset.cluster;
    legend.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.cluster===clusterFilter));
  }));
  reset();
  requestAnimationFrame(frame);
});

function reset(){
  view={x:width*.5,y:height*.5,scale:Math.min(width,height)/900};
  selected=null; details.hidden=true;
}

function screenPoint(clientX,clientY){ return {x:(clientX-view.x)/view.scale,y:(clientY-view.y)/view.scale}; }

function neighbors(id){
  const result=new Set([id]);
  graph.links.forEach(link=>{ if(link.source===id) result.add(link.target); if(link.target===id) result.add(link.source); });
  return result;
}

function tick(){
  if(!graph||!running)return;
  const nodes=graph.nodes, links=graph.links;
  for(let i=0;i<nodes.length;i++) for(let j=i+1;j<nodes.length;j++){
    const a=nodes[i],b=nodes[j]; let dx=b.x-a.x,dy=b.y-a.y; let d2=dx*dx+dy*dy+1;
    if(d2<40000){ let d=Math.sqrt(d2),force=850/d2; let fx=dx/d*force,fy=dy/d*force; a.vx-=fx;a.vy-=fy;b.vx+=fx;b.vy+=fy; }
  }
  links.forEach(link=>{
    const a=link.sourceNode,b=link.targetNode; let dx=b.x-a.x,dy=b.y-a.y,d=Math.sqrt(dx*dx+dy*dy)+1;
    let force=(d-90)*.018,fx=dx/d*force,fy=dy/d*force;a.vx+=fx;a.vy+=fy;b.vx-=fx;b.vy-=fy;
  });
  nodes.forEach((node,i)=>{
    const seed=clusterSeeds[node.cluster];
    node.vx+=((seed?.x??width*.5)-node.x)*.0012; node.vy+=((seed?.y??height*.5)-node.y)*.0012;
    node.vx+=(width*.5-node.x)*.00008; node.vy+=(height*.5-node.y)*.00008;
    node.vx*=.91; node.vy*=.91; node.x+=node.vx;node.y+=node.vy;
  });
}

function frame(){
  tick();
  context.setTransform(dpr,0,0,dpr,0,0); context.clearRect(0,0,width,height);
  context.save(); context.translate(view.x,view.y); context.scale(view.scale,view.scale);
  if(!graph){context.restore();requestAnimationFrame(frame);return;}
  const query=search.value.trim().toLowerCase();
  const focus=selected ? neighbors(selected.id) : null;
  context.lineWidth=.7/view.scale;
  graph.links.forEach(link=>{
    let dim=clusterFilter&&(link.sourceNode.cluster!==clusterFilter&&link.targetNode.cluster!==clusterFilter);
    if(selected&&(!focus.has(link.source)||!focus.has(link.target)))dim=true;
    context.strokeStyle=link.circular?'rgba(230,104,76,'+(dim?.08:.58)+')':'rgba(160,165,155,'+(dim?.035:.16)+')';
    context.beginPath();context.moveTo(link.sourceNode.x,link.sourceNode.y);context.lineTo(link.targetNode.x,link.targetNode.y);context.stroke();
  });
  graph.nodes.forEach(node=>{
    let dim=clusterFilter&&node.cluster!==clusterFilter;
    if(selected&&!neighbors(selected.id).has(node.id))dim=true;
    if(query&&!node.id.toLowerCase().includes(query)&&!node.cluster.toLowerCase().includes(query))dim=true;
    const isHovered=hovered===node,isSelected=selected===node;
    const radius=isSelected?7:isHovered?6:4;
    context.beginPath();context.arc(node.x,node.y,radius,0,Math.PI*2);
    context.fillStyle=dim?'rgba(110,115,105,.18)':graph.colors[node.cluster];
    context.fill();
    if(isSelected||isHovered||(!selected&&!query&&false)){
      context.strokeStyle='#f4f1e7';context.lineWidth=1/view.scale;context.stroke();
    }
  });
  context.restore();
  if(hovered){
    context.fillStyle='rgba(15,17,14,.92)';context.strokeStyle='#4a4d46';context.lineWidth=1;
    const label=hovered.id; context.font='12px ui-monospace, monospace'; const tw=context.measureText(label).width;
    const sx=hovered.x*view.scale+view.x+10,sy=hovered.y*view.scale+view.y-25;
    context.beginPath();context.roundRect(sx,sy,tw+16,24,4);context.fill();context.stroke();
    context.fillStyle='#e8e7e1';context.fillText(label,sx+8,sy+16);
  }
  requestAnimationFrame(frame);
}

canvas.addEventListener('pointerdown',event=>{
  const p=screenPoint(event.clientX,event.clientY);
  const hit=[...graph?.nodes||[]].reverse().find(n=>Math.hypot(n.x-p.x,n.y-p.y)<9/view.scale);
  if(hit){
    selected=hit; running=false; document.querySelector('#pause').textContent='Resume';
    const incoming=graph.links.filter(l=>l.target===hit.id).length;
    const outgoing=graph.links.filter(l=>l.source===hit.id).length;
    details.hidden=false;
    details.innerHTML='<h2>'+hit.id+'</h2><dl><dt>Cluster</dt><dd>'+hit.cluster+'</dd><dt>Imports</dt><dd>'+outgoing+'</dd><dt>Imported by</dt><dd>'+incoming+'</dd><dt>Valid</dt><dd>'+hit.valid+'</dd></dl>';
  }else{
    drag={x:event.clientX,y:event.clientY,vx:view.x,vy:view.y};canvas.classList.add('dragging');canvas.setPointerCapture(event.pointerId);
  }
});
canvas.addEventListener('pointermove',event=>{
  if(drag){view.x=drag.vx+event.clientX-drag.x;view.y=drag.vy+event.clientY-drag.y;return;}
  if(!graph)return; const p=screenPoint(event.clientX,event.clientY);
  hovered=[...graph.nodes].reverse().find(n=>Math.hypot(n.x-p.x,n.y-p.y)<9/view.scale)||null;
});
canvas.addEventListener('pointerup',event=>{drag=null;canvas.classList.remove('dragging');if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);});
canvas.addEventListener('wheel',event=>{
  event.preventDefault();const before=screenPoint(event.clientX,event.clientY);const factor=Math.exp(-event.deltaY*.001);
  view.scale=Math.max(.12,Math.min(6,view.scale*factor));view.x=event.clientX-before.x*view.scale;view.y=event.clientY-before.y*view.scale;
},{passive:false});
search.addEventListener('input',()=>{if(!search.value.trim())hovered=null;});
document.querySelector('#reset').addEventListener('click',reset);
document.querySelector('#pause').addEventListener('click',event=>{running=!running;event.currentTarget.textContent=running?'Pause':'Resume';});
addEventListener('resize',resize);resize();
</script>
</body>
</html>`;

async function serve(): Promise<void> {
  await generate();
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    const relative = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    const filePath = resolve(outputDirectory, relative);
    if (!filePath.startsWith(outputDirectory)) {
      response.writeHead(403).end();
      return;
    }
    try {
      const content = await readFile(filePath);
      const type = extname(filePath) === ".json" ? "application/json" : "text/html; charset=utf-8";
      response.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
      response.end(content);
    } catch {
      response.writeHead(404).end("Not found");
    }
  });
  server.listen(port, "127.0.0.1", () => {
    console.log(`Dependency graph: http://127.0.0.1:${port}`);
  });
}

if (process.argv.includes("--serve")) await serve();
else await generate();
