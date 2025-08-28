const defaults = {
  enabled: true,
  mode: "balanced",
  categories: { EMAIL:true, PHONE:true, CARD:true, ID:true, NAME:true, ADDRESS:true },
  allowlist:{}
};

const labelColors = {
  EMAIL: "blue", PHONE: "green", CARD: "red",
  ID: "purple", NAME: "amber", ADDRESS: "cyan"
};

function renderCounts(pg_counts){
  const ul = document.getElementById("counts");
  ul.innerHTML = "";
  const labels = ["EMAIL","PHONE","CARD","ID","NAME","ADDRESS"];
  labels.forEach(l => {
    const li = document.createElement("li");
    const dot = document.createElement("span");
    dot.className = `count-dot ${labelColors[l] || ""}`;
    li.appendChild(dot);
    li.appendChild(document.createTextNode(`${l}: ${pg_counts[l] || 0}`));
    ul.appendChild(li);
  });
  const total = Object.values(pg_counts).reduce((a,b)=>a+(b||0),0);
  const score = Math.max(0, 100 - Math.min(100, total * 2));
  document.getElementById("score").textContent = `${score}`;
}

function loadAll(){
  chrome.storage.local.get(
    { pg_prefs: defaults, pg_counts: {} },
    ({ pg_prefs, pg_counts }) => {
      document.getElementById("enabled").checked = !!pg_prefs.enabled;
      document.getElementById("mode").value = pg_prefs.mode || "balanced";
      renderCounts(pg_counts);
    }
  );
}

document.getElementById("enabled").addEventListener("change", (e)=>{
  chrome.storage.local.get({ pg_prefs: defaults }, ({ pg_prefs })=>{
    pg_prefs.enabled = e.target.checked;
    chrome.storage.local.set({ pg_prefs });
  });
});

document.getElementById("mode").addEventListener("change", (e)=>{
  chrome.storage.local.get({ pg_prefs: defaults }, ({ pg_prefs })=>{
    pg_prefs.mode = e.target.value;
    chrome.storage.local.set({ pg_prefs });
  });
});

document.getElementById("resetCounts").addEventListener("click", ()=>{
  chrome.storage.local.set({ pg_counts: {} }, loadAll);
});

document.getElementById("openOptions").addEventListener("click", ()=>{
  chrome.runtime.openOptionsPage();
});

document.getElementById("openTest").addEventListener("click", ()=>{
  // opens a simple page with inputs to try the inline UX
  chrome.tabs.create({
    url: "https://www.w3schools.com/tags/tryit.asp?filename=tryhtml_textarea"
  });
});

loadAll();

// live-update if content script bumps counts while popup is open
chrome.storage.onChanged.addListener((changes)=>{
  if (changes.pg_counts) {
    renderCounts(changes.pg_counts.newValue || {});
  }
  if (changes.pg_prefs) {
    const p = changes.pg_prefs.newValue;
    document.getElementById("enabled").checked = !!p.enabled;
    document.getElementById("mode").value = p.mode || "balanced";
  }
});
