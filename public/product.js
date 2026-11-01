(() => {
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const colors = {ecmwf_ifs:"#0876ad",ecmwf_ens:"#55a6d5",aifs:"#7446a8",aifs_ens:"#ad8ac8",gfs:"#d17b17",gefs:"#1a8a5d"};
  const palette = colors;
  const names = {ecmwf_ifs:"ECMWF IFS",ecmwf_ens:"ECMWF ENS",aifs:"AIFS",aifs_ens:"AIFS ENS",gfs:"GFS",gefs:"GEFS"};
  const s = {data:null,model:"ecmwf",kind:"single",chart:"wind",mapField:"vortex",level:"10",step:0,vfield:"wind",runCount:12};
  const num = v => Number.isFinite(Number(v)) ? Number(v) : null;
  const fmt = v => v == null ? "—" : Number(v).toLocaleString("it-IT",{maximumFractionDigits:1,minimumFractionDigits:1});
  const date = v => new Intl.DateTimeFormat("it-IT",{day:"2-digit",month:"short",timeZone:"UTC"}).format(new Date(v));
  function keys() {
    let a = s.model === "compare" ? Object.keys(s.data.models||{}) : s.model === "gfs" ? ["gfs","gefs"] : s.model === "aifs" ? ["aifs","aifs_ens"] : ["ecmwf_ifs","ecmwf_ens"];
    return a.filter(k => s.kind === "ensemble" ? k.endsWith("_ens") || k === "gefs" : !(k.endsWith("_ens") || k === "gefs"));
  }
  function chart(container, series, unit, zero) {
    let pts = series.flatMap(x=>x.points).filter(p=>num(p.y)!==null && Number.isFinite(Date.parse(p.x)));
    if (!pts.length) { container.innerHTML='<div class="chart-empty"><div><strong>Dati non disponibili</strong>Il run non contiene questo campo.</div></div>'; return; }
    let c=document.createElement("canvas"), w=1000,h=330,dpr=window.devicePixelRatio||1;
    c.width=w*dpr;c.height=h*dpr;c.style.width="100%";c.style.height="auto";container.innerHTML="";container.appendChild(c);
    let x=c.getContext("2d");x.scale(dpr,dpr);let m={l:65,r:20,t:22,b:42}, vals=pts.map(p=>+p.y),lo=Math.min(...vals,zero?0:Infinity),hi=Math.max(...vals,zero?0:-Infinity),pad=(hi-lo||1)*.12;lo-=pad;hi+=pad;
    let tx=pts.map(p=>Date.parse(p.x)),x0=Math.min(...tx),x1=Math.max(...tx)||x0+1;
    let X=v=>m.l+(Date.parse(v)-x0)/(x1-x0)*(w-m.l-m.r),Y=v=>m.t+(hi-v)/(hi-lo)*(h-m.t-m.b);
    x.font="12px Segoe UI";x.strokeStyle="#e5edf3";x.fillStyle="#617b90";
    for(let i=0;i<=5;i++){let y=m.t+i*(h-m.t-m.b)/5,v=hi-i*(hi-lo)/5;x.beginPath();x.moveTo(m.l,y);x.lineTo(w-m.r,y);x.stroke();x.fillText(v.toFixed(0),8,y+4)}
    if(zero&&lo<0&&hi>0){x.strokeStyle="#1c3548";x.beginPath();x.moveTo(m.l,Y(0));x.lineTo(w-m.r,Y(0));x.stroke()}
    series.forEach(a=>{let p=a.points.filter(q=>num(q.y)!==null);if(p.length<2)return;x.strokeStyle=a.color;x.lineWidth=2.7;x.beginPath();p.forEach((q,i)=>i?x.lineTo(X(q.x),Y(q.y)):x.moveTo(X(q.x),Y(q.y)));x.stroke()});
    for(let i=0;i<5;i++){let d=new Date(x0+(x1-x0)*i/4);x.fillStyle="#617b90";x.fillText(date(d.toISOString()),m.l+i*(w-m.l-m.r)/4,h-12)}
    let legend=$("#strength-legend");if(legend&&container.id==="strength-chart"){let unique=[...new Map(series.map(a=>[a.name.split(" · ")[0],a])).values()];legend.innerHTML=unique.map(a=>'<span class="leg"><i class="line-swatch" style="--c:'+a.color+'"></i>'+a.name.split(" · ")[0]+'</span>').join("")}
    container.setAttribute("aria-label","Grafico "+unit);
  }
  function modelSeries(which,field) {
    return which.filter(k=>s.data.models?.[k]?.series?.length).map(k=>({name:names[k]||k,color:colors[k],points:s.data.models[k].series.map(p=>({x:p.valid,y:num(p[field])})).filter(p=>p.y!==null)}));
  }
  function renderStrength() {
    if(!s.data)return;let which=keys(),field=s.chart==="temperature"?"t10":"u10";
    if(s.chart==="trend"){let archive=s.data.archive||{},group=s.model==="compare"?which:[which[0]],count=s.runCount;let series=group.flatMap(k=>Object.entries(archive[k]||{}).slice(-count).map(r=>({name:(names[k]||k)+" · "+r[0],color:palette[k],points:r[1].map(p=>({x:p.valid,y:num(p.u10)})).filter(p=>p.y!==null)})));chart($("#strength-chart"),series,"m/s",true)}
    else if(s.chart==="season"){
      const observed=Object.entries(s.data.analysis||{}).map(([x,y])=>({x,y:num(y)})).filter(p=>p.y!==null).sort((a,b)=>Date.parse(a.x)-Date.parse(b.x));
      const ens=s.data.models?.ecmwf_ens?.series||[],forecast=ens.map(p=>({x:p.valid,y:num(p.u10)})).filter(p=>p.y!==null);
      chart($("#strength-chart"),[{name:"Analisi IFS",color:"#17354e",points:observed},{name:"ECMWF ENS media",color:"#bd3434",points:forecast}],"m/s",true);
    }
    else chart($("#strength-chart"),modelSeries(which,field),s.chart==="temperature"?"°C":"m/s",s.chart!=="temperature");
    $("#strength-title").textContent=s.chart==="temperature"?"Temperatura a 10 hPa · media 55–65°N":s.chart==="trend"?"Confronto degli ultimi "+s.runCount+" run archiviati · U60":s.chart==="season"?"Stagione VPS · analisi e previsione d’ensemble":"Vento zonale medio · 60°N · 10 hPa";
    $("#strength-subtitle").textContent="Run di modello e scadenze disponibili; la linea zero del vento indica l'inversione zonale.";
    let avail=which.filter(k=>s.data.sources?.[k]?.available);$("#strength-freshness").textContent=avail.map(k=>names[k]+" · "+s.data.sources[k].init).join(" | ")||"Nessun run disponibile";
    let wave=which.flatMap(k=>(s.data.models[k]?.series||[]).filter(p=>num(p.heatFlux100)!==null).map(p=>({x:p.valid,y:num(p.heatFlux100)})));
    if(wave.length)chart($("#wave-chart"),[{name:"v′T′ 100 hPa",color:"#d76b28",points:wave}],"K·m/s",false);
  }
  function renderMaps(){
    if(!s.data)return;$$("[data-level]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.level===s.level)));$$("[data-field]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.field===s.mapField)));let sel=$("#map-model").value,which=sel==="compare"?Object.keys(s.data.models||{}):sel==="ifs"?["ecmwf_ifs","ecmwf_ens"]:sel==="aifs"?["aifs","aifs_ens"]:[sel];
    let step=Math.round(s.step/4)*48,levels=s.level==="both"?[10,50]:[Number(s.level)],imgs=[];
    which.forEach(k=>levels.forEach(l=>{let url=s.data.models?.[k]?.maps?.[String(l)]?.[String(step)]?.[s.mapField];if(url)imgs.push({k:k,l:l,url:url,run:s.data.models[k].init})}));
    $("#map-step-label").textContent=step===0?"Analisi · +0 h":"Giorno "+(step/24)+" · +"+step+" h";
    $("#map-display").innerHTML=imgs.length?imgs.map(a=>'<figure style="margin:0 0 14px"><img src="'+a.url+'" alt="'+(names[a.k]||a.k)+' '+a.l+' hPa '+s.mapField+' +'+step+'h"><figcaption style="padding:6px;font-size:12px;color:var(--muted)"><b>'+(names[a.k]||a.k)+'</b> · '+a.l+' hPa · run '+a.run+' · +'+step+' h</figcaption></figure>').join(""):'<div class="map-placeholder"><div><strong>Mappa non disponibile</strong>Questo run non contiene il campo, livello o passo selezionato.</div></div>';
    $("#map-caption").textContent=imgs.length+" mappe · "+(s.mapField==="temp"||s.mapField==="height"?"anomalia rispetto alla climatologia mensile NOAA PSL NCEP/NCAR 1991–2020.":s.mapField==="vortex"?"geopotenziale assoluto e struttura del vortice.":"vento zonale del modello.");
  }
  function renderVertical(){
    if(!s.data)return;let k=s.model==="gfs"?"gfs":s.model==="aifs"?"aifs":"ecmwf_ifs",rows=s.data.models?.[k]?.series||[],scale=$('[data-vscale][aria-pressed="true"]')?.dataset.vscale||"anomaly",allLevels=[1000,925,850,700,500,300,200,150,100,70,50,30,20,15,10,7,5,3,2,1],prefix=s.vfield==="wind"?"u":s.vfield==="temperature"?"t":"z",suffix=scale==="sigma"?"sigma":"anom",valkey=l=>scale==="raw"?prefix+l:prefix+l+suffix,levels=allLevels.filter(l=>(scale==="raw"&&k==="gfs")||l>=10).filter(l=>rows.some(r=>num(r[valkey(l)])!==null)),vals=rows.flatMap(r=>levels.map(l=>num(r[valkey(l)])).filter(v=>v!==null));
    if(!vals.length){$("#vertical-chart").innerHTML='<div class="chart-empty"><div><strong>Sezione non disponibile</strong>Livelli verticali non presenti nel run selezionato.</div></div>';return}
    let lo=Math.min(...vals),hi=Math.max(...vals),W=960,H=410,left=72,top=25,cw=(W-left-12)/Math.max(rows.length,1),ch=(H-top-30)/levels.length,html='<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Sezione verticale pressione e tempo">';
    rows.forEach((r,j)=>levels.forEach((l,i)=>{let v=num(r[valkey(l)]);if(v===null)return;let q=(v-lo)/(hi-lo||1),color=q<.5?"rgb("+Math.round(45+q*340)+","+Math.round(115+q*230)+",220)":"rgb(220,"+Math.round(220-(q-.5)*360)+","+Math.round(150-(q-.5)*240)+")";html+='<rect x="'+(left+j*cw)+'" y="'+(top+i*ch)+'" width="'+(cw+1)+'" height="'+(ch+1)+'" fill="'+color+'"><title>'+l+' hPa · '+date(r.valid)+' · '+fmt(v)+(scale==="raw"?" valore grezzo":scale==="sigma"?" σ":" anomalia")+'</title></rect>'}));
    levels.forEach((l,i)=>html+='<text class="axis" x="'+(left-8)+'" y="'+(top+(i+.7)*ch)+'" text-anchor="end">'+l+'</text>');
    html+='<text class="axis" transform="translate(18 '+(H/2)+') rotate(-90)" text-anchor="middle">Pressione (hPa) · quota indicativa</text></svg>';$("#vertical-chart").innerHTML=html;
  }
  function renderAccuracy(){
    let period=$('[data-period][aria-pressed="true"]')?.dataset.period||"30d",model=$('[data-amodel][aria-pressed="true"]')?.dataset.amodel||"ecmwf",kind=$('[data-atype][aria-pressed="true"]')?.dataset.atype||"single",groups=model==="gfs"?["gfs","gefs"]:model==="aifs"?["aifs","aifs_ens"]:["ecmwf_ifs","ecmwf_ens"];
    if(kind==="single")groups=groups.filter(k=>!k.endsWith("_ens")&&k!=="gefs");else groups=groups.filter(k=>k.endsWith("_ens")||k==="gefs");
    let entries=groups.map(k=>[k,s.data?.verification?.[k]?.[period]]).filter(x=>x[1]);if(!entries.length){$("#accuracy-chart").innerHTML='<div class="chart-empty"><div><strong>Archivio di verifica in accumulo</strong>Le scadenze vengono verificate man mano che diventano osservabili; questo modello/periodo non ha ancora campioni.</div></div>';return}
    $("#accuracy-chart").innerHTML='<div class="mobile-scroll"><table style="width:100%;border-collapse:collapse"><thead><tr><th style="text-align:left">Modello</th><th>Campioni</th><th>Bias</th><th>MAE</th><th>RMSE</th></tr></thead><tbody>'+entries.map(([k,v])=>'<tr><td>'+ (names[k]||k)+'</td><td>'+v.n+'</td><td>'+fmt(v.biasMs)+'</td><td>'+fmt(v.maeMs)+'</td><td>'+fmt(v.rmseMs)+'</td></tr>').join("")+'</tbody></table></div><p style="font-size:11px;color:var(--muted)">Verifica di U60 contro l’analisi operativa IFS · '+(period==="30d"?"ultimi 30 giorni":"archivio stagionale")+'; punteggi accumulati dall’attivazione.</p><div id="verification-plot" style="min-height:220px"></div>';
    let availableLeads=[240,168,336].filter(h=>entries.some(([,v])=>(v.samples||[]).some(p=>p.leadHours===h))),lead=availableLeads[0];
    if(lead){let forecastSeries=entries.map(([k,v])=>({name:(names[k]||k)+" · previsione +"+Math.round(lead/24)+"g",color:colors[k]||"#0876ad",points:(v.samples||[]).filter(p=>p.leadHours===lead).map(p=>({x:p.valid,y:p.forecast}))})).filter(x=>x.points.length),analysisPoints=[...new Map(entries.flatMap(([,v])=>(v.samples||[]).filter(p=>p.leadHours===lead).map(p=>[p.valid,{x:p.valid,y:p.analysis}]))).values()];if(analysisPoints.length)forecastSeries.unshift({name:"Analisi IFS",color:"#20384b",points:analysisPoints});chart($("#verification-plot"),forecastSeries,"m/s",true)}
  }
  function render(){renderStrength();renderMaps();renderVertical();renderAccuracy()}
  async function load(){
    try{
      let r=await fetch("/data/dashboard.json",{cache:"no-store"});if(!r.ok)throw new Error("Feed non pronto");s.data=await r.json();
      let available=Object.entries(s.data.sources||{}).filter(x=>x[1].available);
      $("#runline").innerHTML=available.map(x=>"<strong>"+(names[x[0]]||x[0])+" "+(x[1].init||"")+"</strong>").join(" · ");
      $("#updated").textContent="Aggiornato "+new Date(s.data.generatedAt).toLocaleString("it-IT",{timeZone:"UTC"})+" UTC";
      $("#feed-status").textContent="Aggiornamento automatico · "+available.length+"/6 modelli disponibili. Run e validità riportati nelle viste.";
      $("#credits").textContent='Fonti: ECMWF Open Data · NOAA/NCEP · NOAA PSL.';
      let primary=s.data.models?.ecmwf_ifs?.series||[],now=primary.find(x=>Number(x.leadHours)===0),future=(s.data.models?.ecmwf_ens?.series||[]).find(x=>Number(x.leadHours)>=240&&x.u10!=null)||(s.data.models?.gefs?.series||[]).find(x=>Number(x.leadHours)>=240&&x.u10!=null);
      if(now?.u10!=null){$("#wind-state").textContent=now.u10<0?"Venti orientali":"Venti occidentali";let normal=now.u10-num(now.u10anom);$("#wind-value").textContent=fmt(now.u10)+" m/s · normale 1991–2020 "+fmt(normal)+" m/s · "+date(now.valid);$("#wind-meter").style.setProperty("--pos",Math.max(0,Math.min(100,(now.u10+10)/50*100))+"%")}
      if(future?.u10!=null){$("#forecast-state").textContent=future.u10<0?"Media ensemble sotto zero":"Media ensemble positiva";$("#forecast-value").textContent=fmt(future.u10)+" m/s · "+date(future.valid)}
      let heat=primary.find(x=>x.heatFlux100!=null);if(heat){$("#wave-state").textContent=fmt(heat.heatFlux100)+" K·m/s";$("#wave-value").textContent="v′T′ 100 hPa · "+date(heat.valid)}
      let shares=[];
      ["aifs_ens","gefs"].forEach(k=>{let row=s.data.probabilities?.[k]?.rows?.at(-1);if(row?.rawShare!=null)shares.push((k==="gefs"?"GEFS":"AIFS ENS")+" "+Math.round(row.rawShare*100)+"%")});
      if(shares.length){$("#ssw-state").textContent=shares.length+" ensemble · quota grezza";$("#ssw-value").textContent=shares.join(" · ")+" · membri U60<0 al lead ~14g; non probabilità calibrata"}
      let probRows=[];
      ["aifs_ens","gefs"].forEach(k=>{let row=s.data.probabilities?.[k]?.rows?.at(-1);if(row?.rawShare!=null)probRows.push([k==="gefs"?"GEFS":"AIFS ENS",row.membersBelowZero,row.members,row.rawShare,row.leadHours])});
      if(probRows.length)$("#odds-table").innerHTML='<table style="width:100%;border-collapse:collapse"><thead><tr><th style="text-align:left;padding:7px;border-bottom:1px solid var(--line)">Ensemble</th><th style="text-align:right;padding:7px;border-bottom:1px solid var(--line)">Membri</th><th style="text-align:right;padding:7px;border-bottom:1px solid var(--line)">U60&lt;0</th><th style="text-align:right;padding:7px;border-bottom:1px solid var(--line)">Lead</th></tr></thead><tbody>'+probRows.map(r=>'<tr><td style="padding:7px;border-bottom:1px solid #edf2f5">'+r[0]+'</td><td style="text-align:right;padding:7px;border-bottom:1px solid #edf2f5">'+r[1]+'/'+r[2]+'</td><td style="text-align:right;padding:7px;border-bottom:1px solid #edf2f5;font-weight:800">'+Math.round(r[3]*100)+'%</td><td style="text-align:right;padding:7px;border-bottom:1px solid #edf2f5">+'+Math.round(r[4]/24)+' g</td></tr>').join('')+'</tbody></table><small style="display:block;margin-top:7px;color:var(--muted)">Quota grezza campionata a +14 giorni; non probabilità calibrata né criterio completo di SSW.</small>';
      render();
    }catch(e){$("#feed-status").textContent="Il primo aggiornamento dei modelli partirà dopo il collegamento GitHub Actions."}
  }
  $$("[data-model]").forEach(b=>b.addEventListener("click",()=>{s.model=b.dataset.model;renderStrength();renderVertical()}));
  $$("[data-view]").forEach(b=>b.addEventListener("click",()=>{$$("[data-view]").forEach(x=>x.setAttribute("aria-selected",String(x===b)));$$(".view-section").forEach(x=>x.classList.toggle("hidden",x.id!=="view-"+b.dataset.view));if(b.dataset.view==="maps")renderMaps();if(b.dataset.view==="vertical")renderVertical();if(b.dataset.view==="accuracy")renderAccuracy()}));
  $$("[data-forecast]").forEach(b=>b.addEventListener("click",()=>{s.kind=b.dataset.forecast;renderStrength()}));
  $$("[data-chart]").forEach(b=>b.addEventListener("click",()=>{s.chart=b.dataset.chart;renderStrength()}));
  $("#map-model")?.addEventListener("change",renderMaps);
  $$("[data-level]").forEach(b=>b.addEventListener("click",()=>{s.level=b.dataset.level;renderMaps()}));
  $$("[data-field]").forEach(b=>b.addEventListener("click",()=>{s.mapField=b.dataset.field;renderMaps()}));
  $("#map-step")?.addEventListener("input",e=>{s.step=Number(e.target.value);renderMaps()});
  $("#map-play")?.addEventListener("click",()=>{let b=$("#map-play");if(b.dataset.timer){clearInterval(Number(b.dataset.timer));delete b.dataset.timer;b.textContent="▶";return}b.textContent="Ⅱ";b.dataset.timer=String(setInterval(()=>{let r=$("#map-step");r.value=(Number(r.value)+4)%32;r.dispatchEvent(new Event("input"))},1200))});
  $$("[data-vfield]").forEach(b=>b.addEventListener("click",()=>{s.vfield=b.dataset.vfield;renderVertical()}));
  $$("[data-vscale]").forEach(b=>b.addEventListener("click",()=>{ $$("[data-vscale]").forEach(x=>x.setAttribute("aria-pressed",String(x===b)));renderVertical()}));
  $$("[data-vmodel]").forEach(b=>b.addEventListener("click",()=>{s.model=b.dataset.vmodel;if(s.model==="gfs")$$("[data-vscale]").forEach(x=>x.setAttribute("aria-pressed",String(x.dataset.vscale==="raw")));else if($$('[data-vscale="raw"]').some(x=>x.getAttribute("aria-pressed")==="true"))$$("[data-vscale]").forEach(x=>x.setAttribute("aria-pressed",String(x.dataset.vscale==="anomaly")));$$("[data-vmodel]").forEach(x=>x.setAttribute("aria-pressed",String(x===b)));renderVertical()}));
  $$('[data-period],[data-amodel],[data-atype]').forEach(b=>b.addEventListener("click",()=>{let group=b.matches("[data-period]")?"data-period":b.matches("[data-amodel]")?"data-amodel":"data-atype";$$("["+group+"]").forEach(x=>x.setAttribute("aria-pressed",String(x===b)));renderAccuracy()}));
  $$('[data-run-count]').forEach(b=>b.addEventListener("click",()=>{$$('[data-run-count]').forEach(x=>x.setAttribute("aria-pressed",String(x===b)));s.runCount=Number(b.dataset.runCount);renderStrength()}));
  $("#refresh")?.addEventListener("click",load);
  load();setInterval(load,15*60*1000);
})();
