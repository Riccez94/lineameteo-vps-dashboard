(() => {
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const colors = {ecmwf_ifs:"#0876ad",ecmwf_ens:"#55a6d5",aifs:"#7446a8",aifs_ens:"#ad8ac8",gfs:"#d17b17",gefs:"#1a8a5d"};
  const palette = colors;
  const names = {ecmwf_ifs:"ECMWF IFS",ecmwf_ens:"ECMWF ENS",aifs:"AIFS",aifs_ens:"AIFS ENS",gfs:"GFS",gefs:"GEFS"};
  const s = {data:null,model:"ecmwf",kind:"single",chart:"wind",mapField:"vortex",level:"10",step:0,vfield:"wind",runCount:12};
  const num = v => v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null;
  const fmt = v => v == null ? "—" : Number(v).toLocaleString("it-IT",{maximumFractionDigits:1,minimumFractionDigits:1});
  const date = v => new Intl.DateTimeFormat("it-IT",{day:"2-digit",month:"short",timeZone:"UTC"}).format(new Date(v));
  function keys() {
    let a = s.model === "compare" ? Object.keys(s.data.models||{}) : s.model === "gfs" ? ["gfs","gefs"] : s.model === "aifs" ? ["aifs","aifs_ens"] : ["ecmwf_ifs","ecmwf_ens"];
    return a.filter(k => s.kind === "ensemble" ? k.endsWith("_ens") || k === "gefs" : !(k.endsWith("_ens") || k === "gefs"));
  }
  function chart(container, series, unit, zero) {
    let pts = series.flatMap(x=>x.points).filter(p=>num(p.y)!==null && Number.isFinite(Date.parse(p.x)));
    if (!pts.length) { container.innerHTML='<div class="chart-empty"><div><strong>Dati non disponibili per questa selezione</strong>Questo modello o tipo di previsione non ha ancora fornito valori utilizzabili. Prova un altro modello o i run singoli.</div></div>';if(container.id==="strength-chart")$("#strength-legend").innerHTML="";return; }
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
    $$('[data-model]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.model===s.model)));
    $$('[data-forecast]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.forecast===s.kind)));
    $$('[data-chart]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.chart===s.chart)));
    if(s.chart==="trend"){let archive=s.data.archive||{},group=s.model==="compare"?which:[which[0]],count=s.runCount;let series=group.flatMap(k=>Object.entries(archive[k]||{}).slice(-count).map(r=>({name:(names[k]||k)+" · "+r[0],color:palette[k],points:r[1].map(p=>({x:p.valid,y:num(p.u10)})).filter(p=>p.y!==null)})));chart($("#strength-chart"),series,"m/s",true)}
    else if(s.chart==="season"){
      const observed=Object.entries(s.data.analysis||{}).map(([x,y])=>({x,y:num(y)})).filter(p=>p.y!==null).sort((a,b)=>Date.parse(a.x)-Date.parse(b.x));
      const forecasts=modelSeries(which,"u10");
      chart($("#strength-chart"),[{name:"Analisi IFS",color:"#17354e",points:observed},...forecasts],"m/s",true);
    }
    else chart($("#strength-chart"),modelSeries(which,field),s.chart==="temperature"?"°C":"m/s",s.chart!=="temperature");
    $("#strength-title").textContent=s.chart==="temperature"?"Temperatura a 10 hPa · media 55–65°N":s.chart==="trend"?"Confronto degli ultimi "+s.runCount+" run archiviati · U60":s.chart==="season"?"Andamento stagionale · U60 a 10 hPa":"Vento zonale medio · 60°N · 10 hPa";
    $("#strength-subtitle").textContent=s.chart==="temperature"?"Temperatura media tra 55° e 65°N a 10 hPa. Sono mostrate solo le previsioni effettivamente disponibili.":s.chart==="trend"?"Confronto delle ultime emissioni archiviate: ogni curva è un run distinto. Le differenze mostrano come è cambiata la previsione.":s.chart==="season"?"Analisi osservata e run selezionati. La linea dello zero separa venti occidentali e orientali; le curve d’ensemble compaiono quando il relativo feed è disponibile.":"Vento zonale medio a 60°N e 10 hPa. Sopra lo zero soffiano venti occidentali; sotto lo zero, venti orientali.";
    let avail=which.filter(k=>s.data.sources?.[k]?.available&&s.data.models?.[k]?.series?.length);$("#strength-freshness").textContent=avail.map(k=>names[k]+" · run "+s.data.sources[k].init).join(" | ")||"Nessun run disponibile per questa scelta: cambia modello o seleziona i run singoli.";
    let wave=which.map(k=>({name:names[k],color:colors[k],points:(s.data.models[k]?.series||[]).filter(p=>num(p.heatFlux100)!==null).map(p=>({x:p.valid,y:num(p.heatFlux100)}))})).filter(x=>x.points.length);
    if(wave.length){chart($("#wave-chart"),wave,"K·m/s",false);$("#wave-legend").innerHTML=wave.map(x=>'<span class="leg"><i class="line-swatch" style="--c:'+x.color+'"></i>'+x.name+'</span>').join("")}
    else {$("#wave-chart").innerHTML='<div class="chart-empty"><div><strong>Flusso non disponibile</strong>Nei run selezionati mancano i campi necessari per calcolare v′T′ a 100 hPa.</div></div>';$("#wave-legend").innerHTML=""}
  }
  function renderMaps(){
    if(!s.data)return;$$("[data-level]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.level===s.level)));$$("[data-field]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.field===s.mapField)));let sel=$("#map-model").value,which=sel==="compare"?Object.keys(s.data.models||{}):sel==="ifs"?["ecmwf_ifs","ecmwf_ens"]:sel==="aifs"?["aifs","aifs_ens"]:[sel];
    let step=Number(s.step)*48,levels=s.level==="both"?[10,50]:[Number(s.level)],imgs=[];
    which.forEach(k=>levels.forEach(l=>{let url=s.data.models?.[k]?.maps?.[String(l)]?.[String(step)]?.[s.mapField];if(url)imgs.push({k:k,l:l,url:url,run:s.data.models[k].init})}));
    $("#map-step-label").textContent=step===0?"Analisi · +0 h":"Giorno "+(step/24)+" · +"+step+" h";
    $("#map-display").innerHTML=imgs.length?imgs.map(a=>'<figure style="margin:0 0 14px"><img src="'+a.url+'" alt="'+(names[a.k]||a.k)+' '+a.l+' hPa '+s.mapField+' +'+step+'h"><figcaption style="padding:6px;font-size:12px;color:var(--muted)"><b>'+(names[a.k]||a.k)+'</b> · '+a.l+' hPa · run '+a.run+' · +'+step+' h</figcaption></figure>').join(""):'<div class="map-placeholder"><div><strong>Mappa non disponibile</strong>Questo run non contiene il campo, livello o passo selezionato.</div></div>';
    const captions={temp:"Temperatura: scarto dalla media mensile NOAA PSL 1991–2020, in °C. Rosso = più mite della media; blu = più freddo.",height:"Altezza geopotenziale: scarto dalla media mensile NOAA PSL 1991–2020, in metri. Le linee mostrano il geopotenziale previsto.",vortex:"Temperatura prevista a colori e linee di altezza geopotenziale: insieme mostrano forma, posizione e struttura del vortice.",wind:"Vento zonale in m/s: valori positivi indicano venti occidentali; negativi, venti orientali."};
    $("#map-caption").textContent=imgs.length+" mappe · "+(captions[s.mapField]||"");
  }
  function renderVertical(){
    if(!s.data)return;let k=s.model==="gfs"?"gfs":s.model==="aifs"?"aifs":"ecmwf_ifs",rows=s.data.models?.[k]?.series||[],scale=$('[data-vscale][aria-pressed="true"]')?.dataset.vscale||"anomaly",allLevels=[1,2,3,5,7,10,15,20,30,50,70,100,150,200,300,500,700,850,925,1000],prefix=s.vfield==="wind"?"u":s.vfield==="temperature"?"t":"z",suffix=scale==="sigma"?"sigma":"anom",valkey=l=>scale==="raw"?prefix+l:prefix+l+suffix,levels=allLevels.filter(l=>(scale==="raw"&&k==="gfs")||l>=10).filter(l=>rows.some(r=>num(r[valkey(l)])!==null)),vals=rows.flatMap(r=>levels.map(l=>num(r[valkey(l)])).filter(v=>v!==null));
    if(!vals.length){$("#vertical-chart").innerHTML='<div class="chart-empty"><div><strong>Sezione non disponibile</strong>Livelli verticali non presenti nel run selezionato.</div></div>';return}
    let W=1000,H=Math.max(600,levels.length*29+145),left=82,top=25,cw=(W-left-18)/Math.max(rows.length,1),ch=(H-top-120)/levels.length;
    let lo=Math.min(...vals),hi=Math.max(...vals);
    if(scale==="sigma"){lo=-3;hi=3}
    else if(scale==="anomaly"){let extent=s.vfield==="height"?1500:s.vfield==="temperature"?25:25;lo=-extent;hi=extent}
    else if(lo===hi){lo-=1;hi+=1}
    const colorFor=v=>{let q=scale==="raw"?Math.max(0,Math.min(1,(v-lo)/(hi-lo||1))):Math.max(-1,Math.min(1,v/Math.max(Math.abs(lo),Math.abs(hi))));if(scale==="raw"){let a=[40,125,195],b=[204,60,48];return 'rgb('+a.map((n,i)=>Math.round(n+(b[i]-n)*q)).join(',')+')'}let a=[248,250,252],b=q<0?[27,105,190]:[203,55,44];return 'rgb('+a.map((n,i)=>Math.round(n+(b[i]-n)*Math.abs(q))).join(',')+')'};
    let html='<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Sezione verticale: pressione crescente dall’alto verso il basso, tempo da sinistra a destra">';
    rows.forEach((r,j)=>levels.forEach((l,i)=>{let v=num(r[valkey(l)]);if(v===null)return;let color=colorFor(v);html+='<rect x="'+(left+j*cw)+'" y="'+(top+i*ch)+'" width="'+(cw+1)+'" height="'+(ch+1)+'" fill="'+color+'"><title>'+l+' hPa · '+date(r.valid)+' · '+fmt(v)+(scale==="raw"?(s.vfield==="wind"?" m/s":s.vfield==="temperature"?" °C":" m"):scale==="sigma"?" deviazioni standard":" scarto dalla media")+'</title></rect>'}));
    levels.forEach((l,i)=>html+='<text class="axis" x="'+(left-8)+'" y="'+(top+(i+.7)*ch)+'" text-anchor="end">'+l+'</text>');
    let tickEvery=Math.max(1,Math.ceil(rows.length/6));rows.forEach((r,i)=>{if(i%tickEvery===0||i===rows.length-1)html+='<text class="axis" x="'+(left+i*cw+cw/2)+'" y="'+(H-80)+'" text-anchor="middle">'+date(r.valid)+'</text>'});
    html+='<defs><linearGradient id="vps-scale" x1="0" x2="1"><stop offset="0%" stop-color="#1b69be"/><stop offset="50%" stop-color="#f8fafc"/><stop offset="100%" stop-color="#cb372c"/></linearGradient></defs><rect x="'+left+'" y="'+(H-52)+'" width="220" height="10" rx="5" fill="url(#vps-scale)"/><text class="axis" x="'+left+'" y="'+(H-34)+'">'+(scale==="raw"?"valori più bassi":"valori sotto la media")+'</text><text class="axis" x="'+(left+110)+'" y="'+(H-34)+'" text-anchor="middle">'+(scale==="raw"?"scala del grafico":"media climatica")+'</text><text class="axis" x="'+(left+220)+'" y="'+(H-34)+'" text-anchor="end">'+(scale==="raw"?"valori più alti":"valori sopra la media")+'</text><text class="axis" transform="translate(18 '+(H/2)+') rotate(-90)" text-anchor="middle">Pressione (hPa) · stratosfera in alto, superficie in basso</text></svg>';$("#vertical-chart").innerHTML=html;
  }
  function renderAccuracy(){
    let period=$('[data-period][aria-pressed="true"]')?.dataset.period||"30d",model=$('[data-amodel][aria-pressed="true"]')?.dataset.amodel||"ecmwf",kind=$('[data-atype][aria-pressed="true"]')?.dataset.atype||"single",groups=model==="gfs"?["gfs","gefs"]:model==="aifs"?["aifs","aifs_ens"]:["ecmwf_ifs","ecmwf_ens"];
    if(kind==="single")groups=groups.filter(k=>!k.endsWith("_ens")&&k!=="gefs");else groups=groups.filter(k=>k.endsWith("_ens")||k==="gefs");
    let entries=groups.map(k=>[k,s.data?.verification?.[k]?.[period]]).filter(x=>x[1]);if(!entries.length){let runs=groups.reduce((n,k)=>n+Object.keys(s.data?.archive?.[k]||{}).length,0),obs=Object.keys(s.data?.analysis||{}).length;$("#accuracy-chart").innerHTML='<div class="chart-empty"><div><strong>Verifica non ancora calcolabile</strong>Per questo modello e periodo non ci sono previsioni e analisi abbinate alla stessa scadenza. Archivio attuale: '+runs+' run e '+obs+' analisi; i punteggi compariranno quando le scadenze previste saranno osservabili.</div></div>';return}
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
      let primary=s.data.models?.ecmwf_ifs?.series||[],now=primary.find(x=>Number(x.leadHours)===0),future=primary.find(x=>Number(x.leadHours)===240&&x.u10!=null);
      if(now?.u10!=null){$("#wind-state").textContent=now.u10<0?"Venti orientali":"Venti occidentali";let normal=now.u10anom==null?null:now.u10-num(now.u10anom);$("#wind-value").textContent=fmt(now.u10)+" m/s · media climatica 1991–2020 "+fmt(normal)+" m/s · "+date(now.valid);$("#wind-meter").style.setProperty("--pos",Math.max(0,Math.min(100,(now.u10+10)/50*100))+"%")}
      if(future?.u10!=null){$("#forecast-state").textContent=future.u10<0?"Venti orientali previsti":"Venti occidentali previsti";$("#forecast-value").textContent=fmt(future.u10)+" m/s · media 55–65°N · validità "+date(future.valid)+" · run ECMWF IFS deterministico"}
      else {$("#forecast-state").textContent="Scadenza non disponibile";$("#forecast-value").textContent="Il run ECMWF IFS non contiene il valore a +240 ore."}
      let heat=primary.find(x=>x.heatFlux100!=null);if(heat){$("#wave-state").textContent=heat.heatFlux100>=0?"Flusso verso il polo":"Flusso verso l’equatore";$("#wave-value").textContent=fmt(heat.heatFlux100)+" K·m/s · v′T′ a 100 hPa · "+date(heat.valid)+" · ECMWF IFS"}
      let probRows=[];
      ["aifs_ens","gefs"].forEach(k=>{let rows=s.data.probabilities?.[k]?.rows||[],row=rows.find(x=>Number(x.leadHours)===336);if(row)probRows.push({k,row})});
      const pct=r=>r.rawShare==null?"—":Math.round(r.rawShare*100)+"%";
      const rowName=k=>k==="gefs"?"GEFS":"AIFS ENS";
      if(probRows.length){let usable=probRows.filter(x=>x.row.rawShare!=null);$("#ssw-state").textContent=usable.length?usable.map(x=>x.row.membersBelowZero+"/"+x.row.members).join(" · ")+" sotto zero":"Dati ensemble non disponibili";$("#ssw-value").textContent=usable.map(x=>rowName(x.k)+": "+x.row.membersBelowZero+" membri su "+x.row.members+" ("+pct(x.row)+") a +14 giorni, run "+date(s.data.probabilities[x.k].run)).join("; ")||"Nessun membro disponibile per la scadenza +336 ore.";
        $("#odds-table").innerHTML='<div class="mobile-scroll"><table style="width:100%;border-collapse:collapse"><thead><tr><th style="text-align:left;padding:7px;border-bottom:1px solid var(--line)">Modello d’ensemble</th><th style="text-align:right;padding:7px;border-bottom:1px solid var(--line)">Sotto zero / totale</th><th style="text-align:right;padding:7px;border-bottom:1px solid var(--line)">Frazione</th><th style="text-align:right;padding:7px;border-bottom:1px solid var(--line)">Scadenza</th></tr></thead><tbody>'+probRows.map(x=>'<tr><td style="padding:7px;border-bottom:1px solid #edf2f5">'+rowName(x.k)+'</td><td style="text-align:right;padding:7px;border-bottom:1px solid #edf2f5">'+(x.row.members?x.row.membersBelowZero+" / "+x.row.members:"dati non disponibili")+'</td><td style="text-align:right;padding:7px;border-bottom:1px solid #edf2f5;font-weight:800">'+pct(x.row)+'</td><td style="text-align:right;padding:7px;border-bottom:1px solid #edf2f5">+'+Math.round(x.row.leadHours/24)+' giorni</td></tr>').join('')+'</tbody></table></div><small style="display:block;margin-top:7px;color:var(--muted)">È il conteggio dei membri con vento zonale medio negativo a 60°N e 10 hPa alla scadenza indicata. La percentuale è una frazione del campione, non una probabilità calibrata né una diagnosi di SSW.</small>';
      } else {$("#ssw-state").textContent="Dati ensemble non disponibili";$("#ssw-value").textContent="Al momento il feed non contiene membri con cui stimare questa frazione."}
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
  $("#map-play")?.addEventListener("click",()=>{let b=$("#map-play");if(b.dataset.timer){clearInterval(Number(b.dataset.timer));delete b.dataset.timer;b.textContent="▶";return}b.textContent="Ⅱ";b.dataset.timer=String(setInterval(()=>{let r=$("#map-step");r.value=(Number(r.value)+1)%8;r.dispatchEvent(new Event("input"))},1200))});
  $$("[data-vfield]").forEach(b=>b.addEventListener("click",()=>{s.vfield=b.dataset.vfield;renderVertical()}));
  $$("[data-vscale]").forEach(b=>b.addEventListener("click",()=>{ $$("[data-vscale]").forEach(x=>x.setAttribute("aria-pressed",String(x===b)));renderVertical()}));
  $$("[data-vmodel]").forEach(b=>b.addEventListener("click",()=>{s.model=b.dataset.vmodel;if(s.model==="gfs")$$("[data-vscale]").forEach(x=>x.setAttribute("aria-pressed",String(x.dataset.vscale==="raw")));else if($$('[data-vscale="raw"]').some(x=>x.getAttribute("aria-pressed")==="true"))$$("[data-vscale]").forEach(x=>x.setAttribute("aria-pressed",String(x.dataset.vscale==="anomaly")));$$("[data-vmodel]").forEach(x=>x.setAttribute("aria-pressed",String(x===b)));renderVertical()}));
  $$('[data-period],[data-amodel],[data-atype]').forEach(b=>b.addEventListener("click",()=>{let group=b.matches("[data-period]")?"data-period":b.matches("[data-amodel]")?"data-amodel":"data-atype";$$("["+group+"]").forEach(x=>x.setAttribute("aria-pressed",String(x===b)));renderAccuracy()}));
  $$('[data-run-count]').forEach(b=>b.addEventListener("click",()=>{$$('[data-run-count]').forEach(x=>x.setAttribute("aria-pressed",String(x===b)));s.runCount=Number(b.dataset.runCount);renderStrength()}));
  $("#refresh")?.addEventListener("click",load);
  load();setInterval(load,15*60*1000);
})();
