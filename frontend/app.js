// MtB Experiment Dashboard - front end logic (vanilla JS + Plotly).
// ---- Cover page (runs immediately, does not wait for the data)
const cover=(()=>{
  const q=s=>document.querySelector(s),v=q("#cv-vid"),app=q("#app"),cv=q("#cover");
  const go=k=>{const b=k&&q(`#nav button[data-k="${k}"]`);if(b)b.click();app.scrollIntoView({behavior:"smooth"})};
  const still=matchMedia("(prefers-reduced-motion: reduce)").matches;
  // the video may be a normal file (assets/cover.mp4) or an inlined data: URI; data URIs go through a Blob URL, which browsers play more reliably
  const load=async()=>{
    if(still||!v)return;
    try{let src=v.dataset.src;if(src.startsWith("data:")){src=URL.createObjectURL(await (await fetch(src)).blob())}
      v.src=src;v.addEventListener("canplay",()=>{v.classList.add("on");v.play().catch(()=>{})},{once:true});v.load()}catch(e){console.warn("cover video unavailable",e)}
  };
  load();
  // pause the video once the cover is off screen (saves battery/CPU while exploring data)
  if(v&&"IntersectionObserver"in window)new IntersectionObserver(([e])=>{if(!v.src||still)return;e.isIntersecting?v.play().catch(()=>{}):v.pause()},{threshold:.05}).observe(cv);
  q("#cv-start").onclick=()=>go("ov");
  q("#cv-about").onclick=e=>{const b=e.target.closest("[data-go]");if(b)go(b.dataset.go)};
  addEventListener("keydown",e=>{if(e.key=="Enter"&&scrollY<innerHeight*.5&&!/^(INPUT|SELECT|TEXTAREA|BUTTON|A|SUMMARY)$/.test(document.activeElement.tagName))go("ov")});
  // everything below is built from the data itself, so numbers on the cover can never drift from the dashboard
  const TYPE_TXT={"Antibiotic":"Drug exposures at different doses and exposure times.","Respiration":"Hypoxia, re-aeration and other respiratory stresses.","Nutrient":"Different carbon sources, metals and vitamins.","Infection":"Bacteria growing inside host cells.","Genetic Manipulation":"Knockouts, knockdowns, complementation and overexpression."};
  const esc=t=>String(t).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const fill=D=>{
    const A=D.about||{},f=x=>x.toLocaleString(),short=e=>e.name.replace(/ Transcriptome$/,""),
      n=D.exps.reduce((a,e)=>a+e.conds.length,0),u=o=>new Set(D.exps.filter(e=>e.omics==o).flatMap(e=>e.ids.map(x=>x.replace(/_dup\d+$/,"")))).size;
    q("#cv-types").innerHTML=(A.types||[]).map(t=>`<div><b>${esc(t)}</b><p>${esc(TYPE_TXT[t]||"")}</p></div>`).join("");
    q("#cv-stats").innerHTML=[[f(n),"total conditions"],[f(u("Transcriptomics")),"genes identified"],[f(u("Proteomics")),"proteins identified"]].map(([a,b])=>`<div><b>${a}</b><span>${b}</span></div>`).join("");
    const nT=D.exps.filter(e=>e.omics=="Transcriptomics").length,nP=D.exps.filter(e=>e.omics=="Proteomics").length;
    q("#cv-dsum").innerHTML=`<b>${D.exps.length} datasets</b>: ${nT} transcriptomic and ${nP} proteomic.`;
    const team=e=>e.name.split(" ")[0],TS=A.team_sci||{},TC=A.team_ctry||{};
    q("#cv-ds").innerHTML=D.exps.map(e=>{const t=team(e),sc=TS[t];
      return `<li><b>${esc(short(e).replace(/ Proteome$/,""))}</b><em>${e.omics=="Proteomics"?"Proteomic":"Transcriptomic"} · ${esc(e.scale)}</em><span>${e.conds.length} condition${e.conds.length==1?"":"s"}${sc?` · ${sc} scientists`:""}</span>${TC[t]?`<span>${TC[t].map(esc).join(", ")}</span>`:""}</li>`}).join("");
    q("#cv-meta").innerHTML=(A.metadata||[]).length?`<h4>Metadata</h4><p>These two datasets come with <b>metadata</b> describing the experiments behind them. Each entry is named after the first author of its study.</p>`+A.metadata.map(m=>`<div class="cv-mgrp"><div class="cv-mh"><b>${m.items}</b> ${esc(m.study)} studies</div><div class="cv-chips">`+(m.papers||[]).map(p=>`<span title="${esc(p.title)} — ${p.scientists} scientists; ${esc(p.countries.join(", "))}">${esc(p.surname)} (${esc(m.study)} metadata)</span>`).join("")+`</div></div>`).join(""):"";
    if(A.countries)globe(D,A)
  };
  // ---- interactive globe: d3-geo orthographic projection on a canvas (library inlined in assets/globe-lib.js, works offline)
  const globe=(D,A)=>{
    const L=window.GLOBE_LIB,cvs=q("#cv-globe");if(!L||!cvs)return;
    const ctx=cvs.getContext("2d"),tip=q("#cv-gtip"),box=cvs.parentElement,list=q("#cv-countries");
    const feats=L.feature(L.world,L.world.objects.countries).features,borders=L.mesh(L.world,L.world.objects.countries,(a,b)=>a!==b),grat=L.geoGraticule10();
    const MODES={team:{label:"Research teams",line:c=>c.datasets.map(esc).join(" · ")},poon:{label:"Poonawala metadata",line:c=>[...new Set(c.poon)].map(esc).join(" · ")},bei:{label:"Bei metadata",line:c=>[...new Set(c.bei)].map(esc).join(" · ")}};
    const key={team:"datasets",poon:"poon",bei:"bei"};let mode="team",cur=[],hi=new Map(),hiF=[];
    const proj=L.geoOrthographic().clipAngle(90).precision(.4),path=L.geoPath(proj,ctx);
    const TEAL="94,211,207";let rot=[60,-24],size=0,dpr=1,vis=true,drag=null,over=null,sel=null,idle=0,fly=null,pend=false,last=performance.now();
    const reduce=matchMedia("(prefers-reduced-motion: reduce)").matches;
    q("#cv-big").innerHTML=`<b>${A.scientists}</b> scientists in <b>${A.countries.length}</b> countries, counting the dataset teams (${A.team_scientists} scientists) and the authors of the metadata studies.`;
    const modes=q("#cv-modes");modes.innerHTML=Object.entries(MODES).map(([k,m])=>`<button type="button" role="tab" data-m="${k}">${m.label}</button>`).join("");
    const setMode=m=>{mode=m;sel=null;over=null;tip.hidden=true;
      cur=A.countries.filter(c=>c[key[m]].length);hi=new Map(cur.map(c=>[c.id,c]));hiF=feats.filter(x=>hi.has(String(x.id)));
      [...modes.children].forEach(b=>{const on=b.dataset.m==m;b.classList.toggle("on",on);b.setAttribute("aria-selected",on)});
      list.innerHTML=cur.map(c=>`<li><button type="button" data-id="${c.id}"><b>${esc(c.name)}</b><span>${MODES[m].line(c)}</span></button></li>`).join("");ask()};
    modes.onclick=e=>{const b=e.target.closest("button");if(b)setMode(b.dataset.m)};
    const mark=()=>[...list.querySelectorAll("button")].forEach(b=>b.classList.toggle("on",b.dataset.id==(sel||over)));
    const resize=()=>{size=Math.round(box.clientWidth);dpr=Math.min(devicePixelRatio||1,2);cvs.width=cvs.height=Math.round(size*dpr);cvs.style.height=size+"px";draw()};
    const draw=()=>{
      pend=false;if(!size)return;const r=size*.405,c=size/2;   // leaves room for the glow inside the canvas
      ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,size,size);
      proj.translate([c,c]).scale(r).rotate([rot[0],rot[1],0]);
      // atmosphere glow
      let g=ctx.createRadialGradient(c,c,r*.96,c,c,r*1.2);g.addColorStop(0,`rgba(${TEAL},.30)`);g.addColorStop(1,`rgba(${TEAL},0)`);
      ctx.fillStyle=g;ctx.beginPath();ctx.arc(c,c,r*1.2,0,7);ctx.fill();
      // ocean
      g=ctx.createRadialGradient(c-r*.35,c-r*.4,r*.1,c,c,r);g.addColorStop(0,"#14474a");g.addColorStop(.6,"#0b2b2e");g.addColorStop(1,"#061a1c");
      ctx.beginPath();path({type:"Sphere"});ctx.fillStyle=g;ctx.fill();
      ctx.beginPath();path(grat);ctx.strokeStyle=`rgba(${TEAL},.10)`;ctx.lineWidth=.6;ctx.stroke();
      // land + borders
      ctx.beginPath();path({type:"FeatureCollection",features:feats});ctx.fillStyle="#18494b";ctx.fill();
      ctx.beginPath();path(borders);ctx.strokeStyle=`rgba(${TEAL},.22)`;ctx.lineWidth=.6;ctx.stroke();
      // highlighted countries
      hiF.forEach(f=>{const id=String(f.id),on=id==(sel||over);ctx.beginPath();path(f);ctx.fillStyle=on?"#d6fffd":`rgba(${TEAL},.88)`;ctx.fill();ctx.strokeStyle="#e9fffe";ctx.lineWidth=on?1.6:.9;ctx.stroke()});
      // pulsing pins (only on the visible hemisphere)
      const t=reduce?0:(performance.now()%2400)/2400,ctr=[-rot[0],-rot[1]];
      cur.forEach(co=>{if(L.geoDistance(co.lonlat,ctr)>1.5)return;const p=proj(co.lonlat);if(!p)return;
        ctx.beginPath();ctx.arc(p[0],p[1],3,0,7);ctx.fillStyle="#06191b";ctx.fill();ctx.lineWidth=1.4;ctx.strokeStyle="#fff";ctx.stroke();
        if(!reduce){ctx.beginPath();ctx.arc(p[0],p[1],3+14*t,0,7);ctx.strokeStyle=`rgba(255,255,255,${.7*(1-t)})`;ctx.lineWidth=1.2;ctx.stroke()}});
      // rim light
      ctx.beginPath();path({type:"Sphere"});ctx.strokeStyle=`rgba(${TEAL},.55)`;ctx.lineWidth=1.2;ctx.stroke();
    };
    const ask=()=>{if(!pend){pend=true;requestAnimationFrame(draw)}};
    const tick=now=>{const dt=Math.min(now-last,60);last=now;
      if(fly){const k=Math.min(1,(now-fly.t0)/fly.ms),e=1-Math.pow(1-k,3);rot=[fly.a[0]+fly.d[0]*e,fly.a[1]+fly.d[1]*e];if(k>=1)fly=null}
      else if(!drag&&!sel&&!over&&now-idle>2500)rot[0]+=dt*.008;   // slow auto-turn when nobody is touching it
      draw();if(vis&&!reduce)requestAnimationFrame(tick)};
    const flyTo=c=>{const to=[-c.lonlat[0],-Math.max(-60,Math.min(60,c.lonlat[1]))],d0=((to[0]-rot[0]+540)%360)-180;
      if(reduce){rot=to;ask();return}fly={t0:performance.now(),ms:900,a:rot.slice(),d:[d0,to[1]-rot[1]]};if(!vis)return;last=performance.now();requestAnimationFrame(tick)};
    const hit=ev=>{const b=cvs.getBoundingClientRect(),x=ev.clientX-b.left,y=ev.clientY-b.top,ll=proj.invert([x,y]);
      const f=ll&&!isNaN(ll[0])?hiF.find(f=>L.geoContains(f,ll)):null;if(f)return hi.get(String(f.id));
      const ctr=[-rot[0],-rot[1]];   // small countries (Singapore) have no polygon in the map data: use the pin instead
      return cur.find(co=>{if(L.geoDistance(co.lonlat,ctr)>1.5)return false;const p=proj(co.lonlat);return p&&Math.hypot(p[0]-x,p[1]-y)<12})||null};
    cvs.addEventListener("pointerdown",ev=>{cvs.setPointerCapture(ev.pointerId);drag={x:ev.clientX,y:ev.clientY,r:rot.slice(),moved:false};fly=null});
    cvs.addEventListener("pointermove",ev=>{
      if(drag){const k=75/(size/2),dx=ev.clientX-drag.x,dy=ev.clientY-drag.y;if(Math.abs(dx)+Math.abs(dy)>3)drag.moved=true;rot=[drag.r[0]+dx*k*.5,Math.max(-70,Math.min(70,drag.r[1]-dy*k*.5))];sel=null;idle=performance.now();ask();return}
      const c=hit(ev),id=c?c.id:null;cvs.style.cursor=c?"pointer":"grab";
      if(id!==over){over=id;mark();ask()}
      if(c){tip.hidden=false;tip.innerHTML=`<b>${esc(c.name)}</b> ${MODES[mode].line(c)}`;const b=box.getBoundingClientRect();tip.style.left=Math.min(ev.clientX-b.left+14,size-150)+"px";tip.style.top=(ev.clientY-b.top-34)+"px"}else tip.hidden=true});
    cvs.addEventListener("pointerup",ev=>{const was=drag;drag=null;idle=performance.now();if(was&&!was.moved){const c=hit(ev);if(c){sel=c.id;mark();flyTo(c)}else{sel=null;mark()}}});
    cvs.addEventListener("pointerleave",()=>{over=null;tip.hidden=true;mark();ask()});
    list.addEventListener("click",ev=>{const b=ev.target.closest("button");if(!b)return;const c=hi.get(b.dataset.id);sel=c.id;idle=performance.now();mark();flyTo(c)});
    list.addEventListener("pointerover",ev=>{const b=ev.target.closest("button");if(b&&!sel){over=b.dataset.id;mark();ask()}});
    list.addEventListener("pointerleave",()=>{over=null;mark();ask()});
    cvs.style.cursor="grab";cvs.style.touchAction="pan-y";   // vertical swipes still scroll the page on phones
    new ResizeObserver(resize).observe(box);
    // only animate while the globe is on screen
    new IntersectionObserver(([e])=>{const was=vis;vis=e.isIntersecting;if(vis&&!was&&!reduce){last=performance.now();requestAnimationFrame(tick)}},{threshold:.05}).observe(box);
    setMode("team");resize();if(!reduce)requestAnimationFrame(tick);
  };
  return{fill};
})();
// Loads data/data.json produced by backend/prep_data.py.
fetch('data/data.json').then(r=>r.json()).then(D=>{
cover.fill(D);
const E=D.exps,$=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const CE={};E.forEach(e=>{e.ix=new Map(e.ids.map((g,i)=>[g,i]));e.conds.forEach(c=>CE[c]=e)});
const isRel=e=>e.omics=="Transcriptomics"&&e.scale=="Relative",hasP=e=>isRel(e)&&Object.keys(e.padj).length>0;
const CAT=e=>e.omics=="Proteomics"?"Proteomics Absolute":isRel(e)?"Transcriptomics Relative":"Transcriptomics Absolute";
const CATS=[["Transcriptomics Relative","Gene expression changes (log2 fold change) of a treatment or condition compared with its own control or reference. Positive values mean over-expressed and negative values mean under-expressed."],
 ["Transcriptomics Absolute","Gene expression levels measured directly in a condition (for example mean log RPKM), not compared with a control. They show how strongly a gene is expressed, not whether it changed."],
 ["Proteomics Absolute","Protein abundance measured directly in each condition, with standard deviations. These are not fold changes, which makes them useful for comparing protein levels with transcript levels."]];
const at=(k,g,c)=>{const e=CE[c],i=e.ix.get(g);return i==null||!e[k][c]?null:e[k][c][i]};
const val=(g,c)=>at("fc",g,c),pv=(g,c)=>at("padj",g,c),sdv=(g,c)=>at("sd",g,c);
const f3=x=>x==null?"–":(+x).toFixed(3),fe=x=>x==null?"–":(+x).toExponential(2);
const gname=g=>D.gname[g]||"",gdesc=g=>D.gdesc[g]||"",lab=g=>gname(g)?g+" · "+gname(g):g;
const base=g=>g.replace(/_dup\d+$/,""),n0=x=>x.toLocaleString();
const cs_=c=>c.replace(/^log2_Fold_change_?/,"").replace(/^expr_/,""),cl=c=>CE[c].short+" · "+cs_(c);
const tl=(s,n=54)=>s.length>n?s.slice(0,n-1)+"…":s;   // axis tick labels only; hover text keeps the full name
const tbl=(h,rows)=>`<div class="scroll"><table><thead><tr>${h.map(x=>`<th>${esc(x)}</th>`).join("")}</tr></thead><tbody>${rows.map(r=>"<tr>"+r.map(c=>`<td>${c}</td>`).join("")+"</tr>").join("")}</tbody></table></div>`;
const themed=()=>{const s=getComputedStyle(document.documentElement);return{paper_bgcolor:"rgba(0,0,0,0)",plot_bgcolor:"rgba(0,0,0,0)",font:{color:s.getPropertyValue("--ink").trim(),family:"Source Sans 3,system-ui,sans-serif"}}};
const plot=(el,data,lay)=>{if(!el.data)el.innerHTML="";Plotly.react(el,data,{...themed(),...lay},{responsive:true})};
const msg=(el,t)=>{Plotly.purge(el);el.innerHTML=`<p class="mu">${t}</p>`};
const note=(t,c="")=>`<div class="note ${c}">${t}</div>`;
const card=([t,b,sub,c])=>`<div class="card"><span class="mu">${t}</span><b${c?` class="${c}"`:""}>${b}</b>${sub?`<span class="mu small">${sub}</span>`:""}</div>`;
const cards=(l,a)=>`<h3 class="lbl">${l}</h3><div class="stats">${a.map(card).join("")}</div>`;

// ---- exports (CSV for Excel, PNG drawn on a canvas). Uses the page's downloads capability when hosted, else a normal browser download.
async function download(name,data){
  try{const dl=window.claude&&window.claude.use?await window.claude.use("downloads"):null;if(dl){await dl.save({filename:name,data});return}}catch(e){if(e&&e.code=="declined")return}
  const a=document.createElement("a");a.href=URL.createObjectURL(data);a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),3000);
}
const q1=v=>{if(v==null)return"";v=String(v);return/[",\n\r]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v};
const toCSV=(head,rows)=>"\ufeff"+[head,...rows].map(r=>r.map(q1).join(",")).join("\r\n");
function tablePNG(name,title,head,rows,{color,foot=""}={}){
  const pad=10,rh=26,th=34,cell=v=>v==null?"":typeof v=="number"?v.toFixed(3):String(v),m=document.createElement("canvas").getContext("2d");
  m.font="bold 13px sans-serif";const W=head.map(t=>m.measureText(t).width);
  m.font="13px sans-serif";rows.forEach(r=>r.forEach((v,i)=>{W[i]=Math.max(W[i],m.measureText(cell(v)).width)}));
  let cw=W.map((x,i)=>Math.min(i?170:260,Math.ceil(x))+pad*2),tot=0,nc=0;
  while(nc<cw.length&&tot+cw[nc]<=16000){tot+=cw[nc];nc++}
  if(nc<cw.length)foot=`Showing the first ${nc} of ${cw.length} columns; the CSV has all of them. ${foot}`;
  cw=cw.slice(0,nc);
  const fh=foot?28:0,H=th+rh*(rows.length+1)+fh,k=tot*H>3e7?1:2,c=document.createElement("canvas");
  c.width=Math.max(1,tot*k);c.height=H*k;const x=c.getContext("2d");x.scale(k,k);
  x.fillStyle="#fff";x.fillRect(0,0,tot,H);x.textBaseline="middle";x.fillStyle="#16282b";x.font="bold 16px sans-serif";x.fillText(title,pad,th/2,tot-2*pad);
  x.fillStyle="#e6f2f1";x.fillRect(0,th,tot,rh);
  const row=(vals,y,hd,ri)=>{let xx=0;vals.slice(0,nc).forEach((v,i)=>{x.font=(hd?"bold ":"")+"13px sans-serif";x.fillStyle=!hd&&color&&i&&typeof v=="number"?color(v,ri,i):"#16282b";x.fillText(cell(v),xx+pad,y+rh/2,cw[i]-2*pad);xx+=cw[i]});x.strokeStyle="#d3dcdc";x.beginPath();x.moveTo(0,y+rh);x.lineTo(tot,y+rh);x.stroke()};
  row(head,th,1,0);rows.forEach((r,ri)=>row(r,th+rh*(ri+1),0,ri));
  if(foot){x.fillStyle="#5b6e71";x.font="12px sans-serif";x.fillText(foot,pad,H-fh/2,tot-2*pad)}
  c.toBlob(b=>b&&download(name,b),"image/png");
}

// gene lookup (datalist shows "Rv0003 · recF")
$("#gl").innerHTML=D.genes.map(g=>`<option value="${esc(lab(g))}">`).join("");
const GL=new Map();D.genes.forEach(g=>{GL.set(g.toLowerCase(),g);GL.set(lab(g).toLowerCase(),g);const n=gname(g).toLowerCase();if(n&&!GL.has(n))GL.set(n,g)});

// ---- shared selection (genes + conditions) used by every tab
const T={},subs=[];let cur="ov";
const S={g:[],c:new Set(),w:[{}]},SX=new Set(),SY=new Set();
const emit=()=>{subs.forEach(f=>f());T[cur].render()};
const mkStore=set=>({has:c=>set.has(c),set:(c,on)=>{on?set.add(c):set.delete(c)}});
const SH=mkStore(S.c);
function geneSel(host){
  host.className="gs";host.innerHTML=`<div class="chips"></div><input list="gl" autocomplete="off" placeholder="Add a gene (ID or name)…">`;
  const inp=$("input",host),ch=$(".chips",host);
  const draw=()=>{ch.innerHTML=S.g.map(g=>`<span class="chip" data-g="${esc(g)}" title="Remove">${esc(lab(g))} ×</span>`).join("")+(S.g.length?`<span class="lnk" data-clr="1">clear all</span>`:"")};
  inp.onchange=()=>{const g=GL.get(inp.value.trim().toLowerCase());inp.value="";if(g&&!S.g.includes(g)){S.g.push(g);emit()}};
  ch.onclick=e=>{if(e.target.dataset.clr){S.g=[];emit()}else if(e.target.dataset.g){S.g=S.g.filter(x=>x!=e.target.dataset.g);emit()}};
  subs.push(draw);draw();
}
// collapsible dataset > condition picker with search and a "Selected conditions" list
function condPicker(host,{filter=()=>true,st=SH,cats=false}={}){
  const es=E.filter(filter);
  const grp=e=>`<details class="dg" data-e="${esc(e.name)}"><summary>${esc(e.name)} <span class="ct mu small"></span><span class="lnk" data-a="1">all</span><span class="lnk" data-a="0">none</span></summary>${e.conds.map(c=>`<label><input type="checkbox" value="${esc(c)}"> ${esc(cs_(c))}</label>`).join("")}</details>`;
  const body=cats?CATS.map(([k])=>{const g=es.filter(e=>CAT(e)==k);return g.length?`<details class="cg"><summary>${k}</summary>${g.map(grp).join("")}</details>`:""}).join(""):es.map(grp).join("");
  host.innerHTML=`<input type="search" class="cq" placeholder="Search conditions…"><details class="selc" open><summary>Selected conditions (<span class="sn">0</span>) <span class="lnk" data-clr="1">clear</span></summary><div class="sl"></div></details>${body}`;
  const sync=()=>{
    const sel=es.flatMap(e=>e.conds.filter(st.has));
    $(".sn",host).textContent=sel.length;
    $(".sl",host).innerHTML=sel.length?sel.map(c=>`<label><input type="checkbox" value="${esc(c)}" checked> ${esc(cl(c))}</label>`).join(""):`<span class="mu small">None selected</span>`;
    $$(".dg",host).forEach(d=>{const ins=$$("input",d);ins.forEach(i=>i.checked=st.has(i.value));$(".ct",d).textContent=`${ins.filter(i=>i.checked).length}/${ins.length}`});
  };
  host.onchange=ev=>{const i=ev.target;if(i.type=="checkbox"){st.set(i.value,i.checked);emit()}};
  host.onclick=ev=>{const a=ev.target.dataset;
    if(a.clr!=null){ev.preventDefault();es.forEach(e=>e.conds.forEach(c=>st.set(c,false)));emit()}
    else if(a.a!=null){ev.preventDefault();$$("label",ev.target.closest("details")).filter(l=>l.style.display!="none").forEach(l=>st.set($("input",l).value,a.a=="1"));emit()}};
  $(".cq",host).oninput=ev=>{const q=ev.target.value.toLowerCase();
    $$(".dg",host).forEach(d=>{let n=0;$$("label",d).forEach(l=>{const m=!q||(l.textContent+" "+d.dataset.e).toLowerCase().includes(q);l.style.display=m?"":"none";n+=m});d.style.display=n?"":"none";if(q)d.open=n>0});
    $$(".cg",host).forEach(c=>{const v=$$(".dg",c).some(d=>d.style.display!="none");c.style.display=v?"":"none";if(q)c.open=v})};
  subs.push(sync);sync();
}
const expChecks=(host,cb,fn)=>{host.innerHTML=E.filter(fn).map(e=>`<label style="display:block"><input type="checkbox" value="${esc(e.name)}" checked> ${esc(e.name)}</label>`).join("");host.onchange=cb;return()=>$$("input:checked",host).map(i=>i.value)};

function dt(host,cols,rows,size=15){
  let q="",sc=-1,sd=1,pg=0,last=rows;
  host.innerHTML=`<div class="tb"><input type="search" placeholder="Search table…"><span class="tbx"></span><span class="cnt mu small"></span></div><div class="scroll"><table class="${cols.length>8?"wide":""}"><thead></thead><tbody></tbody></table></div><div class="pg"><button class="pp">Previous</button><span class="pi mu small"></span><button class="pn">Next</button></div>`;
  $("thead",host).innerHTML="<tr>"+cols.map((c,i)=>`<th data-i="${i}">${c.hh||esc(c.h)}<i></i></th>`).join("")+"</tr>";
  const tb=$("tbody",host),draw=()=>{
    let r=rows;if(q){const s=q.toLowerCase();r=r.filter(x=>x.some(v=>v!=null&&String(v).toLowerCase().includes(s)))}
    if(sc>=0)r=r.slice().sort((a,b)=>{const x=a[sc],y=b[sc];if(x==null)return y==null?0:1;if(y==null)return-1;return(x<y?-1:x>y?1:0)*sd});
    last=r;const n=Math.max(1,Math.ceil(r.length/size));pg=Math.min(pg,n-1);
    tb.innerHTML=r.slice(pg*size,pg*size+size).map(x=>"<tr>"+cols.map((c,i)=>`<td>${c.f?c.f(x[i],x):(typeof x[i]=="number"?f3(x[i]):esc(x[i]))}</td>`).join("")+"</tr>").join("");
    $(".cnt",host).textContent=r.length.toLocaleString()+" rows";$(".pi",host).textContent=`Page ${pg+1} of ${n}`;
    $(".pp",host).disabled=pg==0;$(".pn",host).disabled=pg>=n-1;
    $$("th",host).forEach((t,i)=>$("i",t).textContent=i==sc?(sd>0?" ▲":" ▼"):"");
  };
  $("input",host).oninput=e=>{q=e.target.value;pg=0;draw()};
  $(".pp",host).onclick=()=>{pg--;draw()};$(".pn",host).onclick=()=>{pg++;draw()};
  $("thead",host).onclick=e=>{const t=e.target.closest("th");if(!t)return;const i=+t.dataset.i;sd=sc==i?-sd:1;sc=i;draw()};
  draw();return{cur:()=>last};
}

// ---- DEG statistics (shared by Overview and DEGs tabs)
function degCompute({conds,mag,dir,gsel,keep}){
  const rows=[],st={},G=new Set(),GU=new Set(),GD=new Set(),all=new Set();let ur=0,dr=0,tot=0;
  for(const e of E){const cs=e.conds.filter(c=>conds.has(c));if(!cs.length)continue;
    e.ids.forEach(i=>all.add(base(i)));
    const s=st[e.name]={n:new Set(e.ids.map(base)).size,u:new Set(),d:new Set()};
    for(const c of cs){const col=e.fc[c];for(let i=0;i<col.length;i++){const v=col[i],g=e.ids[i];
      if(v==null||(gsel&&gsel.size&&!gsel.has(g))||(dir=="Up"&&!(v>0))||(dir=="Down"&&!(v<0))||(mag>0&&Math.abs(v)<mag))continue;
      const b=base(g);G.add(b);tot++;if(v>0){s.u.add(b);GU.add(b);ur++}else if(v<0){s.d.add(b);GD.add(b);dr++}
      if(keep)rows.push([g,c,v])}}}
  return{rows,st,G,GU,GD,ur,dr,tot,all};
}
function degHTML(R,gn){
  const t=R.tot||1;
  return cards(gn?"Selected genes":"Individual genes",[["Genes meeting filters",n0(R.G.size),gn?`of ${n0(gn)} selected genes`:`of ${n0(R.all.size)} genes in the selected datasets`],["Over-expressed genes",n0(R.GU.size),"up in at least one condition","up"],["Under-expressed genes",n0(R.GD.size),"down in at least one condition","dn"]])
   +cards("Gene–condition records",[["Total records",n0(R.tot),"within active filters"],["Over-expressed",n0(R.ur),"records","up"],["Under-expressed",n0(R.dr),"records","dn"]])
   +`<p class="mu small">A gene can be over-expressed in one condition and under-expressed in another, so the two gene counts can overlap.</p><div class="bar"><i class="upbg" style="width:${R.ur/t*100}%"></i><i class="dnbg" style="width:${R.dr/t*100}%"></i></div>`
   +tbl(["Dataset","Genes","Over-expressed genes","Under-expressed genes"],Object.entries(R.st).map(([k,x])=>[esc(k),n0(x.n),n0(x.u.size),n0(x.d.size)]));
}

// ---- Overview
T.ov={init(){
  const ids=k=>new Set(E.filter(e=>e.omics==k).flatMap(e=>e.ids.map(base))),n=k=>E.filter(e=>e.omics==k).length;
  $("#stats").innerHTML=cards("Experiments",[["Total experiments",E.length],["Transcriptomic experiments",n("Transcriptomics")],["Proteomic experiments",n("Proteomics")]])
    +cards("Identified in the datasets",[["Genes identified",n0(ids("Transcriptomics").size),"transcriptomic datasets"],["Proteins identified",n0(ids("Proteomics").size),"proteomic datasets"]]);
  this.ds=expChecks($("#ov-ds"),()=>this.render(),isRel);$("#ov-m").oninput=()=>this.render();
  const a=(u,t)=>u?`<a href="${esc(u)}" target="_blank" rel="noopener">${esc(t)}</a>`:"–";
  const cols=[{h:"Experiment"},{h:"Scale"},{h:"Species"},{h:"Genes"},{h:"Samples"},{h:"Publication"},{h:"Article",f:(v,r)=>a(r[8],r[6]||"link")},{h:"DOI",f:v=>a(v&&"https://doi.org/"+v,v)}];
  const row=e=>[e.name,e.scale,e.species,e.n_genes,e.n_samples,e.publication,e.pubmed_pmcid,e.doi,e.link];
  $("#ov-cats").innerHTML=CATS.map(([k,d],i)=>`<h3 style="margin-top:22px">${k} Experiments</h3><p class="mu">${d}</p><div class="card" id="ov-c${i}"></div>`).join("");
  CATS.forEach(([k],i)=>dt($("#ov-c"+i),cols,E.filter(e=>CAT(e)==k).map(row),10));
},render(){
  const ds=this.ds(),conds=new Set(E.filter(e=>ds.includes(e.name)).flatMap(e=>e.conds));
  $("#ov-out").innerHTML=ds.length?degHTML(degCompute({conds,mag:+$("#ov-m").value||0,dir:"All"}),0):note("Tick at least one dataset.");
}};

// ---- Gene Browser
const RC1="Select at least two conditions above, then choose the two to compare in each comparison widget. Use the + button to add more comparisons.",
  RC2="Please select at least two conditions. Multiple genes can be selected in the tab. Each widget compares two of your selected conditions; use the + button to add more comparisons.";
const rcData=w=>S.g.map(g=>{const a=val(g,w.a),b=val(g,w.b);return[g,gname(g),a,b,a==null||b==null?null:+(a-b).toFixed(4)]});
function rcTable(host,box,m){
  const cs=[...S.c],n=cs.length;
  if(n<2){box.innerHTML=note(m,"warn");return host.innerHTML=""}
  S.w.forEach((w,i)=>{if(!cs.includes(w.a))w.a=cs[i%n];if(!cs.includes(w.b)||w.b==w.a)w.b=cs[(cs.indexOf(w.a)+1)%n]});
  const opt=sel=>E.map(e=>{const k=cs.filter(c=>CE[c]===e);return k.length?`<optgroup label="${esc(e.name)}">${k.map(c=>`<option value="${esc(c)}"${c==sel?" selected":""}>${esc(cs_(c))}</option>`).join("")}</optgroup>`:""}).join("");
  box.innerHTML=note(`Each widget compares 2 of your ${n} selected conditions. Your other selected conditions stay in the charts and heatmap.`,"ok");
  host.innerHTML=S.w.map((w,i)=>`<div class="rcw"><div class="rcw-h"><b>Comparison ${i+1}</b><span class="sp"></span><button class="b" data-ex="csv" data-w="${i}">Export CSV</button><button class="b" data-ex="png" data-w="${i}">Export PNG</button>${S.w.length>1?`<button class="x" data-x="${i}" title="Remove this comparison" aria-label="Remove comparison ${i+1}">×</button>`:""}</div>
    <div class="two"><div><label class="f">Condition A</label><select data-s="a" data-w="${i}">${opt(w.a)}</select></div><div><label class="f">Condition B</label><select data-s="b" data-w="${i}">${opt(w.b)}</select></div></div>`
    +(S.g.length?tbl(["Gene",cl(w.a),cl(w.b),"Relative log2FC (A − B)"],rcData(w).map(r=>[esc(lab(r[0])),f3(r[2]),f3(r[3]),r[4]==null?"–":f3(r[4])])):"<p class='mu'>Select one or more genes.</p>")+"</div>").join("")
    +`<button class="addw" data-add="1" title="Add another comparison" aria-label="Add another comparison">+</button>`;
  host.onchange=ev=>{const k=ev.target.dataset.s;if(!k)return;const w=S.w[+ev.target.dataset.w],v=ev.target.value;if(k=="a"&&v==w.b)w.b=w.a;if(k=="b"&&v==w.a)w.a=w.b;w[k]=v;emit()};
  host.onclick=ev=>{const b=ev.target.closest("button");if(!b)return;const d=b.dataset;
    if(d.add){S.w.push({});emit()}
    else if(d.x!=null){S.w.splice(+d.x,1);emit()}
    else if(d.ex){const i=+d.w,w=S.w[i],nm="relative_comparison_"+(i+1),rows=rcData(w);
      if(d.ex=="csv")download(nm+".csv",new Blob([toCSV(["Gene ID","Gene name",cl(w.a),cl(w.b),"Relative log2FC (A − B)"],rows)],{type:"text/csv"}));
      else tablePNG(nm+".png",`Comparison ${i+1}: ${cl(w.a)} vs ${cl(w.b)}`,["Gene",cl(w.a),cl(w.b),"Relative log2FC (A − B)"],rows.map(r=>[lab(r[0]),r[2],r[3],r[4]]))}};
}
T.gb={init(){
  geneSel($("#gb-g"));condPicker($("#gb-cp"),{filter:isRel});$("#gb-th").oninput=()=>this.render();
},one(g,i,cs,th){
  const have=cs.filter(c=>val(g,c)!=null),miss=cs.filter(c=>val(g,c)==null),sm=$("#gs"+i),el=$("#gp"+i);
  if(have.length){
    const v=have.map(c=>val(g,c)),up=v.filter(x=>x>0&&x>=th).length,dn=v.filter(x=>x<0&&x<=-th).length;
    sm.innerHTML=`<b>${esc(lab(g))}</b> is <b class="up">over-expressed</b> in ${up} and <b class="dn">under-expressed</b> in ${dn} of ${have.length} conditions with data (|log2FC| ≥ ${th}).`;
    const col=x=>x>0&&x>=th?"#c53030":x<0&&x<=-th?"#2b6cb0":"#9fb0b2",ln=x=>({type:"line",x0:x,x1:x,yref:"paper",y0:0,y1:1,line:{color:"#8a9a9c",width:1,dash:"dot"}});
    plot(el,[{type:"bar",orientation:"h",y:have.map((_,k)=>k),x:v,marker:{color:v.map(col)},hoverinfo:"text",hovertext:have.map((c,k)=>`${cl(c)}<br>log2FC ${f3(v[k])}${pv(g,c)!=null?"<br>adj. P "+fe(pv(g,c)):""}`)}],
      {height:Math.max(260,have.length*26+80),margin:{l:10,r:20,t:10,b:50},bargap:.2,xaxis:{title:"log2 fold change",zeroline:true},yaxis:{type:"linear",autorange:"reversed",tickmode:"array",tickvals:have.map((_,k)=>k),ticktext:have.map(c=>tl(cs_(c))),tickfont:{size:12},automargin:true,showgrid:false,zeroline:false},shapes:th>0?[ln(-th),ln(th)]:[]});
  }else{sm.textContent="";Plotly.purge(el);el.innerHTML=""}
  $("#gn"+i).innerHTML=miss.length?note(`There's no observable log2FC value of ${miss.length} condition(s): ${miss.map(c=>esc(cs_(c))).join(", ")}.`):"";
},render(){
  const gs=S.g,cs=[...S.c],th=Math.abs(+$("#gb-th").value||0),R=$("#gb-reg");
  $("#gb-info").innerHTML=gs.length?tbl(["Gene ID","Gene name","Description","Present in"],gs.map(g=>[esc(g),esc(gname(g)||"–"),esc(gdesc(g)||"–"),esc(E.filter(e=>e.ix.has(g)).map(e=>e.name).join(", "))])):"<p class='mu'>Select one or more genes to begin.</p>";
  if(!gs.length||!cs.length)R.innerHTML=`<p class="mu">Select ${!gs.length?"one or more genes":"one or more conditions"} to see regulation.</p>`;
  else{R.innerHTML=gs.map((g,i)=>`<div class="gblk"><h3>${esc(lab(g))}</h3><p id="gs${i}"></p><div id="gp${i}"></div><div id="gn${i}"></div></div>`).join("");gs.forEach((g,i)=>this.one(g,i,cs,th))}
  rcTable($("#gb-rc"),$("#gb-rcn"),RC1);
}};

// ---- Relative comparison
T.rc={init(){geneSel($("#rc-g"));condPicker($("#rc-cp"),{filter:isRel})},render(){rcTable($("#rc-t"),$("#rc-n"),RC2)}};

// ---- Heatmap
function info(g,c){return{g,c,v:val(g,c),p:pv(g,c),e:CE[c]}}
T.hm={init(){
  geneSel($("#hm-g"));condPicker($("#hm-cp"),{filter:isRel});
  $$("[name=hmm]").forEach(r=>r.onchange=()=>{$("#hm-nw").hidden=this.mode()!="window";this.render()});
  $("#hm-n").onchange=$("#hm-t").oninput=()=>this.render();
},mode:()=>$("[name=hmm]:checked").value,render(){
  const el=$("#hm"),cs=[...S.c],th=Math.abs(+$("#hm-t").value||0);let gs=S.g.slice();
  if(this.mode()=="window"&&gs.length){const n=Math.max(1,+$("#hm-n").value||20),i=D.genes.indexOf(gs[0]),h=Math.floor(n/2);gs=D.genes.slice(Math.max(0,i-h),i+h+1)}
  if(!cs.length||!gs.length)return msg(el,"Select at least one gene and one condition.");
  const z=gs.map(g=>cs.map(c=>{const v=val(g,c);return v!=null&&Math.abs(v)>=th?v:null})),idx=cs.map((_,i)=>i),
    text=gs.map(g=>cs.map(c=>{const x=info(g,c);return`<b>${esc(lab(g))}</b><br>${esc(x.e.name)}<br>${esc(cs_(c))}<br>log2FC: ${f3(x.v)}${x.p!=null?"<br>adj. P: "+fe(x.p):""}<br>Click for publication details`}));
  const xl=cs.map(c=>tl(cs_(c),38)),bm=Math.min(230,Math.round(Math.max(...xl.map(t=>t.length))*4.3)+14),cell=gs.length>40?14:gs.length>15?20:34;
  plot(el,[{type:"heatmap",x:idx,y:gs.map(lab),z,text,hoverinfo:"text",hoverongaps:false,zmin:-3,zmax:3,colorscale:[[0,"#2b6cb0"],[.5,"#ffffff"],[1,"#c53030"]],colorbar:{title:"log2 FC",thickness:14}}],
    {height:Math.max(420,gs.length*cell)+bm+50,margin:{l:10,r:10,t:10,b:bm},xaxis:{tickmode:"array",tickvals:idx,ticktext:xl,tickangle:-45,tickfont:{size:11},automargin:true},yaxis:{type:"category",autorange:"reversed",automargin:true}});
  el.removeAllListeners&&el.removeAllListeners("plotly_click");
  el.on("plotly_click",ev=>{const p=ev.points[0],x=info(gs[p.pointNumber[0]],cs[p.pointNumber[1]]),e=x.e,L=(u,t)=>u?`<div><a href="${u}" target="_blank" rel="noopener">${t}</a></div>`:"";
    $("#md").innerHTML=`<h3>Gene details: ${esc(lab(x.g))}</h3><dl><dt>Gene</dt><dd>${esc(lab(x.g))}${gdesc(x.g)?" – "+esc(gdesc(x.g)):""}</dd><dt>Dataset</dt><dd>${esc(e.name)}</dd><dt>Condition</dt><dd>${esc(cs_(x.c))}</dd><dt>log2FC</dt><dd>${f3(x.v)}</dd><dt>Adjusted P-value</dt><dd>${x.p==null?"N/A":fe(x.p)}</dd><dt>Publication</dt><dd>${esc(e.publication||"–")}</dd></dl>${L(e.link,"Open article page")}${L(e.doi&&"https://doi.org/"+e.doi,"Open DOI page")}<p><button class="b" onclick="this.closest('dialog').close()">Close</button></p>`;
    $("#md").showModal()});
}};

// ---- Scatter (own X / Y condition sets)
T.sc={init(){
  geneSel($("#sc-g"));condPicker($("#sc-x"),{st:mkStore(SX),cats:true});condPicker($("#sc-y"),{st:mkStore(SY),cats:true});
  $("#scx").onchange=$("#scy").onchange=()=>this.render();
},render(){
  const el=$("#sc"),gs=S.g,xs=[...SX],ys=[...SY];
  if(!xs.length||!ys.length)return msg(el,"Select at least one condition for the X axis and one for the Y axis.");
  const mean=(g,cs)=>{let s=0,n=0;for(const c of cs){const v=val(g,c);if(v!=null){s+=v;n++}}return n?s/n:null};
  const L=[$("#scx").value=="log2",$("#scy").value=="log2"],tf=(v,l)=>v==null?null:l?(v>0?Math.log2(v):null):v;
  const pts=D.genes.map(g=>{const rx=mean(g,xs),ry=mean(g,ys);return{g,rx,ry,x:tf(rx,L[0]),y:tf(ry,L[1]),s:gs.includes(g)}}).filter(p=>p.x!=null&&p.y!=null);
  if(!pts.length)return msg(el,"No genes have values for both axes.");
  const mk=(a,o)=>({type:"scatter",mode:"markers",x:a.map(p=>p.x),y:a.map(p=>p.y),text:a.map(p=>`<b>${esc(lab(p.g))}</b><br>X: ${f3(p.rx)}<br>Y: ${f3(p.ry)}`),hoverinfo:"text",...o}),sel=pts.filter(p=>p.s);
  const n=pts.length,mx=pts.reduce((s,p)=>s+p.x,0)/n,my=pts.reduce((s,p)=>s+p.y,0)/n;let sxx=0,sxy=0,syy=0;pts.forEach(p=>{const a=p.x-mx,b=p.y-my;sxx+=a*a;sxy+=a*b;syy+=b*b});
  const sl=sxx?sxy/sxx:0,ic=my-sl*mx,r2=sxx&&syy?sxy*sxy/(sxx*syy):0,x0=Math.min(...pts.map(p=>p.x)),x1=Math.max(...pts.map(p=>p.x));
  const ttl=(c,l)=>`${l}: mean of ${c.length} condition(s) – ${[...new Set(c.map(k=>CE[k].short))].join(", ")}${(l=="X"?L[0]:L[1])?" (log2)":""}`;
  plot(el,[mk(pts.filter(p=>!p.s),{name:"All genes",marker:{size:6,color:"#9fb0b2",opacity:.7}}),
    mk(sel,{name:"Selected genes",mode:"markers+text",marker:{size:12,color:"#c53030"},textposition:"top center",texttemplate:"%{customdata}",customdata:sel.map(p=>lab(p.g))}),
    {type:"scatter",mode:"lines",name:"Linear trendline",x:[x0,x1],y:[ic+sl*x0,ic+sl*x1],line:{color:"#0e7c7b",width:2},hoverinfo:"skip"}],
    {xaxis:{title:ttl(xs,"X")},yaxis:{title:ttl(ys,"Y")},legend:{orientation:"h",x:0,y:1.12},margin:{t:70,b:70},
     annotations:[{xref:"paper",yref:"paper",x:.99,y:.99,xanchor:"right",yanchor:"top",showarrow:false,align:"right",bgcolor:"rgba(14,124,123,.12)",bordercolor:"#0e7c7b",borderpad:5,text:`y = ${sl.toFixed(3)}x ${ic<0?"−":"+"} ${Math.abs(ic).toFixed(3)}<br><b>R² = ${r2.toFixed(3)}</b> (n = ${n})`}]});
}};

// ---- Volcano plot (needs adjusted P-values)
T.vp={init(){geneSel($("#vp-g"));condPicker($("#vp-cp"),{filter:hasP});$("#vp-t").oninput=()=>this.render()},render(){
  const el=$("#vp"),th=Math.abs(+$("#vp-t").value||0),all=[...S.c],cs=all.filter(c=>CE[c].padj[c]),miss=all.filter(c=>!CE[c].padj[c]);
  $("#vp-n").innerHTML=miss.length?note(`No adjusted P-value is available for ${miss.length} selected condition(s), so they can't be shown on a volcano plot: ${miss.map(c=>esc(cl(c))).join(", ")}.`):"";
  if(!cs.length)return msg(el,"Select one or more conditions that have adjusted P-values.");
  const B={up:[[],[],[]],dn:[[],[],[]],ns:[[],[],[]]},SG=[[],[],[]];
  for(const c of cs){const e=CE[c],f=e.fc[c],p=e.padj[c];for(let i=0;i<f.length;i++){const v=f[i],q=p[i];if(v==null||q==null)continue;
    const y=-Math.log10(Math.max(q,1e-300)),k=q<.05&&v>=th&&v>0?"up":q<.05&&v<=-th&&v<0?"dn":"ns",g=e.ids[i];
    const t=`<b>${esc(lab(g))}</b><br>${esc(cl(c))}<br>log2FC ${f3(v)}<br>adj. P ${fe(q)}`;B[k][0].push(v);B[k][1].push(y);B[k][2].push(t);
    if(S.g.includes(g)){SG[0].push(v);SG[1].push(y);SG[2].push(esc(lab(g)))}}}
  const tr=(k,name,color)=>({type:"scattergl",mode:"markers",name:`${name} (${B[k][0].length.toLocaleString()})`,x:B[k][0],y:B[k][1],text:B[k][2],hoverinfo:"text",marker:{size:5,color,opacity:.65}});
  const ln=(o)=>({type:"line",line:{color:"#8a9a9c",width:1,dash:"dot"},...o});
  plot(el,[tr("ns","Not significant / below threshold","#9fb0b2"),tr("dn","Under-expressed","#2b6cb0"),tr("up","Over-expressed","#c53030"),
    {type:"scatter",mode:"markers+text",name:"Selected genes",x:SG[0],y:SG[1],text:SG[2],textposition:"top center",marker:{size:11,color:"rgba(0,0,0,0)",line:{color:"#111",width:2}},hoverinfo:"skip"}],
    {height:620,margin:{t:60,b:60},legend:{orientation:"h",x:0,y:1.1},xaxis:{title:"log2 fold change  (← under-expressed | over-expressed →)",zeroline:true},yaxis:{title:"−log10 adjusted P-value"},
     shapes:[ln({x0:-th,x1:-th,yref:"paper",y0:0,y1:1}),ln({x0:th,x1:th,yref:"paper",y0:0,y1:1}),ln({xref:"paper",x0:0,x1:1,y0:1.301,y1:1.301})]});
}};

// ---- DEGs (wide: genes x conditions, hover for details)
const tip=$("#tip");
T.dg={init(){
  geneSel($("#dg-g"));condPicker($("#dg-cp"),{filter:isRel});$("#dg-d").onchange=$("#dg-m").oninput=$("#dg-o").onchange=()=>this.render();
  const box=$("#dg-t");
  box.onmouseover=box.onmousemove=ev=>{const t=ev.target.closest("[data-t]");if(!t){tip.hidden=true;return}
    const s=t.dataset.t,k=s.indexOf("|"),g=s.slice(0,k),c=s.slice(k+1),v=val(g,c),p=pv(g,c),mg=+$("#dg-m").value||0,dr=$("#dg-d").value,ok=v!=0&&Math.abs(v)>=mg&&(dr=="All"||(dr=="Up")==(v>0));
    tip.innerHTML=`<b>${esc(lab(g))}</b><br>Dataset: ${esc(CE[c].name)}<br>Condition: ${esc(cs_(c))}<br>log2FC: ${f3(v)}<br>Direction: ${v>0?"Over-expressed":v<0?"Under-expressed":"No change"}<br>Adj. P: ${fe(p)}<br>${ok?"Meets the filter":"Below the minimum threshold (shown in grey)"}`;
    tip.hidden=false;tip.style.left=Math.min(ev.clientX+14,innerWidth-250)+"px";tip.style.top=ev.clientY+14+"px"};
  box.onmouseleave=()=>tip.hidden=true;
},render(){
  const cs=new Set(S.c),dir=$("#dg-d").value,mag=+$("#dg-m").value||0,gsel=new Set(S.g);
  if(!cs.size){$("#dg-ov").innerHTML=note("Select one or more conditions in the sidebar to see differentially expressed genes.");$("#dg-t").innerHTML="";return}
  const R=degCompute({conds:cs,mag,dir,gsel,keep:true}),pass=new Set(R.rows.map(r=>r[0])),only=$("#dg-o").checked,order=[...cs];
  const meets=v=>v!=null&&v!=0&&Math.abs(v)>=mag&&(dir=="All"||(dir=="Up")==(v>0)),cls=v=>meets(v)?(v>0?"up":"dn"):"gy";
  const genes=D.genes.filter(g=>(!gsel.size||gsel.has(g))&&(only?pass.has(g):order.some(c=>val(g,c)!=null)));
  const cols=[{h:"Gene"},...order.map(c=>({h:cs_(c),hh:`${esc(cs_(c))}<br><span class="mu small">${esc(CE[c].short)}</span>`,f:(v,r)=>v==null?`<span class="mu">–</span>`:`<span class="${cls(v)}" data-t="${esc(r[r.length-1])}|${esc(c)}">${f3(v)}</span>`}))];
  $("#dg-ov").innerHTML=degHTML(R,gsel.size)+`<h3 style="margin-top:20px">Gene–condition records</h3><p class="mu small">Every value is shown. <span class="up">Red</span> and <span class="dn">blue</span> values meet the minimum threshold; <span class="gy">grey</span> values are below it (or in the other direction). Hover over a value for its dataset, direction and adjusted P-value.</p>`;
  const tb=dt($("#dg-t"),cols,genes.map(g=>[lab(g),...order.map(c=>val(g,c)),g]),15),bx=$(".tbx",$("#dg-t"));
  bx.innerHTML=`<button class="b" data-ex="csv">Export CSV</button><button class="b" data-ex="png">Export PNG</button>`;
  bx.onclick=ev=>{const d=ev.target.dataset.ex;if(!d)return;const rows=tb.cur();
    if(d=="csv")download("deg_table.csv",new Blob([toCSV(["Gene ID","Gene name",...order.map(cl)],rows.map(r=>[r[r.length-1],gname(r[r.length-1]),...r.slice(1,-1)]))],{type:"text/csv"}));
    else{const cap=200;tablePNG("deg_table.png",`Differentially expressed genes (|log2FC| ≥ ${mag}, ${dir})`,["Gene",...order.map(cs_)],rows.slice(0,cap).map(r=>r.slice(0,-1)),{color:v=>meets(v)?(v>0?"#c53030":"#2b6cb0"):"#8a9a9c",foot:rows.length>cap?`Showing the first ${cap} of ${rows.length.toLocaleString()} rows; the CSV has all rows.`:""})}};
}};

// ---- Tabs
const names={ov:"Overview",gb:"Gene Browser",rc:"Relative Comparison",hm:"Heatmap",sc:"Scatterplot",vp:"Volcano Plot",dg:"DEGs"};
const MENU=["dg","hm","sc","vp"];   // tabs that live under the "DEG Menu" dropdown
function show(k){cur=k;$$(".tab").forEach(t=>t.classList.toggle("on",t.id=="t-"+k));$$("#nav button[data-k]").forEach(b=>b.classList.toggle("on",b.dataset.k==k));$("#nav .dd>button").classList.toggle("on",MENU.includes(k));closeMenu();T[k].render()}
const btn=k=>`<button data-k="${k}">${names[k]}</button>`;
$("#nav").innerHTML=["ov","gb","rc"].map(btn).join("")+`<div class="dd"><button type="button" class="dd-t" aria-haspopup="true" aria-expanded="false">DEG Menu <i aria-hidden="true"></i></button><div class="dd-m" role="menu">${MENU.map(btn).join("")}</div></div>`;
function closeMenu(){const d=$("#nav .dd");d.classList.remove("open");d.firstChild.setAttribute("aria-expanded","false");if(d.contains(document.activeElement))document.activeElement.blur()}
$("#nav .dd-t").onclick=e=>{const d=e.currentTarget.parentNode,o=!d.classList.contains("open");d.classList.toggle("open",o);e.currentTarget.setAttribute("aria-expanded",o)};   // click/tap also opens it (touch screens have no hover)
$("#nav .dd").addEventListener("mouseleave",e=>e.currentTarget.classList.remove("shut"));
document.addEventListener("click",e=>{if(!e.target.closest("#nav .dd"))$("#nav .dd").classList.remove("open")});
document.addEventListener("keydown",e=>{if(e.key=="Escape")$("#nav .dd").classList.remove("open")});
$("#nav").onclick=e=>{if(e.target.dataset.k){if(e.target.closest(".dd-m"))$("#nav .dd").classList.add("shut");show(e.target.dataset.k)}};   // "shut" keeps the hover menu closed after a pick until the pointer leaves
Object.values(T).forEach(t=>t.init());show("ov");
const rr=()=>["gb","hm","sc","vp"].includes(cur)&&T[cur].render();
matchMedia("(prefers-color-scheme: dark)").addEventListener("change",rr);
new MutationObserver(rr).observe(document.documentElement,{attributes:true,attributeFilter:["data-theme"]});
}).catch(e=>{document.querySelector('main').innerHTML='<p>Could not load data/data.json. Serve this folder over HTTP (see README).</p>';console.error(e)});
