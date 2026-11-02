(() => {
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const colors = {ecmwf_ifs:"#0876ad",ecmwf_ens:"#55a6d5",aifs:"#7446a8",aifs_ens:"#ad8ac8",gfs:"#d17b17",gefs:"#1a8a5d"};
  const palette = colors;
  const names = {ecmwf_ifs:"ECMWF IFS",ecmwf_ens:"ECMWF ENS",aifs:"AIFS",aifs_ens:"AIFS ENS",gfs:"GFS",gefs:"GEFS"};
  const s = {data:null,model:"ecmwf",kind:"single",chart:"wind",mapField:"vortex",level:"10",step:0,vfield:"wind",runCount:12};
  const num = v => v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null;
  const fmt = v => v == null ? "—" : Number(v).toLocaleString("it-IT",{maximumFractionDigits:1,minimumFractionDigits:1});
  const date = v => new Intl.DateTimeFormat("it-IT",{day:"2-digit",month:"short",timeZone:"UTC"}).format(new Date(v));
  const dateTime = v => new Intl.DateTimeFormat("it-IT",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit",timeZone:"UTC"}).format(new Date(v))+" UTC";
  function keys() {
    let a = s.model === "compare" ? Object.keys(s.data.models||{}) : s.model === "gfs" ? ["gfs","gefs"] : s.model === "aifs" ? ["aifs","aifs_ens"] : ["ecmwf_ifs","ecmwf_ens"];
    return a.filter(k => s.kind === "ensemble" ? k.endsWith("_ens") || k === "gefs" : !(k.endsWith("_ens") || k === "gefs"));
  }
  function chart(container, series, unit, zero, empty={}) {
    let pts = series.flatMap(x=>x.points).filter(p=>num(p.y)!==null && Number.isFinite(Date.parse(p.x)));
    const distinctTimes=new Set(pts.map(p=>Date.parse(p.x)));
    if (distinctTimes.size<2) { container.innerHTML='<div class="chart-empty compact"><div><strong>'+(empty.title||"Serie non ancora disponibile")+'</strong>'+(empty.message||"Il feed non contiene ancora almeno due scadenze valide per tracciare un andamento.")+'</div></div>';if(container.id==="strength-chart")$("#strength-legend").innerHTML="";return; }
    let c=document.createElement("canvas"), w=1200,h=420,dpr=Math.min(2,window.devicePixelRatio||1);
    c.width=w*dpr;c.height=h*dpr;c.style.width="100%";c.style.height="auto";c.tabIndex=0;c.setAttribute("role","img");c.setAttribute("aria-label","Grafico interattivo, valori in "+unit+". Passa il puntatore o seleziona il grafico per leggere i dati.");container.innerHTML="";container.style.position="relative";container.appendChild(c);
    let x=c.getContext("2d");x.scale(dpr,dpr);let m={l:78,r:24,t:24,b:48}, vals=pts.map(p=>+p.y),lo=Math.min(...vals,zero?0:Infinity),hi=Math.max(...vals,zero?0:-Infinity),pad=(hi-lo||1)*.12;lo-=pad;hi+=pad;
    let tx=pts.map(p=>Date.parse(p.x)),x0=Math.min(...tx),x1=Math.max(...tx);if(x1===x0)x1=x0+24*3600000;
    let X=v=>m.l+(Date.parse(v)-x0)/(x1-x0)*(w-m.l-m.r),Y=v=>m.t+(hi-v)/(hi-lo)*(h-m.t-m.b);
    x.font="13px Segoe UI";x.strokeStyle="#e5edf3";x.fillStyle="#617b90";x.lineWidth=1;
    const decimals=unit==="°C"?1:0;
    for(let i=0;i<=5;i++){let y=m.t+i*(h-m.t-m.b)/5,v=hi-i*(hi-lo)/5;x.beginPath();x.moveTo(m.l,y);x.lineTo(w-m.r,y);x.stroke();x.textAlign="right";x.fillText(v.toFixed(decimals),m.l-12,y+4)}
    x.textAlign="left";
    if(zero&&lo<0&&hi>0){x.strokeStyle="#1c3548";x.beginPath();x.moveTo(m.l,Y(0));x.lineTo(w-m.r,Y(0));x.stroke()}
    series.forEach(a=>{
      const p=a.points.filter(q=>num(q.y)!==null&&Number.isFinite(Date.parse(q.x))).sort((q,r)=>Date.parse(q.x)-Date.parse(r.x));
      if(!p.length)return;x.strokeStyle=a.color;x.lineWidth=a.name==="Analisi IFS archiviata"?3.5:2.8;x.lineJoin="round";x.lineCap="round";x.setLineDash(a.dash?[7,5]:[]);let segment=[];
      const flush=()=>{if(segment.length>1){x.beginPath();segment.forEach((q,i)=>i?x.lineTo(X(q.x),Y(q.y)):x.moveTo(X(q.x),Y(q.y)));x.stroke()}segment=[]};
      p.forEach((q,i)=>{if(i&&Date.parse(q.x)-Date.parse(p[i-1].x)>36*3600000)flush();segment.push(q)});flush();x.setLineDash([]);
      if(a.markers!==false)p.forEach(q=>{x.beginPath();x.fillStyle=a.color;x.arc(X(q.x),Y(q.y),2.6,0,Math.PI*2);x.fill()});
    });
    const rangeHours=(x1-x0)/3600000;
    for(let i=0;i<5;i++){let d=new Date(x0+(x1-x0)*i/4);x.fillStyle="#617b90";x.textAlign=i===0?"left":i===4?"right":"center";x.fillText(rangeHours<48?dateTime(d.toISOString()):date(d.toISOString()),m.l+i*(w-m.l-m.r)/4,h-12)}
    x.save();x.translate(17,h/2);x.rotate(-Math.PI/2);x.textAlign="center";x.fillStyle="#17354e";x.fillText(unit,h/2,0);x.restore();x.textAlign="left";
    let legend=$("#strength-legend");if(legend&&container.id==="strength-chart"){let unique=[...new Map(series.map(a=>[a.name,a])).values()];legend.innerHTML=unique.map(a=>'<span class="leg"><i class="'+(a.dash?'dash-swatch':'line-swatch')+'" style="--c:'+a.color+'"></i>'+a.name+'</span>').join("")}
    let tooltip=document.createElement("div");tooltip.className="chart-tooltip";tooltip.setAttribute("role","status");tooltip.hidden=true;container.appendChild(tooltip);
    const showPoint=event=>{const rect=c.getBoundingClientRect(),px=(event.clientX-rect.left)*w/rect.width,py=(event.clientY-rect.top)*h/rect.height;let best=null;series.forEach(a=>a.points.forEach(q=>{if(num(q.y)===null)return;let dx=X(q.x)-px,dy=Y(q.y)-py,d=dx*dx+dy*dy;if(!best||d<best.d)best={a,q,d,dx}}));if(!best||best.d>45*45){tooltip.hidden=true;return}tooltip.textContent=best.a.name+" · "+dateTime(best.q.x)+" · "+fmt(best.q.y)+" "+unit;tooltip.style.left=Math.min(72,Math.max(3,px/w*100))+"%";tooltip.hidden=false};
    c.addEventListener("pointermove",showPoint);c.addEventListener("pointerleave",()=>{tooltip.hidden=true});c.addEventListener("focus",()=>{const q=pts[0];if(q){tooltip.textContent=dateTime(q.x)+" · "+fmt(q.y)+" "+unit;tooltip.style.left="3%";tooltip.hidden=false}});c.addEventListener("blur",()=>{tooltip.hidden=true});
    container.setAttribute("aria-label","Grafico interattivo "+unit);
  }
  function modelSeries(which,field) {
    return which.filter(k=>s.data.models?.[k]?.series?.length).map(k=>({name:names[k]||k,color:colors[k],points:s.data.models[k].series.map(p=>({x:p.valid,y:num(p[field])})).filter(p=>p.y!==null)}));
  }
  function ensembleWindSeries(which) {
    return which.flatMap(k=>{
      const feed=s.data.probabilities?.[k],run=Date.parse(feed?.run||"");
      const points=(feed?.rows||[]).filter(r=>num(r.rawShare)!==null&&Number.isFinite(run)).map(r=>({x:new Date(run+Number(r.leadHours)*3600000).toISOString(),y:100*Number(r.rawShare)}));
      return points.length? [{name:(names[k]||k)+" · membri con U60<0",color:colors[k]||"#0876ad",points}]:[];
    });
  }
  function renderStatusSummary(){
    if(!s.data)return;
    const order=["ecmwf_ifs","aifs","gfs","ecmwf_ens","aifs_ens","gefs"];
    const renderRows=(id,rows,empty)=>{$("#"+id).innerHTML=rows.length?rows.map(r=>'<div class="status-row"><b>'+r.label+'</b><span>'+r.value+'<small>'+r.note+'</small></span></div>').join(""):'<div class="status-note">'+empty+'</div>'};
    const starts=order.flatMap(k=>{const model=s.data.models?.[k],p=model?.series?.find(x=>Number(x.leadHours)===0&&num(x.u10)!==null);if(!p)return[];const source=s.data.sources?.[k]||{};return[{key:k,p,model,source}]});
    const initial=starts.map(({key,p,model,source})=>({label:names[key],value:fmt(p.u10)+" m/s",note:(key.endsWith("_ens")||key==="gefs"?"media ensemble":"run singolo")+" · valida "+dateTime(p.valid)+" · run "+dateTime(model.init)+(source.status==="stale"?" · run precedente":"")}));
    renderRows("status-initial-models",initial,"Nessun valore iniziale disponibile nei run selezionati.");
    const reference=starts.find(x=>x.key==="ecmwf_ifs")||starts[0];
    if(reference){const normal=num(reference.p.u10normal);$("#wind-state").textContent=reference.p.u10<0?"Venti orientali":"Venti occidentali";$("#wind-value").textContent=fmt(reference.p.u10)+" m/s"+(normal===null?"":" · normale 1991–2020 "+fmt(normal)+" m/s")+" · "+names[reference.key];$("#wind-meter").style.setProperty("--pos",Math.max(0,Math.min(100,(reference.p.u10+10)/50*100))+"%")}else{$("#wind-state").textContent="Valore non disponibile"}
    const future=order.flatMap(k=>{const model=s.data.models?.[k],p=model?.series?.find(x=>Number(x.leadHours)===240&&num(x.u10)!==null);return p?[{key:k,p,model}]:[]});
    renderRows("status-forecast-models",future.map(({key,p,model})=>({label:names[key],value:fmt(p.u10)+" m/s",note:(key.endsWith("_ens")||key==="gefs"?"media ensemble":"run singolo")+" · valida "+dateTime(p.valid)+" · run "+dateTime(model.init)})),"Nessun modello ha fornito U60 a +240 ore.");
    $("#forecast-state").textContent=future.length?future.length+" modelli disponibili":"Dato non disponibile";
    $("#forecast-value").textContent="U60 a 10 hPa e 60°N alla scadenza +240 ore; valori confrontabili solo alla stessa validità.";
    const probs=["ecmwf_ens","aifs_ens","gefs"].flatMap(k=>{const source=s.data.probabilities?.[k],row=source?.rows?.find(x=>Number(x.leadHours)===336);return row?[{key:k,row,source}]:[]});
    renderRows("status-ensemble-models",probs.map(({key,row,source})=>({label:names[key],value:row.members?row.membersBelowZero+" / "+row.members+" · "+(row.rawShare==null?"—":Math.round(row.rawShare*100)+"%"):"nessun membro",note:"U60<0 a +14 giorni · run "+dateTime(source.run)})),"Campione +14 giorni non disponibile nei feed ensemble.");
    $("#ssw-state").textContent=probs.length?probs.map(({row})=>row.members?Math.round((row.rawShare||0)*100)+"%":"—").join(" · "):"Campione non disponibile";
    $("#ssw-value").textContent=probs.length?probs.map(({key,row})=>names[key]+": "+(row.members?row.membersBelowZero+" membri su "+row.members:"nessun membro")+" a +14 giorni").join(" · "):"Non viene stimata una probabilità di SSW senza membri utilizzabili.";
    const waves=order.flatMap(k=>{const model=s.data.models?.[k],p=model?.series?.find(x=>Number(x.leadHours)===0&&num(x.heatFlux100)!==null)||model?.series?.find(x=>num(x.heatFlux100)!==null);return p?[{key:k,p,model}]:[]});
    renderRows("status-wave-models",waves.map(({key,p,model})=>({label:names[key],value:fmt(p.heatFlux100)+" K·m/s",note:"valida "+dateTime(p.valid)+" · run "+dateTime(model.init)})),"Campi vento e temperatura a 100 hPa non disponibili.");
    $("#wave-state").textContent=waves.length?waves.length+" modelli con campi validi":"Flusso non disponibile";
    $("#wave-value").textContent="v′T′, media 45–75°N; il segno positivo indica trasporto medio verso il polo.";
  }
  function renderStrength() {
    if(!s.data)return;let which=keys(),field=s.chart==="temperature"?"t10":"u10";
    $$('[data-model]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.model===s.model)));
    $$('[data-forecast]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.forecast===s.kind)));
    $$('[data-chart]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.chart===s.chart)));
    if(s.kind==="ensemble"&&s.chart==="wind"){
      const probabilitySeries=ensembleWindSeries(which);
      chart($("#strength-chart"),probabilitySeries,"% membri",true,{title:"Conteggio ensemble non disponibile",message:"Nessun membro con U60 valido è disponibile per le scadenze mostrate."});
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
      chart($("#strength-chart"),[{name:"Analisi IFS archiviata",color:"#17354e",points:observed},...forecasts,{name:"Normale mensile 1991–2020",color:"#77838d",dash:true,markers:false,points:normal}],"m/s",true,{title:"Serie stagionale in raccolta",message:"L’andamento diventerà leggibile quando l’archivio conterrà più scadenze osservate e previste."});
    }
    else {
      const forecasts=modelSeries(which,field),observed=Object.entries(s.data.analysis||{}).map(([x,y])=>({x,y:num(y)})).filter(p=>p.y!==null).sort((a,b)=>Date.parse(a.x)-Date.parse(b.x));
      const normalField=s.chart==="temperature"?"t10normal":"u10normal",normal=which.flatMap(k=>(s.data.models?.[k]?.series||[]).filter(p=>num(p[normalField])!==null).map(p=>({x:p.valid,y:num(p[normalField])})));
      const references=s.chart==="wind"?[{name:"Analisi IFS archiviata",color:"#17354e",points:observed},{name:"Normale mensile 1991–2020",color:"#77838d",dash:true,markers:false,points:normal}]:[{name:"Normale mensile 1991–2020",color:"#77838d",dash:true,markers:false,points:normal}];
      const empty=s.kind==="ensemble"?{title:"Serie dei membri non disponibile",message:"I feed ensemble forniscono i conteggi della tabella, ma non una sequenza temporale dei singoli membri per questo grafico."}:{title:"Previsione non disponibile",message:"Il modello non ha ancora fornito almeno due scadenze valide per questa variabile."};
      chart($("#strength-chart"),forecasts.length?[...references,...forecasts]:[],s.chart==="temperature"?"°C":"m/s",s.chart!=="temperature",empty);
    }
    $("#strength-title").textContent=s.kind==="ensemble"&&s.chart==="wind"?"Membri con U60 negativo · 10 hPa · 60°N":s.chart==="temperature"?"Temperatura a 10 hPa · media 55–65°N":s.chart==="trend"?"Ultimi "+s.runCount+" run archiviati · U60":s.chart==="season"?"Andamento stagionale · U60 a 10 hPa":"Vento zonale medio · 60°N · 10 hPa";
    $("#strength-subtitle").textContent=s.kind==="ensemble"&&s.chart==="wind"?"Quota grezza dei membri con vento zonale orientale (U60<0) ai lead +7, +10, +12 e +14 giorni. È una frazione del campione, non una probabilità calibrata di SSW.":s.chart==="temperature"?"Temperatura media tra 55° e 65°N a 10 hPa. Sono mostrate solo le previsioni effettivamente disponibili.":s.chart==="trend"?"Confronto delle ultime emissioni archiviate: ogni curva è un run distinto. Le differenze mostrano come è cambiata la previsione.":s.chart==="season"?"Analisi osservata e run selezionati. La linea dello zero separa venti occidentali e orientali; le curve ensemble appaiono soltanto quando il feed fornisce una serie utilizzabile.":"Vento zonale medio a 60°N e 10 hPa. Sopra lo zero soffiano venti occidentali; sotto lo zero, venti orientali.";
    if(s.chart==="season"){
      const n=Object.keys(s.data.analysis||{}).length,fc=modelSeries(which,"u10").reduce((sum,a)=>sum+a.points.length,0),latest=Math.max(0,...which.flatMap(k=>(s.data.models?.[k]?.series||[]).map(p=>Number(p.leadHours)||0)));
      $("#strength-subtitle").textContent+=" Archivio: "+n+" analisi; run disponibile fino a +"+Math.round(latest/24)+" giorni; "+fc+" punti di previsione. Non è disponibile un’indicazione affidabile per l’intera stagione.";
    }
    let avail=which.filter(k=>s.data.sources?.[k]?.available&&s.data.models?.[k]?.series?.length);$("#strength-freshness").textContent=s.kind==="ensemble"&&s.chart==="wind"&&ensembleWindSeries(which).length?"Conteggi membri disponibili ai lead +7, +10, +12 e +14 giorni · dati grezzi del feed ensemble.":avail.map(k=>names[k]+" · run "+s.data.sources[k].init).join(" | ")||(s.kind==="ensemble"?"Il feed "+which.map(k=>names[k]||k).join(", ")+" non fornisce una serie media utilizzabile a 10 hPa. Il vento ensemble usa i conteggi dei membri quando disponibili.":"Serie non disponibile per "+which.map(k=>names[k]||k).join(", ")+". Il feed del modello non contiene campioni utilizzabili in questa modalità.");
    let wave=which.map(k=>({name:names[k],color:colors[k],points:(s.data.models[k]?.series||[]).filter(p=>num(p.heatFlux100)!==null).map(p=>({x:p.valid,y:num(p.heatFlux100)}))})).filter(x=>x.points.length);
    if(wave.length){chart($("#wave-chart"),wave,"K·m/s",false);$("#wave-legend").innerHTML=wave.map(x=>'<span class="leg"><i class="line-swatch" style="--c:'+x.color+'"></i>'+x.name+'</span>').join("")}
    else {$("#wave-chart").innerHTML='<div class="chart-empty compact"><div><strong>Flusso non disponibile</strong>'+(s.kind==="ensemble"?"Il feed dei membri selezionato non include ancora una serie di vento e temperatura a 100 hPa per calcolare v′T′.":"Nei run selezionati mancano i campi necessari per calcolare v′T′ a 100 hPa.")+'</div></div>';$("#wave-legend").innerHTML=""}
  }
  function renderMaps(){
    if(!s.data)return;$$('[data-level]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.level===s.level)));$$('[data-field]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.field===s.mapField)));let sel=$("#map-model").value,which=sel==="compare"?Object.keys(s.data.models||{}):[sel];
    let step=Number(s.step)*48,levels=s.level==="both"?[10,50]:[Number(s.level)],imgs=[],missing=[];
    const fieldNames={vortex:"struttura del vortice",temp:"anomalia di temperatura",height:"anomalia di geopotenziale",wind:"vento zonale"};
    const shortDate=v=>new Intl.DateTimeFormat("it-IT",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit",timeZone:"UTC"}).format(new Date(v))+" UTC";
    which.forEach(k=>levels.forEach(l=>{let model=s.data.models?.[k],url=model?.maps?.[String(l)]?.[String(step)]?.[s.mapField];if(url){let valid=new Date(Date.parse(model.init)+step*3600000).toISOString();imgs.push({k:k,l:l,url:url,run:model.init,valid:valid,status:s.data.sources?.[k]?.status})}else missing.push((names[k]||k)+" · "+l+" hPa")}));
    let validLead=imgs[0]?.valid||null;
    $("#map-step-label").textContent=step===0?"Analisi · "+(validLead?shortDate(validLead):"validità non disponibile"):"+"+(step/24)+" giorni · "+(validLead?shortDate(validLead):"validità non disponibile");
    $("#map-freshness").textContent=imgs.length?"Run visualizzato: "+imgs.map(a=>(names[a.k]||a.k)+" "+shortDate(a.run)).join(" · ")+". Scadenza "+(validLead?shortDate(validLead):"non disponibile")+(step===0?" · analisi":" · previsione")+(imgs.some(a=>a.status==="stale")?" · run precedente mantenuto":""):"Nessuna carta disponibile per la selezione corrente.";
    const timing=step===0?"nell’analisi":"nella previsione";
    const captions={temp:"I colori mostrano lo scarto della temperatura dalla media mensile NOAA PSL 1991–2020, in °C. Rosso = aria più mite della media; blu = più fredda.",height:"I colori mostrano lo scarto dell’altezza geopotenziale dalla media NOAA PSL 1991–2020, in metri. Le linee sono il geopotenziale "+timing+", in metri.",vortex:"I colori mostrano la temperatura "+timing+", in °C; le linee uniscono punti con uguale altezza geopotenziale "+timing+", in metri. Insieme descrivono forma e posizione del vortice.",wind:"Il colore indica il vento zonale "+timing+", in m/s: valori positivi corrispondono a venti occidentali, valori negativi a venti orientali."};
    const sourceLine=missing.length?"Carte non disponibili per: "+missing.map(item=>{const k=Object.keys(names).find(key=>item.startsWith(names[key]));const error=k&&s.data.sources?.[k]?.error;return item+(error?" ("+error+")":"")}).join(", ")+". Il feed del run selezionato non contiene il campo, il livello o la scadenza richiesta.":"";
    const mapMarkup=imgs.map(a=>`<figure class="map-figure" style="margin:0 0 14px"><a href="${a.url}" target="_blank" rel="noopener" aria-label="Apri a piena risoluzione: ${fieldNames[s.mapField]}, ${names[a.k]||a.k}, ${a.l} hPa"><img src="${a.url}" alt="Carta di ${fieldNames[s.mapField]} · ${names[a.k]||a.k} · ${a.l} hPa · validità ${shortDate(a.valid)}"></a><figcaption style="padding:10px 12px;font-size:12px;color:var(--muted);line-height:1.55"><b>${names[a.k]||a.k} · ${a.l} hPa</b><br>Run ${shortDate(a.run)} · validità ${shortDate(a.valid)} · ${step===0?"analisi":"previsione +"+step+" ore"}${a.status==="stale"?" · run precedente mantenuto":""} · <a href="${a.url}" target="_blank" rel="noopener">Apri carta a piena risoluzione</a></figcaption></figure>`).join("");
    const missingMarkup=sourceLine?`<p class="map-missing" role="status">${sourceLine}</p>`:"";
    const unavailableMarkup=`<div class="map-placeholder"><div><strong>Carta non disponibile</strong><span>Per ${fieldNames[s.mapField]} a ${levels.join(" e ")} hPa · +${step} ore il feed selezionato non contiene dati. Prova un’altra quota, scadenza o modello.</span></div></div>`;
    $("#map-display").innerHTML=imgs.length?mapMarkup+missingMarkup:unavailableMarkup;
    $("#map-caption").textContent=(imgs.length?imgs.length+" carte · ":"")+(captions[s.mapField]||"")+(sourceLine?" "+sourceLine:"");
  }
  function renderVertical(){
    if(!s.data)return;let k=s.model==="gfs"?"gfs":s.model==="aifs"?"aifs":"ecmwf_ifs",rows=s.data.models?.[k]?.series||[],scale=$('[data-vscale][aria-pressed="true"]')?.dataset.vscale||"anomaly",allLevels=[1,2,3,5,7,10,15,20,30,50,70,100,150,200,300,500,700,850,925,1000],prefix=s.vfield==="wind"?"u":s.vfield==="temperature"?"t":"z",suffix=scale==="sigma"?"sigma":"anom",valkey=l=>scale==="raw"?prefix+l:prefix+l+suffix,levels=allLevels.filter(l=>(scale==="raw"&&k==="gfs")||l>=10).filter(l=>rows.some(r=>num(r[valkey(l)])!==null)),vals=rows.flatMap(r=>levels.map(l=>num(r[valkey(l)])).filter(v=>v!==null));
    if(!vals.length){$("#vertical-chart").innerHTML='<div class="chart-empty compact"><div><strong>Sezione non disponibile</strong>Livelli verticali non presenti nel run selezionato.</div></div>';return}
    let W=1000,H=Math.max(600,levels.length*29+170),left=82,top=25,cw=(W-left-18)/Math.max(rows.length,1),ch=(H-top-145)/levels.length;
    let lo=Math.min(...vals),hi=Math.max(...vals);
    if(scale==="sigma"){lo=-3;hi=3}
    else if(scale==="anomaly"){let extent=s.vfield==="height"?1500:s.vfield==="temperature"?25:25;lo=-extent;hi=extent}
    else if(lo===hi){lo-=1;hi+=1}
    const colorFor=v=>{let q=scale==="raw"?Math.max(0,Math.min(1,(v-lo)/(hi-lo||1))):Math.max(-1,Math.min(1,v/Math.max(Math.abs(lo),Math.abs(hi))));if(scale==="raw"){let a=[40,125,195],b=[204,60,48];return 'rgb('+a.map((n,i)=>Math.round(n+(b[i]-n)*q)).join(',')+')'}let a=[248,250,252],b=q<0?[27,105,190]:[203,55,44];return 'rgb('+a.map((n,i)=>Math.round(n+(b[i]-n)*Math.abs(q))).join(',')+')'};
    let html='<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Sezione verticale: pressione crescente dall’alto verso il basso, tempo da sinistra a destra">';
    rows.forEach((r,j)=>levels.forEach((l,i)=>{let v=num(r[valkey(l)]);if(v===null)return;let color=colorFor(v);html+='<rect x="'+(left+j*cw)+'" y="'+(top+i*ch)+'" width="'+(cw+1)+'" height="'+(ch+1)+'" fill="'+color+'"><title>'+l+' hPa · '+date(r.valid)+' · '+fmt(v)+(scale==="raw"?(s.vfield==="wind"?" m/s":s.vfield==="temperature"?" °C":" m"):scale==="sigma"?" deviazioni standard":" scarto dalla media")+'</title></rect>'}));
    levels.forEach((l,i)=>html+='<text class="axis" x="'+(left-8)+'" y="'+(top+(i+.7)*ch)+'" text-anchor="end">'+l+'</text>');
    let tickEvery=Math.max(1,Math.ceil(rows.length/6));rows.forEach((r,i)=>{if(i%tickEvery===0||i===rows.length-1)html+='<text class="axis" x="'+(left+i*cw+cw/2)+'" y="'+(H-102)+'" text-anchor="middle">'+date(r.valid)+'</text>'});
    const unit=scale==="raw"?(s.vfield==="wind"?"m/s":s.vfield==="temperature"?"°C":"m"):scale==="sigma"?"σ":"anomalia";
    const low=scale==="raw"?fmt(lo):scale==="sigma"?"−3σ":"−";
    const mid=scale==="raw"?fmt((lo+hi)/2):"0";
    const high=scale==="raw"?fmt(hi):scale==="sigma"?"+3σ":"+";
    html+='<defs><linearGradient id="vps-scale" x1="0" x2="1"><stop offset="0%" stop-color="#1b69be"/><stop offset="50%" stop-color="#f8fafc"/><stop offset="100%" stop-color="#cb372c"/></linearGradient></defs><rect x="'+left+'" y="'+(H-69)+'" width="260" height="11" rx="5" fill="url(#vps-scale)"/><text class="axis" x="'+left+'" y="'+(H-43)+'">'+low+'</text><text class="axis" x="'+(left+130)+'" y="'+(H-43)+'" text-anchor="middle">'+mid+'</text><text class="axis" x="'+(left+260)+'" y="'+(H-43)+'" text-anchor="end">'+high+'</text><text class="axis" x="'+(left+130)+'" y="'+(H-20)+'" text-anchor="middle">'+(scale==="raw"?"Valore effettivo · ":scale==="sigma"?"Scarto standardizzato · ":"Scarto dalla media · ")+unit+' · blu = valori più bassi, rosso = valori più alti</text><text class="axis" transform="translate(18 '+(H/2)+') rotate(-90)" text-anchor="middle">Pressione (hPa) · stratosfera in alto, superficie in basso</text></svg>';$("#vertical-chart").innerHTML=html;
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
      $("#runline").innerHTML=available.map(x=>"<strong>"+(names[x[0]]||x[0])+" "+dateTime(x[1].init)+(x[1].status==="stale"?" · run precedente":!x[1].available?" · serie non disponibile":"")+"</strong>").join(" · ");
      const update=s.data.updateStatus||{};
      const stale=Object.entries(s.data.sources||{}).filter(([,source])=>source.status!=="current");
      if(!update.state){
        $("#feed-status").textContent="Stato dell’ultimo aggiornamento non incluso nel feed: impossibile confermare che tutti i modelli siano aggiornati.";
        $("#updated").textContent="Feed generato "+new Date(s.data.generatedAt).toLocaleString("it-IT",{timeZone:"UTC"})+" UTC · stato non verificabile";
      } else if(update.state==="partial"||stale.length){
        const detail=stale.map(([key,source])=>(names[key]||key)+": "+(source.error||(source.status==="stale"?"run precedente mantenuto":"dati non disponibili"))).join(" · ");
        $("#feed-status").textContent="Aggiornamento parziale · serie utilizzabili per "+(update.currentModels??available.filter(([,source])=>source.available).length)+"/"+(update.modelCount??6)+" modelli. "+(detail||"Alcuni feed sono incompleti.");
        $("#feed-status").setAttribute("role","status");
        $("#updated").textContent="Feed elaborato "+new Date(s.data.generatedAt).toLocaleString("it-IT",{timeZone:"UTC"})+" UTC · serie non tutte disponibili";
      } else {
        $("#feed-status").textContent="Aggiornamento completato · serie utilizzabili per "+(update.currentModels??available.filter(([,source])=>source.available).length)+"/"+(update.modelCount??6)+" modelli. Run e validità sono indicati nelle viste.";
        $("#updated").textContent="Aggiornato "+new Date(s.data.generatedAt).toLocaleString("it-IT",{timeZone:"UTC"})+" UTC";
      }
      $("#credits").textContent='Fonti: ECMWF Open Data · NOAA/NCEP · NOAA PSL.';
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
        const cell=x=>x.row.members>0?x.row.membersBelowZero+" / "+x.row.members:"nessun membro disponibile";
        $("#odds-table").innerHTML='<div class="mobile-scroll"><table style="width:100%;border-collapse:collapse"><thead><tr><th style="text-align:left;padding:7px;border-bottom:1px solid var(--line)">Ensemble</th><th style="text-align:right;padding:7px;border-bottom:1px solid var(--line)">U60&lt;0 / membri</th><th style="text-align:right;padding:7px;border-bottom:1px solid var(--line)">Frazione</th><th style="text-align:right;padding:7px;border-bottom:1px solid var(--line)">Scadenza</th></tr></thead><tbody>'+probRows.map(x=>'<tr><td style="padding:7px;border-bottom:1px solid #edf2f5">'+rowNames[x.k]+'</td><td style="text-align:right;padding:7px;border-bottom:1px solid #edf2f5">'+cell(x)+'</td><td style="text-align:right;padding:7px;border-bottom:1px solid #edf2f5;font-weight:800">'+pct(x.row)+'</td><td style="text-align:right;padding:7px;border-bottom:1px solid #edf2f5">+'+Math.round(x.row.leadHours/24)+' giorni</td></tr>').join('')+'</tbody></table></div><small style="display:block;margin-top:7px;color:var(--muted)">U60 è il vento medio da ovest a est a 60°N e 10 hPa. U60&lt;0 indica vento orientale. La frazione descrive soltanto i membri disponibili a quella scadenza: non è una probabilità calibrata di SSW.</small>';
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
  $("#map-play")?.addEventListener("click",()=>{let b=$("#map-play");if(b.dataset.timer){clearInterval(Number(b.dataset.timer));delete b.dataset.timer;b.textContent="▶";b.setAttribute("aria-label","Avvia animazione");b.setAttribute("aria-pressed","false");return}b.textContent="Ⅱ";b.setAttribute("aria-label","Metti in pausa l’animazione");b.setAttribute("aria-pressed","true");b.dataset.timer=String(setInterval(()=>{let r=$("#map-step");r.value=(Number(r.value)+1)%8;r.dispatchEvent(new Event("input"))},1200))});
  $$("[data-vfield]").forEach(b=>b.addEventListener("click",()=>{s.vfield=b.dataset.vfield;renderVertical()}));
  $$("[data-vscale]").forEach(b=>b.addEventListener("click",()=>{ $$("[data-vscale]").forEach(x=>x.setAttribute("aria-pressed",String(x===b)));renderVertical()}));
  $$("[data-vmodel]").forEach(b=>b.addEventListener("click",()=>{s.model=b.dataset.vmodel;if(s.model==="gfs")$$("[data-vscale]").forEach(x=>x.setAttribute("aria-pressed",String(x.dataset.vscale==="raw")));else if($$('[data-vscale="raw"]').some(x=>x.getAttribute("aria-pressed")==="true"))$$("[data-vscale]").forEach(x=>x.setAttribute("aria-pressed",String(x.dataset.vscale==="anomaly")));$$("[data-vmodel]").forEach(x=>x.setAttribute("aria-pressed",String(x===b)));renderVertical()}));
  $$('[data-period],[data-amodel],[data-atype]').forEach(b=>b.addEventListener("click",()=>{let group=b.matches("[data-period]")?"data-period":b.matches("[data-amodel]")?"data-amodel":"data-atype";$$("["+group+"]").forEach(x=>x.setAttribute("aria-pressed",String(x===b)));renderAccuracy()}));
  $$('[data-run-count]').forEach(b=>b.addEventListener("click",()=>{$$('[data-run-count]').forEach(x=>x.setAttribute("aria-pressed",String(x===b)));s.runCount=Number(b.dataset.runCount);renderStrength()}));
  $("#refresh")?.addEventListener("click",load);
  renderNextRefresh();setInterval(renderNextRefresh,60*1000);load();setInterval(load,15*60*1000);
})();
