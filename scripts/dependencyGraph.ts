import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = resolve(import.meta.dirname, "..");
const outputDirectory = join(root, ".dependencygraph");
const port = Number(process.env["DEP_GRAPH_PORT"] ?? 4175);

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
  if (match?.[1]) return match[1];
  if (source.startsWith("scripts/")) return "scripts";
  if (source.startsWith("lint/")) return "lint";
  return "other";
}

async function generate(): Promise<void> {
  await mkdir(outputDirectory, { recursive: true });
  const { stdout } = await execFileAsync(
    "npx",
    [
      "depcruise",
      "src",
      "scripts",
      "lint",
      "--config",
      "--output-type",
      "json",
      "--progress",
      "none",
      "--metrics",
    ],
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
  console.log(
    `Wrote ${nodes.length} modules and ${links.length} dependencies to .dependencygraph/`,
  );
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
    .layout-picker { position:fixed; z-index:2; left:16px; top:68px; display:flex; border:1px solid var(--line); border-radius:6px; overflow:hidden; background:rgba(23,25,22,.94); }
    .layout-picker button { height:32px; border:0; border-right:1px solid var(--line); border-radius:0; background:transparent; color:var(--muted); }
    .layout-picker button:last-child { border-right:0; }
    .layout-picker button.active { background:var(--accent); color:#171916; }
    .controls { position:fixed; z-index:2; right:16px; top:68px; width:220px; border:1px solid var(--line); border-radius:8px; background:rgba(23,25,22,.96); padding:10px 12px; }
    .controls label { display:grid; grid-template-columns:1fr 42px; align-items:center; gap:8px; color:var(--muted); font-size:12px; }
    .controls label + label { margin-top:8px; }
    .controls input[type=range] { grid-column:1/-1; width:100%; height:18px; accent-color:var(--accent); }
    .controls output { color:var(--ink); text-align:right; }
  </style>
</head>
<body>
  <div class="topbar">
    <h1>Make a Move</h1>
    <input id="search" type="search" placeholder="Find module or cluster" autocomplete="off" />
    <button id="reset" title="Reset view">Reset</button>
    <button id="pause" title="Fit graph in view">Fit</button>
    <div id="stats" class="stats"></div>
  </div>
  <canvas id="graph"></canvas>
  <nav class="layout-picker" aria-label="Layout">
    <button data-layout="clusters" class="active">Cluster atlas</button>
    <button data-layout="flow">Dependency flow</button>
  </nav>
  <div id="legend" class="legend"></div>
  <aside class="controls" aria-label="Layout controls">
    <label>Row spacing <output id="row-spacing-value">26</output><input id="row-spacing" type="range" min="18" max="42" step="2" value="26" /></label>
    <label>Column gap <output id="column-gap-value">250</output><input id="column-gap" type="range" min="180" max="360" step="10" value="250" /></label>
    <label>Cluster columns <output id="cluster-columns-value">5</output><input id="cluster-columns" type="range" min="3" max="7" step="1" value="5" /></label>
    <label>Cross-cluster pull <output id="cluster-attraction-value">0.020</output><input id="cluster-attraction" type="range" min="0.005" max="0.050" step="0.001" value="0.020" /></label>
    <label>Edge opacity <output id="edge-opacity-value">6</output><input id="edge-opacity" type="range" min="2" max="55" step="1" value="6" /></label>
  </aside>
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
let clusterRects = {};
let selected = null, hovered = null, running = false, clusterFilter = null, layout = 'clusters';
let layoutConfig = {rowSpacing:26,columnGap:250,clusterColumns:5,clusterAttraction:.020,edgeOpacity:.06};
let layoutBounds = {x:0,y:0,width:1,height:1};
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
    wakeLayout();
  }));
  reset();
  requestAnimationFrame(frame);
});

function reset(){
  selected=null; clusterFilter=null; details.hidden=true; hovered=null;
  search.value='';
  legend.querySelectorAll('button').forEach(button=>button.classList.remove('active'));
  applyLayout();
}

function screenPoint(clientX,clientY){ return {x:(clientX-view.x)/view.scale,y:(clientY-view.y)/view.scale}; }

function neighbors(id){
  const result=new Set([id]);
  graph.links.forEach(link=>{ if(link.source===id) result.add(link.target); if(link.target===id) result.add(link.source); });
  return result;
}

