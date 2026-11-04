(() => {
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const colors = {ecmwf_ifs:"#dc2626",ecmwf_ens:"#f18b8b",aifs:"#1559c7",aifs_ens:"#7298e8",gfs:"#7527b8",gefs:"#079447"};
  const palette = colors;
  const names = {ecmwf_ifs:"ECMWF IFS",ecmwf_ens:"ECMWF ENS",aifs:"AIFS",aifs_ens:"AIFS ENS",gfs:"GFS",gefs:"GEFS"};
  const s = {data:null,model:"ecmwf",vmodel:"ecmwf",kind:"single",chart:"wind",mapField:"vortex",level:"10",step:0,vfield:"wind",runCount:12};
  const num = v => v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null;
  const fmt = v => v == null ? "—" : Number(v).toLocaleString("it-IT",{maximumFractionDigits:1,minimumFractionDigits:1});
  const date = v => new Intl.DateTimeFormat("it-IT",{day:"2-digit",month:"short",timeZone:"UTC"}).format(new Date(v));
  const dateTime = v => new Intl.DateTimeFormat("it-IT",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit",timeZone:"UTC"}).format(new Date(v))+" UTC";
  const runDescription = (key, run) => {
    const source=s.data?.sources?.[key]||{};
    return source.status==="stale"&&source.expectedInit
      ? "ultimo run disponibile "+dateTime(run)+" · run atteso "+dateTime(source.expectedInit)
      : "run "+dateTime(run);
  };
  const ensembleRunDescription = (key, run) => {
    const expected=s.data?.sources?.[key]?.expectedInit;
    return expected&&Date.parse(run)<Date.parse(expected)
      ? "ultimo campione membri "+dateTime(run)+" · ciclo atteso "+dateTime(expected)
      : "campione membri del run "+dateTime(run);
  };
  function keys() {
    let a = s.model === "compare" ? Object.keys(s.data.models||{}) : s.model === "gfs" ? ["gfs","gefs"] : s.model === "aifs" ? ["aifs","aifs_ens"] : ["ecmwf_ifs","ecmwf_ens"];
    return a.filter(k => s.kind === "ensemble" ? k.endsWith("_ens") || k === "gefs" : !(k.endsWith("_ens") || k === "gefs"));
  }
  function chart(container, series, unit, zero, empty={}) {
    // Do not render isolated dots as if they were a time series. Several
    // feeds can contain one valid point each while still having no line to
    // interpret (a common case during the first archive runs).
    const usable=series.map(a=>({...a,points:a.points.filter(p=>num(p.y)!==null&&Number.isFinite(Date.parse(p.x))).sort((p,q)=>Date.parse(p.x)-Date.parse(q.x))}))
      .filter(a=>a.points.length>1&&a.points.some((p,i)=>i>0&&Date.parse(p.x)-Date.parse(a.points[i-1].x)<=(Number.isFinite(a.maxGapHours)?a.maxGapHours:36)*3600000));
    let pts = usable.flatMap(x=>[...x.points,...(x.band||[]).flatMap(p=>[{x:p.x,y:p.low},{x:p.x,y:p.high}])]);
    if (!usable.length) { container.innerHTML='<div class="chart-empty compact"><div><strong>'+(empty.title||"Serie non ancora disponibile")+'</strong>'+(empty.message||"Il feed non contiene ancora scadenze sufficienti e consecutive per tracciare un andamento.")+'</div></div>';if(container.id==="strength-chart")$("#strength-legend").innerHTML="";return; }
    let c=document.createElement("canvas"), w=1200,h=420,dpr=Math.min(2,window.devicePixelRatio||1);
    c.width=w*dpr;c.height=h*dpr;c.style.width="100%";c.style.height="auto";c.tabIndex=0;c.setAttribute("role","img");c.setAttribute("aria-label","Grafico interattivo, valori in "+unit+". Passa il puntatore o seleziona il grafico per leggere i dati.");container.innerHTML="";container.style.position="relative";container.appendChild(c);
    let x=c.getContext("2d");x.scale(dpr,dpr);let m={l:78,r:24,t:24,b:48}, vals=pts.map(p=>+p.y),fixedDomain=Array.isArray(empty.domain)&&empty.domain.length===2&&empty.domain.every(Number.isFinite),lo=fixedDomain?empty.domain[0]:Math.min(...vals,zero?0:Infinity),hi=fixedDomain?empty.domain[1]:Math.max(...vals,zero?0:-Infinity),pad=fixedDomain?0:(hi-lo||1)*.12;lo-=pad;hi+=pad;
    let tx=pts.map(p=>Date.parse(p.x)),x0=Math.min(...tx),x1=Math.max(...tx);if(x1===x0)x1=x0+24*3600000;
    let X=v=>m.l+(Date.parse(v)-x0)/(x1-x0)*(w-m.l-m.r),Y=v=>m.t+(hi-v)/(hi-lo)*(h-m.t-m.b);
    x.font="13px Segoe UI";x.strokeStyle="#e5edf3";x.fillStyle="#617b90";x.lineWidth=1;
    const decimals=unit==="°C"?1:0;
    for(let i=0;i<=5;i++){let y=m.t+i*(h-m.t-m.b)/5,v=hi-i*(hi-lo)/5;x.beginPath();x.moveTo(m.l,y);x.lineTo(w-m.r,y);x.stroke();x.textAlign="right";x.fillText(v.toFixed(decimals),m.l-12,y+4)}
    x.textAlign="left";
    if(zero&&lo<0&&hi>0){x.strokeStyle="#1c3548";x.beginPath();x.moveTo(m.l,Y(0));x.lineTo(w-m.r,Y(0));x.stroke()}
    usable.forEach(a=>{
      if(a.band?.length>1){const band=[...a.band].filter(p=>num(p.low)!==null&&num(p.high)!==null&&Number.isFinite(Date.parse(p.x))).sort((p,q)=>Date.parse(p.x)-Date.parse(q.x));if(band.length>1){x.save();x.globalAlpha=.14;x.fillStyle=a.color;x.beginPath();band.forEach((p,i)=>i?x.lineTo(X(p.x),Y(p.high)):x.moveTo(X(p.x),Y(p.high)));[...band].reverse().forEach(p=>x.lineTo(X(p.x),Y(p.low)));x.closePath();x.fill();x.restore()}}
      const p=a.points.filter(q=>num(q.y)!==null&&Number.isFinite(Date.parse(q.x))).sort((q,r)=>Date.parse(q.x)-Date.parse(r.x));
      if(!p.length)return;x.strokeStyle=a.color;x.lineWidth=a.name==="Analisi IFS archiviata"?3.5:2.8;x.lineJoin="round";x.lineCap="round";x.setLineDash(a.dash?[7,5]:[]);let segment=[];
      const flush=()=>{if(segment.length>1){x.beginPath();segment.forEach((q,i)=>i?x.lineTo(X(q.x),Y(q.y)):x.moveTo(X(q.x),Y(q.y)));x.stroke()}segment=[]};
      const maxGapHours=Number.isFinite(a.maxGapHours)?a.maxGapHours:36;
      p.forEach((q,i)=>{if(i&&Date.parse(q.x)-Date.parse(p[i-1].x)>maxGapHours*3600000)flush();segment.push(q)});flush();x.setLineDash([]);
      if(a.markers!==false)p.forEach(q=>{x.beginPath();x.fillStyle=a.color;x.arc(X(q.x),Y(q.y),2.6,0,Math.PI*2);x.fill()});
    });
    const rangeHours=(x1-x0)/3600000;
    for(let i=0;i<5;i++){let d=new Date(x0+(x1-x0)*i/4);x.fillStyle="#617b90";x.textAlign=i===0?"left":i===4?"right":"center";x.fillText(rangeHours<48?dateTime(d.toISOString()):date(d.toISOString()),m.l+i*(w-m.l-m.r)/4,h-12)}
    x.save();x.translate(17,h/2);x.rotate(-Math.PI/2);x.textAlign="center";x.fillStyle="#17354e";x.fillText(unit,h/2,0);x.restore();x.textAlign="left";
    let legend=$("#strength-legend");if(legend&&container.id==="strength-chart"){let unique=[...new Map(usable.map(a=>[a.name,a])).values()];legend.innerHTML=unique.map(a=>'<span class="leg"><i class="'+(a.dash?'dash-swatch':'line-swatch')+'" style="--c:'+a.color+'"></i>'+a.name+'</span>').join("")}
    let tooltip=document.createElement("div");tooltip.className="chart-tooltip";tooltip.setAttribute("role","status");tooltip.hidden=true;container.appendChild(tooltip);
    const showPoint=event=>{const rect=c.getBoundingClientRect(),px=(event.clientX-rect.left)*w/rect.width,py=(event.clientY-rect.top)*h/rect.height;let best=null;usable.forEach(a=>a.points.forEach(q=>{if(num(q.y)===null)return;let dx=X(q.x)-px,dy=Y(q.y)-py,d=dx*dx+dy*dy;if(!best||d<best.d)best={a,q,d,dx}}));if(!best||best.d>45*45){tooltip.hidden=true;return}tooltip.textContent=best.a.name+" · "+dateTime(best.q.x)+" · "+fmt(best.q.y)+" "+unit;tooltip.style.left=Math.min(72,Math.max(3,px/w*100))+"%";tooltip.hidden=false};
    c.addEventListener("pointermove",showPoint);c.addEventListener("pointerleave",()=>{tooltip.hidden=true});c.addEventListener("focus",()=>{const q=pts[0];if(q){tooltip.textContent=dateTime(q.x)+" · "+fmt(q.y)+" "+unit;tooltip.style.left="3%";tooltip.hidden=false}});c.addEventListener("blur",()=>{tooltip.hidden=true});
    container.setAttribute("aria-label","Grafico interattivo "+unit);
  }
  function modelSeries(which,field) {
    return which.filter(k=>s.data.models?.[k]?.series?.length).map(k=>({name:names[k]||k,color:colors[k],points:s.data.models[k].series.map(p=>({x:p.valid,y:num(p[field])})).filter(p=>p.y!==null)}));
  }
  function ensembleWindSeries(which) {
    return which.flatMap(k=>{
      const feed=s.data.probabilities?.[k],run=Date.parse(feed?.run||"");
      const points=(feed?.series||[]).filter(r=>num(r.mean)!==null&&Number.isFinite(run)).map(r=>({x:new Date(run+Number(r.leadHours)*3600000).toISOString(),y:Number(r.mean)}));
      const band=(feed?.series||[]).filter(r=>num(r.p10)!==null&&num(r.p90)!==null&&Number.isFinite(run)).map(r=>({x:new Date(run+Number(r.leadHours)*3600000).toISOString(),low:Number(r.p10),high:Number(r.p90)}));
      return points.length? [{name:(names[k]||k)+" · media U60",color:colors[k]||"#0876ad",points,band,maxGapHours:k==="gefs"?120:36}]:[];
    });
  }
  function ensembleTemperatureSeries(which) {
    return which.flatMap(k=>{
      const feed=s.data.probabilities?.[k],run=Date.parse(feed?.run||"");
      const rows=feed?.temperatureSeries||[];
      const points=rows.filter(r=>num(r.mean)!==null&&Number.isFinite(run)).map(r=>({x:new Date(run+Number(r.leadHours)*3600000).toISOString(),y:Number(r.mean)}));
      const band=rows.filter(r=>num(r.p10)!==null&&num(r.p90)!==null&&Number.isFinite(run)).map(r=>({x:new Date(run+Number(r.leadHours)*3600000).toISOString(),low:Number(r.p10),high:Number(r.p90)}));
      return points.length?[{name:(names[k]||k)+" · media temperatura",color:colors[k]||"#0876ad",points,band,maxGapHours:36}]:[];
    });
  }
  function renderStatusSummary(){
    if(!s.data)return;
    const order=["ecmwf_ifs","aifs","gfs","ecmwf_ens","aifs_ens","gefs"];
    const setTone=(id,tone)=>{const value=$("#"+id),card=value?.closest(".status-card");if(!value||!card)return;value.classList.remove("warn","alert","ok");card.classList.remove("tone-warn","tone-alert","tone-ok");if(tone){value.classList.add(tone);card.classList.add("tone-"+tone)}};
    const renderRows=(id,rows,empty)=>{$("#"+id).innerHTML=rows.length?rows.map(r=>'<div class="status-row"><b>'+r.label+'</b><span>'+r.value+'<small>'+r.note+'</small></span></div>').join(""):'<div class="status-note">'+empty+'</div>'};
    const starts=order.flatMap(k=>{const model=s.data.models?.[k],p=model?.series?.find(x=>Number(x.leadHours)===0&&num(x.u10)!==null);if(!p)return[];const source=s.data.sources?.[k]||{};return[{key:k,p,model,source}]});
    const initial=starts.map(({key,p,model})=>({label:names[key],value:fmt(p.u10)+" m/s",note:(key.endsWith("_ens")||key==="gefs"?"media ensemble":"run singolo")+" · valida "+dateTime(p.valid)+" · "+runDescription(key,model.init)}));
    renderRows("status-initial-models",initial,"Nessun valore iniziale disponibile nei run selezionati.");
    const reference=starts.find(x=>x.key==="ecmwf_ifs")||starts[0];
    if(reference){const normal=num(reference.p.u10normal),ratio=normal>0?reference.p.u10/normal:null,tone=reference.p.u10<0?"alert":ratio!==null&&ratio<.4?"warn":"ok";$("#wind-state").textContent=reference.p.u10<0?"Venti orientali":ratio===null?"Venti occidentali":ratio<.4?"Molto debole":ratio<.7?"Debole":ratio>1.25?"Forte":"Vicino alla norma";$("#wind-value").textContent=fmt(reference.p.u10)+" m/s · "+(normal===null?"U60 a 10 hPa e 60°N":"media climatica 1991–2020 "+fmt(normal)+" m/s")+" · "+names[reference.key];$("#wind-meter").style.setProperty("--pos",Math.max(0,Math.min(100,(reference.p.u10+10)/50*100))+"%");setTone("wind-state",tone)}else{$("#wind-state").textContent="Valore non disponibile";setTone("wind-state",null)}
    // Compare the +10-day signal at one shared valid time. Runs issued at
    // different hours have different +240 h validities, so lead alone is not
    // a valid cross-model comparison key.
    const forecastKeys=["ecmwf_ifs","aifs","gfs"];
    const anchorKey=forecastKeys.find(k=>s.data.models?.[k]?.series?.some(p=>Number(p.leadHours)===240&&num(p.u10)!==null));
    const anchor=anchorKey&&s.data.models[anchorKey].series.find(p=>Number(p.leadHours)===240&&num(p.u10)!==null);
    const targetValid=anchor?Date.parse(anchor.valid):NaN;
    const future=Number.isFinite(targetValid)?forecastKeys.flatMap(k=>{const model=s.data.models?.[k],p=model?.series?.find(x=>Date.parse(x.valid)===targetValid&&num(x.u10)!==null);return p?[{key:k,p,model}]:[]}):[];
    const winds=future.map(x=>x.p.u10),west=winds.filter(v=>v>0).length,east=winds.filter(v=>v<0).length;
    const signal=west&&east?"Segnale diviso · "+west+" occidentali, "+east+" orientali":west?"Venti occidentali · "+west+"/"+future.length+" modelli":east?"Venti orientali · "+east+"/"+future.length+" modelli":"Tutti i modelli indicano U60 vicino a zero";
    const forecastText=future.length?dateTime(anchor.valid)+" · "+future.map(({key,p})=>names[key]+" "+(p.u10>0?"+":"")+fmt(p.u10)+" m/s").join(" · "):"Nessun run disponibile alla stessa validità per il confronto a +10 giorni.";
    renderRows("status-forecast-models",future.map(({key,p,model})=>({label:names[key],value:(p.u10>0?"+":"")+fmt(p.u10)+" m/s",note:"U60 · valida "+dateTime(p.valid)+" · "+runDescription(key,model.init)})),"Nessun modello ha fornito U60 alla validità comune di +10 giorni.");
    $("#forecast-state").textContent=future.length?signal:"Dato non disponibile";
    $("#forecast-value").textContent=future.length?forecastText:"Confronto previsto a 10 hPa e 60°N; mostriamo solo valori riferiti alla stessa scadenza UTC.";
    setTone("forecast-state",!future.length?null:west&&east?"warn":east?"alert":west?"ok":"warn");
    const probs=["ecmwf_ens","aifs_ens","gefs"].flatMap(k=>{const source=s.data.probabilities?.[k],row=source?.rows?.find(x=>Number(x.leadHours)===336);return row?[{key:k,row,source}]:[]});
    renderRows("status-ensemble-models",probs.map(({key,row,source})=>({label:names[key],value:row.members?row.membersBelowZero+" / "+row.members+" · "+(row.rawShare==null?"—":Math.round(row.rawShare*100)+"%"):"nessun membro",note:"U60<0 a +14 giorni · "+ensembleRunDescription(key,source.run)})),"Campione +14 giorni non disponibile nei feed ensemble.");
    const availableProbs=probs.filter(x=>x.row.members&&x.row.rawShare!=null),maxShare=availableProbs.length?Math.max(...availableProbs.map(x=>x.row.rawShare)):null;
    $("#ssw-state").textContent=maxShare===null?"Campione non disponibile":maxShare===0?"Nessun membro sotto zero":maxShare<.1?"Quota ridotta nei campioni":"Membri sotto zero presenti";
    $("#ssw-value").textContent=availableProbs.length?"A +14 giorni · "+availableProbs.map(({key,row})=>names[key]+" "+row.membersBelowZero+"/"+row.members+" ("+Math.round(row.rawShare*100)+"%)").join(" · ")+". Quota del campione, non probabilità di SSW.":"Conteggi ensemble non disponibili per questa scadenza.";
    setTone("ssw-state",maxShare===null?null:maxShare===0?"ok":maxShare<.1?"warn":"alert");
    const waves=order.flatMap(k=>{const model=s.data.models?.[k],p=model?.series?.find(x=>Number(x.leadHours)===0&&num(x.heatFlux100)!==null)||model?.series?.find(x=>num(x.heatFlux100)!==null);return p?[{key:k,p,model}]:[]});
    renderRows("status-wave-models",waves.map(({key,p,model})=>({label:names[key],value:fmt(p.heatFlux100)+" K·m/s",note:"valida "+dateTime(p.valid)+" · "+runDescription(key,model.init)})),"Campi vento e temperatura a 100 hPa non disponibili.");
    const wave=waves.find(x=>x.key==="ecmwf_ifs")||waves[0];
    $("#wave-state").textContent=wave?(wave.p.heatFlux100>0?"Trasporto verso il polo":wave.p.heatFlux100<0?"Trasporto verso sud":"Flusso vicino a zero"):"Flusso non disponibile";
    $("#wave-value").textContent=wave?fmt(wave.p.heatFlux100)+" K·m/s · "+names[wave.key]+" · valida "+dateTime(wave.p.valid)+". v′T′ a 100 hPa; il segno indica la direzione del trasporto.":"v′T′ a 100 hPa: servono vento e temperatura per calcolarlo.";
    setTone("wave-state",wave?(wave.p.heatFlux100>0?"ok":"warn"):null);
  }
  function renderStrength() {
    if(!s.data)return;let which=keys(),field=s.chart==="temperature"?"t10":"u10";
    $$('[data-model]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.model===s.model)));
    $$('[data-forecast]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.forecast===s.kind)));
    $$('[data-chart]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.chart===s.chart)));
    if(s.chart==="hindcast"){
      const hindcast=s.data.hindcast;
      const start=Date.parse(s.data.probabilities?.ecmwf_ens?.run||"");
      const operational=ensembleWindSeries(["ecmwf_ens"]);
      const historical=hindcast?.series||[];
      const climatology=historical.filter(p=>Number.isFinite(start)&&num(p.median)!==null).map(p=>({x:new Date(start+Number(p.leadHours)*3600000).toISOString(),y:Number(p.median)}));
      const band=historical.filter(p=>Number.isFinite(start)&&num(p.p10)!==null&&num(p.p90)!==null).map(p=>({x:new Date(start+Number(p.leadHours)*3600000).toISOString(),low:Number(p.p10),high:Number(p.p90)}));
      const reference=climatology.length?[{name:"Climatologia hindcast ECMWF IFS · mediana",color:"#0876ad",points:climatology,band,maxGapHours:30*24}]:[];
      const live=operational.map(a=>({...a,name:"ECMWF ENS operativo · media",maxGapHours:48}));
      chart($("#strength-chart"),[...reference,...live],"m/s",true,{title:"Hindcast ECMWF non disponibile",message:"La climatologia S2S non è ancora nel feed. Il run operativo resta disponibile nel grafico Vento U60."});
    }
    else if(s.kind==="ensemble"&&(s.chart==="wind"||s.chart==="temperature")){
      const probabilitySeries=s.chart==="wind"?ensembleWindSeries(which):ensembleTemperatureSeries(which);
      const isWind=s.chart==="wind";
      chart($("#strength-chart"),probabilitySeries,isWind?"m/s":"°C",isWind,{title:"Serie ensemble non disponibile",message:isWind?"Nessun membro con U60 valido è disponibile per tracciare media e dispersione previste.":"I feed selezionati non forniscono ancora la temperatura stratosferica dei singoli membri."});
    }
    else if(s.chart==="trend"){
      let archive=s.data.archive||{},group=s.model==="compare"?which:[which[0]],count=s.runCount;
      const runColors=["#718096","#8b78a8","#a36d9d","#bd648b","#ce6a72","#d57c55","#c29442","#9b9c3d","#6d9d58","#429d75","#319a9b","#0876ad"];
      let series=group.flatMap((k,g)=>{
        const runs=Object.entries(archive[k]||{}).slice(-count);
        return runs.map((r,i)=>({
          name:(names[k]||k)+" · "+dateTime(r[0]),
          color:group.length===1?runColors[Math.max(0,runColors.length-runs.length+i)]:`hsl(${(i*29+g*127)%360} 58% ${i===runs.length-1?38:52}%)`,
          points:r[1].map(p=>({x:p.valid,y:num(p.u10)})).filter(p=>p.y!==null)
        }));
      });
      chart($("#strength-chart"),series,"m/s",true,{title:"Archivio dei run in raccolta",message:"Il confronto tra emissioni comparirà quando saranno disponibili più run con scadenze valide."})
    }
    else if(s.chart==="season"){
      const observed=Object.entries(s.data.analysis||{}).map(([x,y])=>({x,y:num(y)})).filter(p=>p.y!==null).sort((a,b)=>Date.parse(a.x)-Date.parse(b.x));
      const forecasts=modelSeries(which,"u10");
      const normal=which.flatMap(k=>(s.data.models?.[k]?.series||[]).filter(p=>num(p.u10normal)!==null).map(p=>({x:p.valid,y:num(p.u10normal)})));
      chart($("#strength-chart"),[{name:"Analisi IFS archiviata",color:"#17354e",points:observed},...forecasts,{name:"Normale mensile 1991–2020",color:"#77838d",dash:true,markers:false,points:normal}],"m/s",true,{title:"Serie U60 in raccolta",message:"Sono mostrate le scadenze archiviate e previste disponibili, fino a circa 15 giorni. Non è una previsione per l’intera stagione."});
    }
    else {
      const forecasts=modelSeries(which,field),observed=Object.entries(s.data.analysis||{}).map(([x,y])=>({x,y:num(y)})).filter(p=>p.y!==null).sort((a,b)=>Date.parse(a.x)-Date.parse(b.x));
      const normalField=s.chart==="temperature"?"t10normal":"u10normal",normal=which.flatMap(k=>(s.data.models?.[k]?.series||[]).filter(p=>num(p[normalField])!==null).map(p=>({x:p.valid,y:num(p[normalField])})));
      const references=s.chart==="wind"?[{name:"Analisi IFS archiviata",color:"#17354e",points:observed},{name:"Normale mensile 1991–2020",color:"#77838d",dash:true,markers:false,points:normal}]:[{name:"Normale mensile 1991–2020",color:"#77838d",dash:true,markers:false,points:normal}];
      const empty=s.kind==="ensemble"?{title:"Serie dei membri non disponibile",message:"I feed ensemble forniscono i conteggi della tabella, ma non una sequenza temporale dei singoli membri per questo grafico."}:{title:"Previsione non disponibile",message:"Il modello non ha ancora fornito almeno due scadenze valide per questa variabile."};
      chart($("#strength-chart"),forecasts.length?[...references,...forecasts]:[],s.chart==="temperature"?"°C":"m/s",s.chart!=="temperature",empty);
    }
    $("#strength-title").textContent=s.chart==="hindcast"?"ECMWF IFS S2S · clima hindcast a 10 hPa · 60°N":s.kind==="ensemble"&&s.chart==="wind"?"Vento zonale ensemble · 10 hPa · 60°N":s.kind==="ensemble"&&s.chart==="temperature"?"Temperatura ensemble · 10 hPa · media 55–65°N":s.chart==="temperature"?"Temperatura a 10 hPa · media 55–65°N":s.chart==="trend"?"Ultimi "+s.runCount+" run archiviati · U60":s.chart==="season"?"Serie U60 · analisi e previsioni":"Vento zonale medio · 60°N · 10 hPa";
    $("#strength-subtitle").textContent=s.chart==="hindcast"?"Fascia: 10°–90° dei membri hindcast ECMWF 2006–2025, con inizializzazioni vicine a questa data dell’anno. La media ENS operativa è mostrata soltanto fino alla sua ultima scadenza disponibile; la climatologia non è una previsione a 46 giorni.":s.kind==="ensemble"&&s.chart==="wind"?"Linea: media dei membri. Fascia: percentili 10°–90°. La tabella riporta separatamente la quota grezza dei membri con U60<0; non è una probabilità calibrata di SSW.":s.kind==="ensemble"&&s.chart==="temperature"?"Media della temperatura a 10 hPa tra 55° e 65°N. Linea: media dei membri; fascia: percentili 10°–90°. Mostriamo solo i modelli che forniscono i campi necessari.":s.chart==="temperature"?"Temperatura media tra 55° e 65°N a 10 hPa. Sono mostrate solo le previsioni effettivamente disponibili.":s.chart==="trend"?"Confronto delle ultime emissioni archiviate: ogni curva è un run distinto. Le differenze mostrano come è cambiata la previsione.":s.chart==="season"?"Serie temporale disponibile: analisi archiviate e previsioni fino a circa 15 giorni. Non rappresenta l’intera stagione; la linea dello zero separa venti occidentali e orientali.":"Vento zonale medio a 60°N e 10 hPa. Sopra lo zero soffiano venti occidentali; sotto lo zero, venti orientali.";
    if(s.chart==="season"){
      const n=Object.keys(s.data.analysis||{}).length,fc=modelSeries(which,"u10").reduce((sum,a)=>sum+a.points.length,0),latest=Math.max(0,...which.flatMap(k=>(s.data.models?.[k]?.series||[]).map(p=>Number(p.leadHours)||0)));
      $("#strength-subtitle").textContent+=" Archivio: "+n+" analisi; run disponibile fino a +"+Math.round(latest/24)+" giorni; "+fc+" punti di previsione. Non è disponibile un’indicazione affidabile per l’intera stagione.";
    }
    let avail=which.filter(k=>s.data.sources?.[k]?.available&&s.data.models?.[k]?.series?.length);$("#strength-freshness").textContent=s.chart==="hindcast"?(s.data.hindcast?.available?"Hindcast ECMWF IFS · "+s.data.hindcast.firstYear+"–"+s.data.hindcast.lastYear+" · "+s.data.hindcast.initSamples+" inizializzazioni stagionali · aggiornato "+dateTime(s.data.hindcast.generatedAt):"Climatologia hindcast ECMWF non disponibile nel feed."):s.kind==="ensemble"&&s.chart==="wind"&&ensembleWindSeries(which).length?which.map(k=>{let f=s.data.probabilities?.[k];return f?.series?.length?names[k]+" · "+dateTime(f.run)+" · "+f.series.length+" scadenze":""}).filter(Boolean).join(" | ")+" · GEFS ai lead campionati.":avail.map(k=>names[k]+" · "+runDescription(k,s.data.sources[k].init)).join(" | ")||(s.kind==="ensemble"?"Nessun membro ensemble utilizzabile per questa selezione.":"Serie non disponibile per "+which.map(k=>names[k]||k).join(", ")+". Il feed del modello non contiene campioni utilizzabili in questa modalità.");
    let wave=which.map(k=>({name:names[k],color:colors[k],points:(s.data.models[k]?.series||[]).filter(p=>num(p.heatFlux100)!==null).map(p=>({x:p.valid,y:num(p.heatFlux100)}))})).filter(x=>x.points.length);
    if(wave.length){chart($("#wave-chart"),wave,"K·m/s",false);$("#wave-legend").innerHTML=wave.map(x=>'<span class="leg"><i class="line-swatch" style="--c:'+x.color+'"></i>'+x.name+'</span>').join("")}
    else {$("#wave-chart").innerHTML='<div class="chart-empty compact"><div><strong>Flusso non disponibile</strong>'+(s.kind==="ensemble"?"Il feed dei membri selezionato non include ancora una serie di vento e temperatura a 100 hPa per calcolare v′T′.":"Nei run selezionati mancano i campi necessari per calcolare v′T′ a 100 hPa.")+'</div></div>';$("#wave-legend").innerHTML=""}
  }
  const mapImageCache=new Map();let mapRenderVersion=0;
  function preloadMapImage(url){
    if(!mapImageCache.has(url)){
      const promise=new Promise((resolve,reject)=>{const image=new Image();let settled=false;const ready=async()=>{if(settled)return;settled=true;try{if(image.decode)await image.decode()}catch{}resolve(image)};image.onload=ready;image.onerror=()=>{if(!settled){settled=true;reject(new Error("Impossibile caricare la carta"))}};image.src=url;if(image.complete&&image.naturalWidth)ready()});
      mapImageCache.set(url,promise);if(mapImageCache.size>10)mapImageCache.delete(mapImageCache.keys().next().value);promise.catch(()=>mapImageCache.delete(url));
    }
    return mapImageCache.get(url);
  }
  async function renderMaps(){
    if(!s.data)return;$$('[data-level]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.level===s.level)));$$('[data-field]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.field===s.mapField)));let sel=$("#map-model").value,which=sel==="compare"?["ecmwf_ifs","gfs","aifs"]:[sel];
    const slider=$("#map-step"),maxLead=$("#map-model").value==="gfs"?384:360;slider.max=String(maxLead/12);if(Number(slider.value)>Number(slider.max))slider.value=slider.max;s.step=Number(slider.value); const ticks=$("#map-model").value==="gfs"?["Ora","Giorno 4","Giorno 8","Giorno 12","Giorno 16"]:["Ora","Giorno 3","Giorno 6","Giorno 9","Giorno 12","Giorno 15"]; $(".tickrow").innerHTML=ticks.map(label=>"<span>"+label+"</span>").join("");
    let step=Number(s.step)*12,levels=s.level==="both"?[10,50]:[Number(s.level)],imgs=[],missing=[];
    const fieldNames={vortex:"struttura del vortice",temp:"anomalia di temperatura",height:"anomalia di geopotenziale",wind:"vento zonale"};
    const shortDate=v=>new Intl.DateTimeFormat("it-IT",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit",timeZone:"UTC"}).format(new Date(v))+" UTC";
    // In comparison mode align maps by valid time rather than lead hour: model
    // runs can start at different cycles. Never present mismatched valid times
    // as a simultaneous comparison.
    const anchorModel=s.data.models?.ecmwf_ifs, targetValid=sel==="compare"&&anchorModel?.init
      ? Date.parse(anchorModel.init)+step*3600000 : null;
    which.forEach(k=>levels.forEach(l=>{
      const model=s.data.models?.[k],source=s.data.sources?.[k]||{};
      let modelStep=step;
      if(sel==="compare"&&targetValid!=null&&model?.init){
        const hours=(targetValid-Date.parse(model.init))/3600000;
        modelStep=Number.isInteger(hours/12)?hours:-1;
      }
      const url=modelStep>=0?model?.maps?.[String(l)]?.[String(modelStep)]?.[s.mapField]:null;
      if(url){let valid=new Date(Date.parse(model.init)+modelStep*3600000).toISOString();imgs.push({k:k,l:l,url:url,run:model.init,valid:valid,step:modelStep,status:source.status,expectedInit:source.expectedInit})}
      else missing.push((names[k]||k)+" · "+l+" hPa"+(sel==="compare"?" · validità comune non disponibile":""));
    }));
    let validLead=imgs[0]?.valid||null;
    const leadText=step===0?"Analisi":step<48?"+"+step+" h":"+"+(step/24)+" giorni";
    const timing=step===0?"nell’analisi":"nella previsione";
    const captions={temp:"Scarto della temperatura dalla media mensile NOAA PSL 1991–2020, in °C. Blu = più freddo della media; giallo/rosso = più mite. Scala fissa −30…+30 °C.",height:"Scarto del geopotenziale dalla media NOAA PSL 1991–2020, in metri. Blu = altezze più basse; giallo/rosso = più alte. Le linee nere sono il geopotenziale "+timing+" (intervallo 500 m). Scala fissa −1200…+1200 m.",vortex:"Temperatura assoluta "+timing+" (°C; scala fissa per quota: 10 hPa −80…+10 °C, 50 hPa −80…−20 °C). Viola/blu = più freddo; giallo/rosso = più mite. Le linee nere sono il geopotenziale (intervallo 500 m).",wind:"Vento zonale "+timing+", in m/s. Viola/blu = vento orientale (valori negativi); bianco = vicino a zero; verde/giallo/rosso = vento occidentale (valori positivi). Scala fissa −60…+60 m/s."};
    const sourceLine=missing.length?"Carte non disponibili per: "+missing.map(item=>{const k=Object.keys(names).find(key=>item.startsWith(names[key]));const error=k&&s.data.sources?.[k]?.error;return item+(error?" ("+error+")":"")}).join(", ")+". Il feed del run selezionato non contiene il campo, il livello o la scadenza richiesta.":"";
    const missingMarkup=sourceLine?`<p class="map-missing" role="status">${sourceLine}</p>`:"";
    const unavailableMarkup=`<div class="map-placeholder"><div><strong>Carta non disponibile</strong><span>Per ${fieldNames[s.mapField]} a ${levels.join(" e ")} hPa · +${step} ore il feed selezionato non contiene dati. Prova un’altra quota, scadenza o modello.</span></div></div>`;
    let display=$("#map-display");const signature=imgs.map(a=>a.k+":"+a.l).join("|");
    const renderVersion=++mapRenderVersion;
    if(!imgs.length){display.className="map-placeholder";display.innerHTML=unavailableMarkup;display.dataset.mapSignature="";display.removeAttribute("aria-busy");$("#map-caption").textContent=captions[s.mapField]||"";$("#map-step-label").textContent=leadText+" · validità non disponibile";$("#map-freshness").textContent="Nessuna carta disponibile per la selezione corrente.";return}
    const replaceStage=display.dataset.mapSignature!==signature;
    let grid;
    if(replaceStage){
      // Prepare a complete replacement while the previous maps stay visible.
      // Swapping an empty grid first caused a conspicuous blank flash on every
      // model or pressure-level change.
      const nextStage=document.createElement("div");nextStage.className="map-stage";nextStage.dataset.mapSignature=signature;
      nextStage.innerHTML='<div class="map-grid" data-map-grid></div><div data-map-missing></div>';
      grid=nextStage.querySelector("[data-map-grid]");
      imgs.forEach(a=>{const figure=document.createElement("figure");figure.className="map-figure";figure.dataset.mapKey=a.k+":"+a.l;figure.innerHTML='<a target="_blank" rel="noopener"><div class="map-image-frame"><img decoding="async"></div></a><figcaption></figcaption>';grid.append(figure)});
      display.setAttribute("aria-busy","true");
    } else grid=display.querySelector("[data-map-grid]");
    display.setAttribute("aria-busy","true");$("#map-freshness").textContent="Caricamento della carta · "+leadText+"…";
    const loaded=await Promise.allSettled(imgs.map(a=>preloadMapImage(a.url)));
    if(renderVersion!==mapRenderVersion)return;
    imgs.forEach((a,i)=>{
      const figure=grid.querySelector(`[data-map-key="${a.k}:${a.l}"]`),result=loaded[i];if(!figure)return;
      if(result.status!=="fulfilled"){figure.classList.add("map-frame-error");figure.querySelector("figcaption").textContent="Carta non caricabile · "+(names[a.k]||a.k)+" · "+a.l+" hPa";return}
      const image=figure.querySelector("img"),link=figure.querySelector("a");
      if(image.src!==result.value.src)image.src=result.value.src;
      image.alt="Carta di "+fieldNames[s.mapField]+" · "+(names[a.k]||a.k)+" · "+a.l+" hPa · validità "+shortDate(a.valid);
      link.href=a.url;link.setAttribute("aria-label","Apri a piena risoluzione: "+fieldNames[s.mapField]+", "+(names[a.k]||a.k)+", "+a.l+" hPa");
      figure.classList.remove("map-frame-error");
      figure.querySelector("figcaption").innerHTML="<b>"+(names[a.k]||a.k)+" · "+a.l+" hPa</b><br>Run "+shortDate(a.run)+" · validità "+shortDate(a.valid)+" · "+(a.step===0?"analisi":"previsione +"+a.step+" ore")+(a.status==="stale"?" · run precedente; atteso "+shortDate(a.expectedInit):"")+" · <a href=\""+a.url+"\" target=\"_blank\" rel=\"noopener\">Apri carta a piena risoluzione</a>";
    });
    const missingNode=replaceStage?grid.parentElement.querySelector("[data-map-missing]"):display.querySelector("[data-map-missing]");
    if(missingNode)missingNode.innerHTML=missingMarkup;
    if(replaceStage){const nextStage=grid.parentElement;display.replaceWith(nextStage);display=nextStage}
    display.removeAttribute("aria-busy");
    $("#map-step-label").textContent=leadText+" · "+(validLead?shortDate(validLead):"validità non disponibile");
    $("#map-freshness").textContent="Run visualizzato: "+imgs.map(a=>(names[a.k]||a.k)+" "+shortDate(a.run)+(a.status==="stale"?" (run precedente; atteso "+shortDate(a.expectedInit)+")":"")).join(" · ")+". Scadenza "+(validLead?shortDate(validLead):"non disponibile")+(step===0?" · analisi":" · previsione");
    $("#map-caption").textContent=(imgs.length?imgs.length+" carte · ":"")+(captions[s.mapField]||"")+(sourceLine?" "+sourceLine:"");
  }
  function renderVertical(){
    if(!s.data)return;
    const key=s.vmodel==="gfs"?"gfs":s.vmodel==="aifs"?"aifs":"ecmwf_ifs",model=s.data.models?.[key],scale=$('[data-vscale][aria-pressed="true"]')?.dataset.vscale||"anomaly",prefix=s.vfield==="wind"?"u":s.vfield==="temperature"?"t":"z",all=[1,2,3,5,7,10,15,20,30,50,70,100,150,200,300,500,700,850,925,1000];
    $$('[data-vmodel]').forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.vmodel===s.vmodel)));
    $$('[data-vfield]').forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.vfield===s.vfield)));
    $$('[data-vscale]').forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.vscale===scale)));
    let rows=(model?.series||[]).filter(r=>Number.isFinite(Date.parse(r.valid))).slice().sort((a,b)=>Date.parse(a.valid)-Date.parse(b.valid));
    const valueKey=l=>scale==="raw"?prefix+l:prefix+l+(scale==="sigma"?"sigma":"anom");
    const levels=all.filter(l=>(scale==="raw"||l>=10)&&rows.some(r=>num(r[valueKey(l)])!==null));
    const values=rows.flatMap(r=>levels.map(l=>num(r[valueKey(l)])).filter(v=>v!==null));
    const fieldName={wind:"Vento zonale medio",temperature:"Temperatura",height:"Altezza geopotenziale"}[s.vfield];
    const unit=scale==="sigma"?"σ":s.vfield==="wind"?"m/s":s.vfield==="temperature"?"°C":"m";
    const scaleName={raw:"Valore effettivo",anomaly:"Anomalia",sigma:"Anomalia standardizzata"}[scale];
    const modelName={ecmwf_ifs:"ECMWF IFS",gfs:"GFS",aifs:"AIFS"}[key];
    $("#vertical-title").textContent=fieldName+" · " +modelName+" · "+scaleName;
    if(!values.length||rows.length<2||levels.length<2){$("#vertical-description").textContent="Run "+(model?.init?dateTime(model.init):"non disponibile")+" · dati verticali insufficienti per disegnare il profilo.";$("#vertical-chart").innerHTML='<div class="chart-empty compact"><div><strong>Profilo non disponibile</strong>Il feed selezionato non contiene almeno due scadenze e due livelli di pressione per questo campo.</div></div>';return}
    const fixed=scale==="sigma"?5:scale==="anomaly"?(s.vfield==="height"?700:s.vfield==="temperature"?10:25):s.vfield==="wind"?null:s.vfield==="temperature"?null: null;
    let lo,hi;
    if(scale!=="raw"){lo=-fixed;hi=fixed}
    else if(s.vfield==="wind"){lo=-20;hi=80}
    else if(s.vfield==="temperature"){lo=-100;hi=30}
    else {lo=0;hi=50000}
    const palette=scale==="raw"&&s.vfield==="wind"
      ?[[-20,[73,14,91]],[-10,[40,94,192]],[0,[248,250,252]],[5,[25,183,122]],[15,[132,207,63]],[25,[248,220,58]],[40,[255,134,35]],[60,[192,29,35]],[80,[221,78,169]]]
      :scale==="raw"&&s.vfield==="height"
        ?[[0,[21,82,143]],[10000,[44,142,177]],[20000,[190,211,129]],[30000,[250,196,92]],[40000,[222,91,43]],[50000,[134,18,42]]]
        :scale==="sigma"
          ?[[-5,[49,21,90]],[-3,[33,101,192]],[-1,[167,211,237]],[0,[250,250,246]],[1,[255,228,112]],[3,[235,97,42]],[5,[137,8,37]]]
      :scale==="raw"&&s.vfield==="temperature"
        ?[[-100,[35,53,143]],[-70,[40,125,194]],[-40,[108,190,224]],[-20,[220,241,247]],[-5,[250,250,247]],[0,[255,247,210]],[10,[255,190,86]],[20,[230,73,37]],[30,[125,10,48]]]
      :s.vfield==="height"
            ?[[-700,[23,78,157]],[-400,[69,159,209]],[-100,[194,225,236]],[0,[250,250,247]],[100,[255,232,160]],[350,[250,166,86]],[700,[182,27,29]]]
            :[[-Math.abs(lo),[31,88,168]],[-Math.abs(lo)*.5,[106,178,222]],[0,[250,250,247]],[Math.abs(hi)*.35,[255,208,117]],[Math.abs(hi)*.7,[245,104,58]],[Math.abs(hi),[159,12,38]]];
    const colorAt=v=>{let t=Math.max(lo,Math.min(hi,v)),i=palette.findIndex(p=>t<=p[0]);if(i<=0)return palette[0][1];if(i<0)return palette.at(-1)[1];const [a,ca]=palette[i-1],[b,cb]=palette[i],f=(t-a)/(b-a||1);return ca.map((c,j)=>Math.round(c+(cb[j]-c)*f))};
    const W=1280,H=670,L=92,R=94,T=48,B=128,PW=W-L-R,PH=H-T-B,minP=Math.min(...levels),maxP=Math.max(...levels),times=rows.map(r=>Date.parse(r.valid)),t0=times[0],t1=times.at(-1);
    const xTime=t=>L+(t-t0)/(t1-t0||1)*PW, yPressure=p=>T+Math.log(p/minP)/Math.log(maxP/minP)*PH;
    const rowAt=(r,p)=>{const pts=levels.map(l=>({p:l,v:num(r[valueKey(l)])})).filter(x=>x.v!==null);if(!pts.length||p<pts[0].p||p>pts.at(-1).p)return null;for(let i=1;i<pts.length;i++){if(p<=pts[i].p){const a=pts[i-1],b=pts[i],f=Math.log(p/a.p)/Math.log(b.p/a.p);return a.v+(b.v-a.v)*f}}return pts.at(-1).v};
    const sample=(time,p)=>{let i=times.findIndex(t=>t>=time);if(i<0)i=times.length-1;if(i===0)return rowAt(rows[0],p);const a=times[i-1],b=times[i];if(b-a>48*3600000)return null;const va=rowAt(rows[i-1],p),vb=rowAt(rows[i],p);if(va===null||vb===null)return null;const f=(time-a)/(b-a||1);return va+(vb-va)*f};
    const container=$("#vertical-chart");container.innerHTML='<canvas id="vertical-canvas" role="img" aria-label="'+fieldName+' in sezione verticale: pressione in hPa a sinistra, quota approssimata in km a destra, tempo UTC da sinistra a destra."></canvas><div class="chart-tooltip" hidden></div>';container.classList.add("vertical-box");container.style.position="relative";
    const canvas=$("#vertical-canvas"),dpr=Math.min(2,window.devicePixelRatio||1);canvas.width=W*dpr;canvas.height=H*dpr;canvas.style.width="100%";canvas.style.height="auto";const ctx=canvas.getContext("2d");ctx.scale(dpr,dpr);ctx.fillStyle="#fff";ctx.fillRect(0,0,W,H);
    const image=ctx.createImageData(PW,PH);for(let py=0;py<PH;py++){const p=minP*Math.pow(maxP/minP,py/(PH-1));for(let px=0;px<PW;px++){const t=t0+(t1-t0)*px/(PW-1),v=sample(t,p);if(v===null)continue;const c=colorAt(v),n=(py*PW+px)*4;image.data[n]=c[0];image.data[n+1]=c[1];image.data[n+2]=c[2];image.data[n+3]=255}}ctx.putImageData(image,L,T);
    ctx.save();ctx.beginPath();ctx.rect(L,T,PW,PH);ctx.clip();
    const interval=scale==="sigma"?.5:scale==="raw"?(s.vfield==="wind"?10:s.vfield==="temperature"?10:2500):(s.vfield==="wind"?5:s.vfield==="temperature"?2:100),contourStart=Math.ceil(lo/interval)*interval;
    ctx.lineWidth=.7;ctx.strokeStyle="rgba(24,49,67,.30)";
    for(let level=contourStart;level<=hi;level+=interval){for(let i=0;i<rows.length-1;i++){if(times[i+1]-times[i]>48*3600000)continue;for(let j=0;j<levels.length-1;j++){const v=[num(rows[i][valueKey(levels[j])]),num(rows[i+1][valueKey(levels[j])]),num(rows[i+1][valueKey(levels[j+1])]),num(rows[i][valueKey(levels[j+1])])];if(v.some(a=>a===null))continue;const points=[[xTime(times[i]),yPressure(levels[j])],[xTime(times[i+1]),yPressure(levels[j])],[xTime(times[i+1]),yPressure(levels[j+1])],[xTime(times[i]),yPressure(levels[j+1])]],cross=[];for(let e=0;e<4;e++){const n=(e+1)%4;if((v[e]<level&&v[n]>=level)||(v[e]>=level&&v[n]<level)){const f=(level-v[e])/(v[n]-v[e]||1);cross.push([points[e][0]+(points[n][0]-points[e][0])*f,points[e][1]+(points[n][1]-points[e][1])*f])}}for(let q=0;q+1<cross.length;q+=2){ctx.beginPath();ctx.moveTo(...cross[q]);ctx.lineTo(...cross[q+1]);ctx.stroke()}}}}
    ctx.restore();
    ctx.font="12px Inter, Segoe UI, sans-serif";ctx.fillStyle="#536c7f";ctx.strokeStyle="#d8e1e8";ctx.lineWidth=1;
    const pressureTicks=[1,2,3,5,7,10,20,30,50,70,100,150,200,300,500,700,850,925,1000].filter(p=>p>=minP&&p<=maxP);
    pressureTicks.forEach(p=>{const y=yPressure(p);ctx.beginPath();ctx.moveTo(L,y);ctx.lineTo(L+PW,y);ctx.stroke();ctx.textAlign="right";ctx.fillText(String(p),L-12,y+4)});
    ctx.strokeStyle="#687f8f";ctx.beginPath();ctx.moveTo(L,T);ctx.lineTo(L,T+PH);ctx.lineTo(L+PW,T+PH);ctx.lineTo(L+PW,T);ctx.stroke();
    for(let i=0;i<=5;i++){const t=t0+(t1-t0)*i/5,x=L+PW*i/5;ctx.strokeStyle="#e5ebef";ctx.beginPath();ctx.moveTo(x,T);ctx.lineTo(x,T+PH);ctx.stroke();ctx.textAlign=i===0?"left":i===5?"right":"center";ctx.fillStyle="#536c7f";ctx.fillText(date(new Date(t).toISOString())+" UTC",x,H-B+26)}
    const topKm=Math.round(44.3*(1-Math.pow(minP/1013.25,.1903))),altitudeTicks=[...new Set([0,8,16,24,32,40,48,topKm])].sort((a,b)=>a-b);altitudeTicks.forEach(km=>{const p=km===topKm?minP:1013.25*Math.pow(Math.max(.001,1-km/44.3),1/.1903);if(p>=minP&&p<=maxP){const y=yPressure(p);ctx.textAlign="left";ctx.fillStyle="#536c7f";ctx.fillText(km+" km",L+PW+12,y+4)}});
    ctx.save();ctx.translate(22,T+PH/2);ctx.rotate(-Math.PI/2);ctx.textAlign="center";ctx.fillStyle="#17354e";ctx.font="600 13px Inter, Segoe UI,sans-serif";ctx.fillText("Pressione (hPa)",0,0);ctx.restore();
    ctx.save();ctx.translate(W-18,T+PH/2);ctx.rotate(Math.PI/2);ctx.textAlign="center";ctx.fillStyle="#617b90";ctx.font="12px Inter, Segoe UI,sans-serif";ctx.fillText("Quota approssimata (km)",0,0);ctx.restore();
    const zeroX=xTime(times[0]);ctx.save();ctx.strokeStyle="#c42d42";ctx.setLineDash([6,5]);ctx.beginPath();ctx.moveTo(zeroX,T);ctx.lineTo(zeroX,T+PH);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle="#c42d42";ctx.font="700 10px Inter, Segoe UI,sans-serif";ctx.textAlign="left";ctx.fillText("INIZIO RUN",Math.min(zeroX+6,L+PW-70),T-12);ctx.restore();
    const gx=L+PW*.2,gy=H-48,gw=PW*.6,gh=12,grad=ctx.createLinearGradient(gx,0,gx+gw,0);palette.forEach(([v,c])=>grad.addColorStop(Math.max(0,Math.min(1,(v-lo)/(hi-lo))),"rgb("+c.join(",")+")"));ctx.fillStyle=grad;ctx.fillRect(gx,gy,gw,gh);ctx.strokeStyle="#aab9c4";ctx.strokeRect(gx,gy,gw,gh);
    for(let i=0;i<=4;i++){const v=lo+(hi-lo)*i/4,x=gx+gw*i/4;ctx.fillStyle="#536c7f";ctx.textAlign=i===0?"left":i===4?"right":"center";ctx.font="11px Inter, Segoe UI,sans-serif";ctx.fillText(fmt(v)+(scale==="sigma"?"σ":""),x,gy+28)}
    ctx.fillStyle="#17354e";ctx.textAlign="center";ctx.font="700 12px Inter, Segoe UI,sans-serif";ctx.fillText(fieldName+" · "+scaleName+" · "+unit,gx+gw/2,gy+52);
    const run=model?.init?dateTime(model.init):"run non disponibile",topLevel=minP+" hPa ("+topKm+" km circa)";
    $("#vertical-description").textContent=modelName+" · run "+run+" · copertura fino a "+topLevel+" · scala logaritmica. Gli intervalli senza colore indicano dati mancanti: non interpoliamo oltre 48 ore.";
    const tooltip=container.querySelector(".chart-tooltip");canvas.addEventListener("pointermove",e=>{const box=canvas.getBoundingClientRect(),x=(e.clientX-box.left)/box.width*W,y=(e.clientY-box.top)/box.height*H;if(x<L||x>L+PW||y<T||y>T+PH){tooltip.hidden=true;return}const time=t0+(t1-t0)*(x-L)/PW,p=minP*Math.pow(maxP/minP,(y-T)/PH),v=sample(time,p);if(v===null){tooltip.hidden=true;return}tooltip.textContent=fieldName+" · "+fmt(v)+" "+unit+" · "+fmt(p)+" hPa · "+Math.round(44.3*(1-Math.pow(p/1013.25,.1903)))+" km · "+dateTime(new Date(time).toISOString());tooltip.style.left=Math.min(65,Math.max(4,(x/W*100)))+"%";tooltip.hidden=false});canvas.addEventListener("pointerleave",()=>tooltip.hidden=true);
  }
  function renderAccuracy(){
    let period=$('[data-period][aria-pressed="true"]')?.dataset.period||"30d",model=$('[data-amodel][aria-pressed="true"]')?.dataset.amodel||"ecmwf",kind=$('[data-atype][aria-pressed="true"]')?.dataset.atype||"single",groups=model==="gfs"?["gfs","gefs"]:model==="aifs"?["aifs","aifs_ens"]:["ecmwf_ifs","ecmwf_ens"];
    if(kind==="single")groups=groups.filter(k=>!k.endsWith("_ens")&&k!=="gefs");else groups=groups.filter(k=>k.endsWith("_ens")||k==="gefs");
    let entries=groups.map(k=>[k,s.data?.verification?.[k]?.[period]]).filter(x=>x[1]);if(!entries.length){let runs=groups.reduce((n,k)=>n+Object.keys(s.data?.archive?.[k]||{}).length,0),obs=Object.keys(s.data?.analysis||{}).length;$("#accuracy-chart").innerHTML='<div class="chart-empty compact"><div><strong>Verifica non ancora calcolabile</strong>Per questo modello e periodo non ci sono previsioni e analisi abbinate alla stessa scadenza. Archivio attuale: '+runs+' run e '+obs+' analisi; i punteggi compariranno quando le scadenze previste saranno osservabili.</div></div>';return}
    $("#accuracy-chart").innerHTML='<div class="mobile-scroll"><table style="width:100%;border-collapse:collapse"><thead><tr><th style="text-align:left">Modello</th><th>Campioni</th><th>Bias</th><th>MAE</th><th>RMSE</th></tr></thead><tbody>'+entries.map(([k,v])=>'<tr><td>'+ (names[k]||k)+'</td><td>'+v.n+'</td><td>'+fmt(v.biasMs)+'</td><td>'+fmt(v.maeMs)+'</td><td>'+fmt(v.rmseMs)+'</td></tr>').join("")+'</tbody></table></div><p style="font-size:11px;color:var(--muted)">Verifica di U60 contro l’analisi operativa IFS · '+(period==="30d"?"ultimi 30 giorni":"archivio stagionale")+'; punteggi accumulati dall’attivazione.</p><div id="verification-plot" style="min-height:220px"></div>';
    let availableLeads=[240,168,336].filter(h=>entries.some(([,v])=>(v.samples||[]).some(p=>p.leadHours===h))),lead=availableLeads[0];
    if(lead){let forecastSeries=entries.map(([k,v])=>({name:(names[k]||k)+" · previsione +"+Math.round(lead/24)+"g",color:colors[k]||"#0876ad",points:(v.samples||[]).filter(p=>p.leadHours===lead).map(p=>({x:p.valid,y:p.forecast}))})).filter(x=>x.points.length),analysisPoints=[...new Map(entries.flatMap(([,v])=>(v.samples||[]).filter(p=>p.leadHours===lead).map(p=>[p.valid,{x:p.valid,y:p.analysis}]))).values()];if(analysisPoints.length)forecastSeries.unshift({name:"Analisi IFS",color:"#20384b",points:analysisPoints});chart($("#verification-plot"),forecastSeries,"m/s",true,{title:"Confronto in raccolta",message:"Non ci sono ancora abbastanza scadenze verificate per tracciare una serie."})}
    else {const plot=$("#verification-plot");if(plot)plot.outerHTML='<div class="chart-empty compact"><div><strong>Confronto in raccolta</strong>Non sono ancora disponibili scadenze comuni sufficienti per il grafico.</div></div>'}
  }
  function render(){renderStrength();renderMaps();renderVertical();renderAccuracy()}
  function renderNextRefresh(){
    const now=new Date(),slots=[2,8,14,20].map(hour=>{const d=new Date(now);d.setUTCHours(hour,17,0,0);if(d<=now)d.setUTCDate(d.getUTCDate()+1);return d}).sort((a,b)=>a-b),next=slots[0],mins=Math.max(0,Math.ceil((next-now)/60000)),hours=Math.floor(mins/60),rest=mins%60;
    const local=new Intl.DateTimeFormat("it-IT",{weekday:"short",day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit",timeZone:"Europe/Rome"}).format(next);
    $("#next-refresh").textContent="Prossimo controllo automatico previsto tra "+(hours?hours+" h ":"")+rest+" min ("+local+")";
  }
  async function load(){
    try{
      let r=await fetch("/data/dashboard.json",{cache:"no-store"});if(!r.ok)throw new Error("Feed non pronto");s.data=await r.json();
      let available=Object.entries(s.data.sources||{}).filter(([,source])=>source.init);
      const runItems=available.map(([key,source])=>"<strong>"+(names[key]||key)+(key.endsWith("_ens")||key==="gefs"?" · serie media":"")+" "+dateTime(source.init)+(source.status==="stale"?" · run atteso "+dateTime(source.expectedInit):!source.available?" · serie non disponibile":"")+"</strong>");
      ["ecmwf_ens","aifs_ens","gefs"].forEach(key=>{const memberRun=s.data.probabilities?.[key]?.run;if(memberRun){runItems.push("<strong>"+(names[key]||key)+" · membri "+dateTime(memberRun)+(s.data.sources?.[key]?.expectedInit&&Date.parse(memberRun)<Date.parse(s.data.sources[key].expectedInit)?" · ciclo atteso "+dateTime(s.data.sources[key].expectedInit):"")+"</strong>")}});
      $("#runline").innerHTML=runItems.join(" · ");
      const update=s.data.updateStatus||{};
      const stale=Object.entries(s.data.sources||{}).filter(([,source])=>source.status!=="current");
      if(!update.state){
        $("#feed-status").textContent="Stato dell’ultimo aggiornamento non incluso nel feed: impossibile confermare che tutti i modelli siano aggiornati.";
        $("#updated").textContent="Feed generato "+new Date(s.data.generatedAt).toLocaleString("it-IT",{timeZone:"UTC"})+" UTC · stato non verificabile";
      } else if(update.state==="partial"||stale.length){
        const detail=stale.map(([key,source])=>(names[key]||key)+(key.endsWith("_ens")||key==="gefs"?" (serie media)":"")+": "+(source.error||(source.status==="stale"?"run precedente mantenuto":"dati non disponibili"))).join(" · ");
        $("#feed-status").textContent="Aggiornamento parziale · serie utilizzabili per "+(update.currentModels??available.filter(([,source])=>source.available).length)+"/"+(update.modelCount??6)+" modelli. "+(detail||"Alcuni feed sono incompleti.");
        $("#feed-status").setAttribute("role","status");
        $("#updated").textContent="Feed elaborato "+new Date(s.data.generatedAt).toLocaleString("it-IT",{timeZone:"UTC"})+" UTC · serie non tutte disponibili";
      } else {
        $("#feed-status").textContent="Aggiornamento completato · serie utilizzabili per "+(update.currentModels??available.filter(([,source])=>source.available).length)+"/"+(update.modelCount??6)+" modelli. Run e validità sono indicati nelle viste.";
        $("#updated").textContent="Aggiornato "+new Date(s.data.generatedAt).toLocaleString("it-IT",{timeZone:"UTC"})+" UTC";
      }
      const feedAgeHours=(Date.now()-Date.parse(s.data.generatedAt))/3600000;
      if(Number.isFinite(feedAgeHours)&&feedAgeHours>9){
        const age=Math.floor(feedAgeHours)+" h";
        $("#feed-status").textContent="Feed non aggiornato da "+age+". I dati visibili sono quelli dell’ultima elaborazione ("+new Date(s.data.generatedAt).toLocaleString("it-IT",{timeZone:"UTC"})+" UTC); il nuovo controllo automatico non risulta ancora completato.";
        $("#updated").textContent="Feed fermo da "+age+" · ultimo aggiornamento "+new Date(s.data.generatedAt).toLocaleString("it-IT",{timeZone:"UTC"})+" UTC";
        $("#runline .live-dot")?.classList.add("stale");
      }else{
        $("#runline .live-dot")?.classList.remove("stale");
      }
      $("#credits").textContent='Fonti: ECMWF Open Data · ECMWF IFS S2S hindcast via Planette Open Data (CC BY 4.0) · NOAA/NCEP · NOAA PSL.';
      let primary=s.data.models?.ecmwf_ifs?.series||[],now=primary.find(x=>Number(x.leadHours)===0),future=primary.find(x=>Number(x.leadHours)===240&&x.u10!=null);
      if(now?.u10!=null){$("#wind-state").textContent=now.u10<0?"Venti orientali":"Venti occidentali";let normal=now.u10anom==null?null:now.u10-num(now.u10anom);$("#wind-value").textContent=fmt(now.u10)+" m/s · media climatica 1991–2020 "+fmt(normal)+" m/s · "+date(now.valid);$("#wind-meter").style.setProperty("--pos",Math.max(0,Math.min(100,(now.u10+10)/50*100))+"%")}
      if(future?.u10!=null){$("#forecast-state").textContent=future.u10<0?"Venti orientali previsti":"Venti occidentali previsti";$("#forecast-value").textContent=fmt(future.u10)+" m/s · 60°N · validità "+date(future.valid)+" · run ECMWF IFS deterministico"}
      else {$("#forecast-state").textContent="Scadenza non disponibile";$("#forecast-value").textContent="Il run ECMWF IFS non contiene il valore a +240 ore."}
      let heat=primary.find(x=>x.heatFlux100!=null);if(heat){$("#wave-state").textContent=heat.heatFlux100>=0?"Flusso verso il polo":"Flusso verso l’equatore";$("#wave-value").textContent=fmt(heat.heatFlux100)+" K·m/s · v′T′ a 100 hPa · "+date(heat.valid)+" · ECMWF IFS"}
      let probRows=[];
      const rowNames={ecmwf_ens:"ECMWF ENS",aifs_ens:"AIFS ENS",gefs:"GEFS"};
      Object.keys(rowNames).forEach(k=>(s.data.probabilities?.[k]?.rows||[]).forEach(row=>probRows.push({k,row})));
      const pct=r=>r.rawShare==null?"—":Math.round(r.rawShare*100)+"%";
      let at14=probRows.filter(x=>Number(x.row.leadHours)===336&&x.row.rawShare!=null);
      $("#ssw-state").textContent=at14.length?at14.map(x=>x.row.membersBelowZero+"/"+x.row.members).join(" · ")+" sotto zero a +14 giorni":"Campione ensemble non disponibile";
      $("#ssw-value").textContent=at14.map(x=>rowNames[x.k]+": "+x.row.membersBelowZero+" membri su "+x.row.members+" ("+pct(x.row)+") a +14 giorni; run "+date(s.data.probabilities[x.k].run)).join(" · ")||"Nessun membro valido disponibile per la scadenza +14 giorni.";
      if(probRows.length){
        const leads=[168,240,288,336],models=[...new Set(probRows.map(x=>x.k))],cell=(k,lead)=>{const x=probRows.find(item=>item.k===k&&Number(item.row.leadHours)===lead);return !x||!x.row.members?'<span title="Nessun membro valido acquisito per questo lead">n/d</span>':x.row.membersBelowZero+'/'+x.row.members+' · '+pct(x.row)};
        const missing=models.filter(k=>{const rows=probRows.filter(x=>x.k===k);return !rows.some(x=>x.row.members>0)}).map(k=>{const source=s.data.sources?.[k],feed=s.data.probabilities?.[k];return rowNames[k]+': nessun membro valido acquisito'+(feed?.run?' nell’ultimo campione ('+ensembleRunDescription(k,feed.run)+')':'')+(source?.status==='stale'?' · feed in ritardo':'')}).join(' · ');
        $("#odds-table").innerHTML='<div class="mobile-scroll"><table class="prob-table" style="width:100%;border-collapse:collapse"><thead><tr><th style="text-align:left">Ensemble</th>'+leads.map(lead=>'<th>+'+Math.round(lead/24)+' g</th>').join('')+'</tr></thead><tbody>'+models.map(k=>'<tr><td>'+rowNames[k]+'</td>'+leads.map(lead=>'<td>'+cell(k,lead)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div><small style="display:block;margin-top:7px;color:var(--muted)">U60&lt;0 indica vento orientale a 60°N e 10 hPa. Quota grezza dei membri disponibili, non probabilità calibrata di SSW.</small>'+(missing?'<small style="display:block;margin-top:6px;color:#a64b16">'+missing+'. Percentuali non calcolabili: nessun valore sostitutivo viene stimato.</small>':'');
      } else {$("#odds-table").innerHTML='<div class="chart-empty" style="min-height:100px"><div><strong>Feed ensemble non ancora disponibile</strong>Non mostriamo percentuali finché il modello non fornisce membri utilizzabili.</div></div>'}
      renderStatusSummary();
      render();
    }catch(e){$("#feed-status").textContent=s.data?"Impossibile aggiornare il feed: restano visibili i dati già caricati.":"Feed non disponibile: il primo aggiornamento dipende dall’esecuzione della pipeline."}
  }
  $$("[data-model]").forEach(b=>b.addEventListener("click",()=>{s.model=b.dataset.model;renderStrength();renderVertical()}));
  $$("[data-view]").forEach(b=>b.addEventListener("click",()=>{$$("[data-view]").forEach(x=>x.setAttribute("aria-selected",String(x===b)));$$(".view-section").forEach(x=>x.classList.toggle("hidden",x.id!=="view-"+b.dataset.view));if(b.dataset.view==="maps")renderMaps();if(b.dataset.view==="vertical")renderVertical();if(b.dataset.view==="accuracy")renderAccuracy()}));
  $$("[data-forecast]").forEach(b=>b.addEventListener("click",()=>{s.kind=b.dataset.forecast;renderStrength()}));
  $$("[data-chart]").forEach(b=>b.addEventListener("click",()=>{s.chart=b.dataset.chart;renderStrength()}));
  $("#map-model")?.addEventListener("change",renderMaps);
  $$("[data-level]").forEach(b=>b.addEventListener("click",()=>{s.level=b.dataset.level;renderMaps()}));
  $$("[data-field]").forEach(b=>b.addEventListener("click",()=>{s.mapField=b.dataset.field;renderMaps()}));
  const shiftMapStep=delta=>{let r=$("#map-step");r.value=Math.max(Number(r.min),Math.min(Number(r.max),Number(r.value)+delta));r.dispatchEvent(new Event("input"))};
  $("#map-step")?.addEventListener("input",e=>{s.step=Number(e.target.value);renderMaps()});
  $("#map-prev")?.addEventListener("click",()=>shiftMapStep(-1));
  $("#map-next")?.addEventListener("click",()=>shiftMapStep(1));
  $("#map-display")?.addEventListener("keydown",e=>{if(e.key==="ArrowLeft"){e.preventDefault();shiftMapStep(-1)}else if(e.key==="ArrowRight"){e.preventDefault();shiftMapStep(1)}});
  $("#map-play")?.addEventListener("click",async()=>{const b=$("#map-play");if(b.dataset.playing==="true"){b.dataset.playing="false";clearTimeout(Number(b.dataset.timer));delete b.dataset.timer;b.textContent="▶";b.setAttribute("aria-label","Avvia animazione");b.setAttribute("aria-pressed","false");return}b.dataset.playing="true";b.textContent="Ⅱ";b.setAttribute("aria-label","Metti in pausa l’animazione");b.setAttribute("aria-pressed","true");const play=async()=>{if(b.dataset.playing!=="true")return;const r=$("#map-step");r.value=(Number(r.value)+1)%(Number(r.max)+1);await renderMaps();if(b.dataset.playing==="true")b.dataset.timer=String(setTimeout(play,1100))};b.dataset.timer=String(setTimeout(play,100))});
  $$("[data-vfield]").forEach(b=>b.addEventListener("click",()=>{s.vfield=b.dataset.vfield;renderVertical()}));
  $$("[data-vscale]").forEach(b=>b.addEventListener("click",()=>{ $$("[data-vscale]").forEach(x=>x.setAttribute("aria-pressed",String(x===b)));renderVertical()}));
  $$('[data-vmodel]').forEach(b=>b.addEventListener("click",()=>{s.vmodel=b.dataset.vmodel;renderVertical()}));
  $$('[data-period],[data-amodel],[data-atype]').forEach(b=>b.addEventListener("click",()=>{let group=b.matches("[data-period]")?"data-period":b.matches("[data-amodel]")?"data-amodel":"data-atype";$$("["+group+"]").forEach(x=>x.setAttribute("aria-pressed",String(x===b)));renderAccuracy()}));
  $$('[data-run-count]').forEach(b=>b.addEventListener("click",()=>{$$('[data-run-count]').forEach(x=>x.setAttribute("aria-pressed",String(x===b)));s.runCount=Number(b.dataset.runCount);renderStrength()}));
  $("#refresh")?.addEventListener("click",load);
  renderNextRefresh();setInterval(renderNextRefresh,60*1000);load();setInterval(load,15*60*1000);
})();
