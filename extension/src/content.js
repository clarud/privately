const DEBOUNCE_MS = 250;
const RE = {
  EMAIL: /[^\s]+@[^\s]+\.[^\s]+/g,
  PHONE: /\+?\d[\d\s\-\(\)]{7,}\d/g,
  CARD: /\b(?:\d[ -]*?){13,16}\b/g
};
let prefs = {
  enabled: true, mode: "balanced",
  categories: { EMAIL:true, PHONE:true, CARD:true, ID:true, NAME:true, ADDRESS:true },
  allowlist: {}
};
chrome.storage.local.get({ pg_prefs: prefs }, ({ pg_prefs }) => prefs = pg_prefs);
chrome.storage.onChanged.addListener(c => { if (c.pg_prefs) prefs = c.pg_prefs.newValue; });

const debounce=(f,m)=>{let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>f(...a),m)}};
const fake = l => l==="EMAIL" ? "alex.murphy@example.org" :
  l==="PHONE" ? "+1 415 555 0137" :
  l==="CARD"  ? "4242 4242 4242 4242" :
  l==="ID"    ? "ID-9F3A-2201" :
  l==="NAME"  ? "Jordan Avery" :
  l==="ADDRESS" ? "221B Baker Street, London" : "REDACTED";

function detect(text){
  const spans=[];
  for (const [label, rx] of Object.entries(RE)) {
    if (!prefs.categories[label]) continue;
    let m; const r=new RegExp(rx);
    while((m=r.exec(text))!==null) spans.push({start:m.index,end:m.index+m[0].length,label,confidence:0.9});
  }
  return spans;
}
function getId(el){ if(!el.dataset.pgId) el.dataset.pgId='pg-'+Math.random().toString(36).slice(2); return el.dataset.pgId; }
function removeTip(el){ const id=getId(el); document.querySelectorAll(`.pg-tip[data-for="${id}"]`).forEach(n=>n.remove()); }

function attachTip(el, spans){
  removeTip(el); if (!spans.length) return;
  const rect=el.getBoundingClientRect();
  const tip=document.createElement('div');
  tip.className='pg-tip'; tip.dataset.for=getId(el);
  tip.innerHTML = `
    <div style="margin-bottom:6px"><strong>Privacy risk:</strong> ${[...new Set(spans.map(s=>s.label))].join(', ')}</div>
    <div><button data-act="replace">Replace</button>
         <button data-act="ignore">Ignore</button>
         <button data-act="allow">Always allow here</button></div>`;
  tip.style.top  = `${scrollY + rect.top  - 8}px`;
  tip.style.left = `${scrollX + rect.left + rect.width + 8}px`;
  document.body.appendChild(tip);

  tip.addEventListener('click',(e)=>{
    const act=e.target?.dataset?.act; if(!act) return;
    if (act==="replace"){
      const sorted=[...spans].sort((a,b)=>b.start-a.start);
      if (el.isContentEditable){
        let t=el.innerText; sorted.forEach(s=>t=t.slice(0,s.start)+fake(s.label)+t.slice(s.end)); el.innerText=t;
      } else {
        let v=el.value; sorted.forEach(s=>v=v.slice(0,s.start)+fake(s.label)+v.slice(s.end)); el.value=v;
      }
      removeTip(el);
    } else if (act==="ignore"){ removeTip(el); }
    else if (act==="allow"){
      prefs.allowlist[location.host]=true; chrome.storage.local.set({ pg_prefs:prefs }); removeTip(el);
    }
  });

  const labels=[...new Set(spans.map(s=>s.label))];
  chrome.storage.local.get({ pg_counts:{} }, ({pg_counts})=>{
    labels.forEach(l=>pg_counts[l]=(pg_counts[l]||0)+1);
    chrome.storage.local.set({ pg_counts });
  });
}

const handle = debounce((el)=>{
  if (!prefs.enabled) return;
  if (prefs.allowlist[location.host]) return;
  const text = el.isContentEditable ? el.innerText : el.value;
  attachTip(el, detect(text));
}, DEBOUNCE_MS);

document.addEventListener('focusin',(e)=>{
  const el=e.target;
  if(!el.matches('input[type="text"],input[type="email"],input[type="search"],input[type="tel"],textarea,[contenteditable],[contenteditable="true"],[contenteditable=""]')) return;
  el.addEventListener('input',()=>handle(el)); handle(el);
});