function visibleNodes(){
  const query=search.value.trim().toLowerCase();
  const focus=selected ? neighbors(selected.id) : null;
  return graph.nodes.filter(node=>{
    if(clusterFilter&&node.cluster!==clusterFilter)return false;
    if(selected&&!focus.has(node.id))return false;
    if(query&&!node.id.toLowerCase().includes(query)&&!node.cluster.toLowerCase().includes(query))return false;
    return true;
  });
}

function visibleLinks(nodes){
  const ids=new Set(nodes.map(node=>node.id));
  return graph.links.filter(link=>ids.has(link.source)&&ids.has(link.target));
}

function wakeLayout(){
  applyLayout();
}

function tick(){
}

function applyLayout(){
  if(!graph)return;
  const nodes=visibleNodes();
  if(layout==='flow')applyFlowLayout(nodes);
  else applyClusterLayout(nodes);
  fitView();
}

function applyClusterLayout(nodes){
  const clusterNames=[...new Set(nodes.map(node=>node.cluster))].sort((a,b)=>a.localeCompare(b));
  const spacing=layoutConfig.rowSpacing;
  const gap=layoutConfig.columnGap;
  clusterRects={};
  const blocks=clusterNames.map(cluster=>{
    const members=nodes.filter(node=>node.cluster===cluster);
    const cols=Math.max(2,Math.ceil(Math.sqrt(members.length*1.7)));
    const rows=Math.ceil(members.length/cols);
    return {cluster,members,cols,rows,width:Math.max(150,cols*spacing*1.9),height:Math.max(74,(rows+1)*spacing)};
  });
  let cursorX=0,cursorY=0,rowHeight=0;
  blocks.forEach((block,index)=>{
    const column=index%layoutConfig.clusterColumns;
    if(column===0&&index>0){cursorX=0;cursorY+=rowHeight+85;rowHeight=0;}
    block.x=cursorX;block.y=cursorY;block.anchorX=cursorX;block.anchorY=cursorY;block.vx=0;block.vy=0;
    block.members.forEach((node,i)=>{
      const col=i%block.cols,row=Math.floor(i/block.cols);
      node.x=cursorX+24+col*spacing*1.9;
      node.y=cursorY+48+row*spacing;
      node.offsetX=node.x-cursorX;node.offsetY=node.y-cursorY;
      node.vx=0;node.vy=0;
    });
    clusterRects[block.cluster]={x:cursorX,y:cursorY,width:block.width,height:block.height};
    rowHeight=Math.max(rowHeight,block.height);
    cursorX+=block.width+gap*.34;
  });
  settleClusterBlocks(blocks,nodes,spacing);
  setLayoutBounds(nodes);
}

function settleClusterBlocks(blocks,nodes,spacing){
  const crossLinks=new Map();
  graph.links.forEach(link=>{
    if(!link.sourceNode||!link.targetNode)return;
    const a=link.sourceNode.cluster,b=link.targetNode.cluster;
    if(a===b)return;
    const ordered=a<b?a+'\u0000'+b:b+'\u0000'+a;
    crossLinks.set(ordered,(crossLinks.get(ordered)||0)+1);
  });
  for(let step=0;step<180;step++){
    blocks.forEach(block=>{
      block.vx+=(block.anchorX-block.x)*.003;
      block.vy+=(block.anchorY-block.y)*.003;
    });
    for(let i=0;i<blocks.length;i++) for(let j=i+1;j<blocks.length;j++){
      const a=blocks[i],b=blocks[j];
      const ax=a.x+a.width*.5,ay=a.y+a.height*.5,bx=b.x+b.width*.5,by=b.y+b.height*.5;
      let dx=bx-ax,dy=by-ay;const d=Math.sqrt(dx*dx+dy*dy)+1;
      dx/=d;dy/=d;
      const repulsion=8500/(d*d);
      a.vx-=dx*repulsion;a.vy-=dy*repulsion;b.vx+=dx*repulsion;b.vy+=dy*repulsion;
    }
    crossLinks.forEach((count,key)=>{
      const clusters=key.split('\u0000');
      const a=blocks.find(block=>block.cluster===clusters[0]);
      const b=blocks.find(block=>block.cluster===clusters[1]);
      if(!a||!b)return;
      const ax=a.x+a.width*.5,ay=a.y+a.height*.5,bx=b.x+b.width*.5,by=b.y+b.height*.5;
      let dx=bx-ax,dy=by-ay;const d=Math.sqrt(dx*dx+dy*dy)+1;
      dx/=d;dy/=d;
      const desired=(a.width+b.width)*.38+spacing*3;
      const weight=1+Math.log2(count);
      const force=(d-desired)*layoutConfig.clusterAttraction*weight*.012;
      a.vx+=dx*force;a.vy+=dy*force;b.vx-=dx*force;b.vy-=dy*force;
    });
    blocks.forEach(block=>{
      block.vx*=.72;block.vy*=.72;
      const speed=Math.hypot(block.vx,block.vy);if(speed>8){block.vx*=8/speed;block.vy*=8/speed;}
      block.x+=block.vx;block.y+=block.vy;
      block.x=Math.max(block.anchorX-220,Math.min(block.anchorX+220,block.x));
      block.y=Math.max(block.anchorY-220,Math.min(block.anchorY+220,block.y));
    });
  }
  blocks.forEach(block=>{
    clusterRects[block.cluster]={x:block.x,y:block.y,width:block.width,height:block.height};
    block.members.forEach(node=>{
      node.x=block.x+node.offsetX;
      node.y=block.y+node.offsetY;
      node.vx=0;node.vy=0;
    });
  });
  settleModulesInClusters(blocks,spacing);
}

