// Minimal, dependency-free dashboard. Populates an org dropdown from /v1/orgs
// (orgs we've actually received), then renders /v1/summary for the selected org.
// A real deployment points Grafana/Metabase at ClickHouse; this proves the read path.
export const DASHBOARD_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>heliograph</title>
<style>
  :root{--bg:#0f1216;--panel:#171b21;--line:#262c34;--fg:#e6e9ee;--muted:#8b94a3;--accent:#5b9dff}
  *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
  header{display:flex;gap:12px;align-items:center;padding:16px 24px;border-bottom:1px solid var(--line)}
  header h1{font-size:16px;margin:0;font-weight:600}header .sp{flex:1}
  select,button{background:var(--panel);color:var(--fg);border:1px solid var(--line);border-radius:8px;padding:8px 10px;font:inherit;max-width:420px}
  button{cursor:pointer}main{padding:24px;max-width:1100px;margin:0 auto}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px}
  .card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:16px}
  .kpi .v{font-size:26px;font-weight:650;letter-spacing:-.02em}.kpi .l{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.04em}
  h2{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin:34px 0 4px;border-bottom:1px solid var(--line);padding-bottom:6px}
  h3{font-size:12px;color:var(--muted);font-weight:500;margin:16px 0 8px}
  .cols{display:grid;grid-template-columns:1fr 1fr;gap:28px}@media(max-width:720px){.cols{grid-template-columns:1fr}}
  .row{display:flex;align-items:center;gap:10px;margin:6px 0}.row .lbl{width:150px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .row .barwrap{flex:1;background:#0c0f13;border-radius:6px;overflow:hidden}
  .bar{height:16px;background:var(--accent)}.row .val{width:120px;text-align:right;font-variant-numeric:tabular-nums}
  .muted{color:var(--muted)}
</style></head>
<body>
<header><h1>heliograph</h1><span class="sp"></span>
  <select id="org" aria-label="organization"></select><button id="reload">Reload</button></header>
<main>
  <div id="empty" class="muted" style="display:none">No telemetry yet — run Claude Code with telemetry enabled, then Reload.</div>
  <div class="grid" id="kpis"></div>

  <h2>Spend</h2>
  <div class="cols">
    <div><h3>Cost by day (USD)</h3><div id="costday"></div></div>
    <div><h3>Cost by model (USD)</h3><div id="costmodel"></div></div>
    <div><h3>Cost by source (main / subagent)</h3><div id="costsource"></div></div>
    <div><h3>Cost by effort (USD)</h3><div id="costeffort"></div></div>
    <div><h3>Top users by spend (USD)</h3><div id="costuser"></div></div>
    <div><h3>Tokens by type</h3><div id="tokens"></div></div>
  </div>

  <h2>Tools &amp; agents</h2>
  <div class="cols">
    <div><h3>Top tools (uses · success · latency)</h3><div id="tools"></div></div>
    <div><h3>Tool decisions (✓accept ✗reject ⛔block)</h3><div id="tooldec"></div></div>
    <div><h3>Subagents (uses · tokens)</h3><div id="subagents"></div></div>
    <div><h3>AI-authored lines</h3><div id="lines"></div></div>
  </div>

  <h2>When — activity by hour (UTC)</h2>
  <div id="hours"></div>

  <h2>Capabilities used</h2>
  <div class="cols">
    <div><h3>Skills</h3><div id="skills"></div></div>
    <div><h3>MCP servers</h3><div id="mcps"></div></div>
    <div><h3>Plugins</h3><div id="plugins"></div></div>
    <div><h3>Session starts</h3><div id="sessions"></div></div>
  </div>
</main>
<script>
const $=s=>document.querySelector(s);
const fmt=(n,d=0)=>Number(n).toLocaleString(undefined,{maximumFractionDigits:d});
// Compact token/count formatter: 1500 -> "1.5k", 12000000 -> "12M". Full count on hover.
const fmtTokens=n=>{n=Number(n);const a=Math.abs(n);
  for(const [d,s] of [[1e12,"T"],[1e9,"B"],[1e6,"M"],[1e3,"k"]]){
    // 0.9995*d threshold so a value that rounds up (e.g. 999999) promotes to the next unit.
    if(a>=d*0.9995){const v=n/d;return (v<9.995?v.toFixed(1).replace(/\\.0$/,""):String(Math.round(v)))+s;}
  }
  return String(Math.round(n));};
// Simple horizontal bars with a formatted right value.
function bars(el,data,label,value,fix=0,fmtFn=null){
  const f=fmtFn||(v=>fmt(v,fix));
  const max=Math.max(1,...data.map(value));
  el.innerHTML=data.length?data.map(r=>\`<div class="row"><div class="lbl" title="\${label(r)}">\${label(r)}</div>
    <div class="barwrap"><div class="bar" style="width:\${(value(r)/max*100).toFixed(1)}%"></div></div>
    <div class="val" title="\${fmt(value(r),fix)}">\${f(value(r))}</div></div>\`).join(""):'<div class="muted">no data</div>';
}
// Bars with custom right-hand text (uses/success/latency, decisions, etc.).
function rows(el,data,label,barVal,valText,valW=180){
  const max=Math.max(1,...data.map(barVal));
  el.innerHTML=data.length?data.map(d=>\`<div class="row"><div class="lbl" title="\${label(d)}">\${label(d)}</div>
    <div class="barwrap"><div class="bar" style="width:\${(barVal(d)/max*100).toFixed(1)}%"></div></div>
    <div class="val" style="width:\${valW}px">\${valText(d)}</div></div>\`).join(""):'<div class="muted">no data</div>';
}
async function loadOrgs(){
  const r=await fetch("/v1/orgs");
  const orgs=r.ok?await r.json():[];
  const sel=$("#org");
  if(!orgs.length){
    sel.innerHTML='<option value="">(no orgs yet)</option>';
    $("#empty").style.display="block";$("#kpis").innerHTML="";
    return;
  }
  $("#empty").style.display="none";
  sel.innerHTML=orgs.map(o=>\`<option value="\${o.orgId}">\${o.orgId}</option>\`).join("");
  loadSummary();
}
async function loadSummary(){
  const org=$("#org").value;
  if(!org) return;
  const r=await fetch("/v1/summary?org="+encodeURIComponent(org));
  if(!r.ok){$("#kpis").innerHTML='<div class="card muted">'+r.status+' '+await r.text()+'</div>';return;}
  const s=await r.json();
  const totalCost=s.cost.reduce((a,c)=>a+c.cost,0);
  const totalTokens=s.tokens.reduce((a,t)=>a+t.tokens,0);
  const totalLines=s.linesOfCode.reduce((a,x)=>a+x.lines,0);
  const acc=s.edits.accept+s.edits.reject;
  const errRate=s.reliability.apiRequests?100*s.reliability.apiErrors/s.reliability.apiRequests:0;
  const tok=Object.fromEntries(s.tokens.map(t=>[t.tokenType,t.tokens]));
  const cacheRead=tok.cacheRead||0, cacheCreation=tok.cacheCreation||0;
  const reuse=(cacheRead+cacheCreation)?100*cacheRead/(cacheRead+cacheCreation):0;
  const activeMin=s.activeTime.reduce((a,x)=>a+x.seconds,0)/60;
  const toolUses=s.tools.reduce((a,t)=>a+t.uses,0);
  const kpi=(l,v,t)=>\`<div class="card kpi"\${t?' title="'+t+'"':''}><div class="l">\${l}</div><div class="v">\${v}</div></div>\`;
  $("#kpis").innerHTML=[
    kpi("Cost (USD)","$"+fmt(totalCost,2)),
    kpi("Tokens",fmtTokens(totalTokens),fmt(totalTokens)+" tokens"),
    kpi("Active users",fmt(s.adoption.activeUsers)),
    kpi("Sessions",fmt(s.adoption.sessions)),
    kpi("Tool calls",fmtTokens(toolUses),fmt(toolUses)+" tool calls"),
    kpi("Subagent runs",fmt(s.subagents.reduce((a,x)=>a+x.uses,0))),
    kpi("Commits",fmt(s.commits)),
    kpi("Pull requests",fmt(s.pullRequests)),
    kpi("Lines of code",fmtTokens(totalLines),fmt(totalLines)+" lines"),
    kpi("Active minutes",fmt(activeMin,1)),
    kpi("Edit accept rate",acc?fmt(100*s.edits.accept/acc,0)+"%":"—"),
    kpi("Cache reuse",fmt(reuse,0)+"%","cacheRead / (cacheRead + cacheCreation)"),
    kpi("API error rate",fmt(errRate,1)+"%"),
  ].join("");
  // Spend
  bars($("#costday"),s.costByDay,r=>r.day,r=>r.cost,4);
  bars($("#costmodel"),s.cost,r=>r.model,r=>r.cost,4);
  bars($("#costsource"),s.costBySource,r=>r.source,r=>r.cost,4);
  bars($("#costeffort"),s.costByEffort,r=>r.effort,r=>r.cost,4);
  bars($("#costuser"),s.costByUser,r=>r.userHash.slice(0,10)+"…",r=>r.cost,4);
  bars($("#tokens"),s.tokens,r=>r.tokenType,r=>r.tokens,0,fmtTokens);
  // Tools & agents
  rows($("#tools"),s.tools,t=>t.tool,t=>t.uses,t=>\`\${fmt(t.uses)}× · \${fmt(t.successRate*100,0)}% · \${fmt(t.avgMs,0)}ms\`);
  rows($("#tooldec"),s.toolDecisions,t=>t.tool,t=>t.accept+t.reject+t.block,t=>\`\${t.accept}✓ \${t.reject}✗ \${t.block}⛔\`,150);
  rows($("#subagents"),s.subagents,a=>a.agentType,a=>a.uses,a=>\`\${fmt(a.uses)}× · \${fmtTokens(a.tokens)} tok\`);
  bars($("#lines"),s.linesOfCode,r=>r.subtype,r=>r.lines,0,fmtTokens);
  // When
  rows($("#hours"),s.activityByHour,h=>String(h.hour).padStart(2,"0")+":00",h=>h.requests,h=>\`\${fmt(h.requests)} req · $\${fmt(h.cost,2)}\`);
  // Capabilities
  bars($("#skills"),s.skills,r=>r.name,r=>r.count);
  bars($("#mcps"),s.mcpServers,r=>r.name,r=>r.count);
  bars($("#plugins"),s.plugins,r=>r.name,r=>r.count);
  bars($("#sessions"),s.sessionsByStart,r=>r.startType,r=>r.count);
}
$("#org").onchange=loadSummary;
$("#reload").onclick=loadOrgs;
loadOrgs();
</script></body></html>`;
