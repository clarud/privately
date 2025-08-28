const defaults = {
  enabled:true, mode:"balanced",
  categories:{ EMAIL:true, PHONE:true, CARD:true, ID:true, NAME:true, ADDRESS:true },
  allowlist:{}
};
function render(p){
  enabled.checked = p.enabled;
  mode.value = p.mode;
  cats.innerHTML="";
  Object.entries(p.categories).forEach(([k,v])=>{
    const id=`cat-${k}`; const label=document.createElement('label');
    label.innerHTML=`<input id="${id}" type="checkbox" ${v?'checked':''}> ${k}`;
    cats.appendChild(label); cats.appendChild(document.createElement('br'));
    document.getElementById(id).onchange=e=>{ p.categories[k]=e.target.checked; chrome.storage.local.set({ pg_prefs:p }); };
  });
  enabled.onchange = e=>{ p.enabled=e.target.checked; chrome.storage.local.set({ pg_prefs:p }); };
  mode.onchange    = e=>{ p.mode   =e.target.value;  chrome.storage.local.set({ pg_prefs:p }); };
}
const enabled=document.getElementById('enabled');
const mode=document.getElementById('mode');
const cats=document.getElementById('cats');
chrome.storage.local.get({ pg_prefs: defaults }, ({ pg_prefs })=> render(pg_prefs));