function settleModulesInClusters(blocks,spacing){
  blocks.forEach(block=>{
    const members=block.members;
    for(let step=0;step<70;step++){
      for(let i=0;i<members.length;i++) for(let j=i+1;j<members.length;j++){
        const a=members[i],b=members[j];let dx=b.x-a.x,dy=b.y-a.y;const d2=dx*dx+dy*dy+16;
        const d=Math.sqrt(d2),force=180/d2;dx/=d;dy/=d;
        a.vx-=dx*force;a.vy-=dy*force;b.vx+=dx*force;b.vy+=dy*force;
      }
      graph.links.forEach(link=>{
        if(link.sourceNode.cluster!==block.cluster||link.targetNode.cluster!==block.cluster)return;
        const a=link.sourceNode,b=link.targetNode;if(!members.includes(a)||!members.includes(b))return;
        let dx=b.x-a.x,dy=b.y-a.y;const d=Math.sqrt(dx*dx+dy*dy)+1;dx/=d;dy/=d;
        const force=(d-spacing*1.8)*.012;a.vx+=dx*force;a.vy+=dy*force;b.vx-=dx*force;b.vy-=dy*force;
      });
      members.forEach(node=>{
        const centerX=block.x+block.width*.5,centerY=block.y+block.height*.5;
        node.vx+=(centerX-node.x)*.012;node.vy+=(centerY-node.y)*.012;
        node.vx*=.78;node.vy*=.78;
        const speed=Math.hypot(node.vx,node.vy);if(speed>4){node.vx*=4/speed;node.vy*=4/speed;}
        node.x+=node.vx;node.y+=node.vy;
        node.x=Math.max(block.x+8,Math.min(block.x+block.width-8,node.x));
        node.y=Math.max(block.y+34,Math.min(block.y+block.height-8,node.y));
      });
    }
  });
}

function applyFlowLayout(nodes){
  const memo=new Map(),visiting=new Set();
  function depth(id){
    if(memo.has(id))return memo.get(id);
    if(visiting.has(id))return 0;
    visiting.add(id);
    const outgoing=graph.links.filter(link=>link.source===id).map(link=>link.target);
    const rank=outgoing.length?1+Math.max(...outgoing.map(target=>depth(target))):0;
    visiting.delete(id);memo.set(id,rank);return rank;
  }
  nodes.forEach(node=>depth(node.id));
  const ranks=new Map();
  nodes.forEach(node=>{
    const rank=memo.get(node.id)||0;
    if(!ranks.has(rank))ranks.set(rank,[]);
    ranks.get(rank).push(node);
  });
  const rankNumbers=[...ranks.keys()].sort((a,b)=>a-b);
  rankNumbers.forEach((rank,column)=>{
    const members=ranks.get(rank).sort((a,b)=>a.cluster.localeCompare(b.cluster)||a.id.localeCompare(b.id));
    const cols=Math.max(1,Math.ceil(Math.sqrt(members.length*.55)));
    members.forEach((node,i)=>{
      const col=i%cols,row=Math.floor(i/cols);
      node.x=40+column*layoutConfig.columnGap+col*layoutConfig.rowSpacing*2;
      node.y=40+row*layoutConfig.rowSpacing;
      node.vx=0;node.vy=0;
    });
  });
  setLayoutBounds(nodes);
}

function setLayoutBounds(nodes){
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  nodes.forEach(node=>{minX=Math.min(minX,node.x-12);minY=Math.min(minY,node.y-12);maxX=Math.max(maxX,node.x+12);maxY=Math.max(maxY,node.y+12);});
  if(!Number.isFinite(minX)){minX=0;minY=0;maxX=1;maxY=1;}
  layoutBounds={x:minX,y:minY,width:maxX-minX,height:maxY-minY};
}

function fitView(){
  const usableWidth=width-180,usableHeight=height-160;
  view.scale=Math.max(.12,Math.min(2.5,(layoutBounds.width?usableWidth/layoutBounds.width:1),(layoutBounds.height?usableHeight/layoutBounds.height:1)));
  view.x=width*.5-(layoutBounds.x+layoutBounds.width*.5)*view.scale;
  view.y=height*.54-(layoutBounds.y+layoutBounds.height*.5)*view.scale;
}

function clusterBoundaryPoint(rect, toward){
  const from={x:rect.x+rect.width*.5,y:rect.y+rect.height*.5};
  const dx=toward.x-from.x,dy=toward.y-from.y;
  const horizontal=rect.width*.5/(Math.abs(dx)||.001);
  const vertical=rect.height*.5/(Math.abs(dy)||.001);
  const factor=Math.min(horizontal,vertical);
  return {x:from.x+dx*factor,y:from.y+dy*factor};
}

function frame(){
  context.setTransform(dpr,0,0,dpr,0,0); context.clearRect(0,0,width,height);
  context.save(); context.translate(view.x,view.y); context.scale(view.scale,view.scale);
  if(!graph){context.restore();requestAnimationFrame(frame);return;}
  const nodes=visibleNodes(), links=visibleLinks(nodes);
  if(layout==='clusters'){
    context.textAlign='left';context.textBaseline='middle';context.font=(14/view.scale)+'px ui-monospace, monospace';
    Object.entries(clusterRects).forEach(([cluster,rect])=>{
      context.strokeStyle='rgba(160,165,155,.14)';context.lineWidth=1/view.scale;
      context.beginPath();context.roundRect(rect.x,rect.y,rect.width,rect.height,6);context.stroke();
      context.fillStyle=graph.colors[cluster]||'#999c96';context.fillText(cluster,rect.x+10,rect.y+18);
    });
  }
  context.lineWidth=.7/view.scale;
  if(layout==='clusters'){
    const clusterLinks=new Map();
    links.forEach(link=>{
      const sourceCluster=link.sourceNode.cluster,targetCluster=link.targetNode.cluster;
      if(sourceCluster===targetCluster)return;
      const key=sourceCluster+'\u0000'+targetCluster;
      const aggregate=clusterLinks.get(key)||{source:sourceCluster,target:targetCluster,count:0,circular:false};
      aggregate.count++;
      aggregate.circular ||= Boolean(link.circular);
      clusterLinks.set(key,aggregate);
    });
    clusterLinks.forEach(aggregate=>{
      const sourceRect=clusterRects[aggregate.source],targetRect=clusterRects[aggregate.target];
      if(!sourceRect||!targetRect)return;
      const sourceCenter={x:sourceRect.x+sourceRect.width*.5,y:sourceRect.y+sourceRect.height*.5};
      const targetCenter={x:targetRect.x+targetRect.width*.5,y:targetRect.y+targetRect.height*.5};
      const start=clusterBoundaryPoint(sourceRect,targetCenter),end=clusterBoundaryPoint(targetRect,sourceCenter);
      context.strokeStyle=aggregate.circular?'rgba(230,104,76,.58)':'rgba(160,165,155,'+Math.max(layoutConfig.edgeOpacity,.16)+')';
      context.lineWidth=Math.min(5,1.2+Math.log2(aggregate.count)*.7)/view.scale;
      context.beginPath();context.moveTo(start.x,start.y);context.lineTo(end.x,end.y);context.stroke();
      const dx=end.x-start.x,dy=end.y-start.y,length=Math.hypot(dx,dy)||1;
      const ux=dx/length,uy=dy/length,arrowSize=7/view.scale;
      context.beginPath();
      context.moveTo(end.x,end.y);
      context.lineTo(end.x-ux*arrowSize-uy*arrowSize*.55,end.y-uy*arrowSize+ux*arrowSize*.55);
      context.lineTo(end.x-ux*arrowSize+uy*arrowSize*.55,end.y-uy*arrowSize-ux*arrowSize*.55);
      context.closePath();context.fillStyle=context.strokeStyle;context.fill();
    });
    document.querySelector('#stats').textContent=nodes.length+' modules · '+clusterLinks.size+' cluster links';
    links.filter(link=>link.sourceNode.cluster===link.targetNode.cluster).forEach(link=>{
      context.strokeStyle=link.circular?'rgba(230,104,76,.58)':'rgba(160,165,155,'+layoutConfig.edgeOpacity+')';
      context.lineWidth=.7/view.scale;
      context.beginPath();context.moveTo(link.sourceNode.x,link.sourceNode.y);context.lineTo(link.targetNode.x,link.targetNode.y);context.stroke();
    });
  }else{
    document.querySelector('#stats').textContent=nodes.length+' modules · '+links.length+' edges';
    links.forEach(link=>{
      context.strokeStyle=link.circular?'rgba(230,104,76,.58)':'rgba(160,165,155,'+layoutConfig.edgeOpacity+')';
      context.lineWidth=.7/view.scale;
      context.beginPath();context.moveTo(link.sourceNode.x,link.sourceNode.y);context.lineTo(link.targetNode.x,link.targetNode.y);context.stroke();
    });
  }
  nodes.forEach(node=>{
    const isHovered=hovered===node,isSelected=selected===node;
    const radius=isSelected?7:isHovered?6:4;
    context.beginPath();context.arc(node.x,node.y,radius,0,Math.PI*2);
    context.fillStyle=graph.colors[node.cluster];
    context.fill();
    if(isSelected||isHovered){
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
  const hit=[...visibleNodes()].reverse().find(n=>Math.hypot(n.x-p.x,n.y-p.y)<9/view.scale);
  if(hit){
    selected=hit; wakeLayout();
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
  hovered=[...visibleNodes()].reverse().find(n=>Math.hypot(n.x-p.x,n.y-p.y)<9/view.scale)||null;
});
canvas.addEventListener('pointerup',event=>{drag=null;canvas.classList.remove('dragging');if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);});
canvas.addEventListener('wheel',event=>{
  event.preventDefault();const before=screenPoint(event.clientX,event.clientY);const factor=Math.exp(-event.deltaY*.001);
  view.scale=Math.max(.12,Math.min(6,view.scale*factor));view.x=event.clientX-before.x*view.scale;view.y=event.clientY-before.y*view.scale;
},{passive:false});
search.addEventListener('input',()=>{hovered=null;wakeLayout();});
document.querySelector('#reset').addEventListener('click',reset);
document.querySelector('#pause').addEventListener('click',fitView);
document.querySelectorAll('.layout-picker button').forEach(button=>button.addEventListener('click',()=>{
  layout=button.dataset.layout;
  document.querySelectorAll('.layout-picker button').forEach(candidate=>candidate.classList.toggle('active',candidate===button));
  wakeLayout();
}));
const layoutInputs=[
  ['row-spacing','row-spacing-value','rowSpacing',value=>Number(value)],
  ['column-gap','column-gap-value','columnGap',value=>Number(value)],
  ['cluster-columns','cluster-columns-value','clusterColumns',value=>Number(value)],
  ['cluster-attraction','cluster-attraction-value','clusterAttraction',value=>Number(value)],
  ['edge-opacity','edge-opacity-value','edgeOpacity',value=>Number(value)/100],
];
layoutInputs.forEach(([inputId,outputId,key,parseValue])=>{
  const input=document.querySelector('#'+inputId),output=document.querySelector('#'+outputId);
  input.addEventListener('input',()=>{
    const value=parseValue(input.value);
    layoutConfig[key]=value;
    output.textContent=input.value;
    wakeLayout();
  });
});
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

await (process.argv.includes("--serve") ? serve() : generate());
