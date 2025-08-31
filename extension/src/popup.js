// Default preferences with all detection categories
const defaults = {
  enabled: true,
  categories: {
    EMAIL: true, SG_PHONE: true, URL: true, IP: true, IP_PRIVATE: true,
    NRIC: true, POSTAL_SG: true, CARD: true,
    JWT: true, AWS_KEY: true, SECRET: true, PRIVATE_KEY: true,
    AUTH_HEADER: true, SET_COOKIE: true, FILEPATH: true, UUID: true,
    BASE64_LONG: true, HEX_LONG: true, NAME: true, ADDRESS: true
  },
  fakeData: {}
};

// Enhanced label colors for better visual distinction
const labelColors = {
  EMAIL: "blue", SG_PHONE: "green", URL: "cyan", IP: "purple", IP_PRIVATE: "purple",
  NRIC: "amber", POSTAL_SG: "amber", CARD: "red",
  JWT: "orange", AWS_KEY: "orange", SECRET: "red", PRIVATE_KEY: "red",
  AUTH_HEADER: "purple", SET_COOKIE: "purple", FILEPATH: "gray", UUID: "gray",
  BASE64_LONG: "indigo", HEX_LONG: "indigo", NAME: "teal", ADDRESS: "teal"
};

// Category groupings for better organization
const categoryGroups = {
  "Contact & Personal": ["EMAIL", "SG_PHONE", "NAME", "ADDRESS"],
  "Financial & IDs": ["CARD", "NRIC"],
  "Security & Keys": ["SECRET", "JWT", "AWS_KEY", "PRIVATE_KEY"],
  "Technical": ["URL", "IP", "IP_PRIVATE", "UUID", "BASE64_LONG", "HEX_LONG"],
  "System & Headers": ["AUTH_HEADER", "SET_COOKIE", "FILEPATH", "POSTAL_SG"]
};

function renderCounts(pg_counts, userPreferences){
  const ul = document.getElementById("counts");
  ul.innerHTML = "";
  
  // Get enabled categories from user preferences
  const userCategories = userPreferences.categories || defaults.categories;
  const enabledCategories = Object.keys(userCategories).filter(category => {
    return userCategories[category] !== false;
  });
  
  if (enabledCategories.length === 0) {
    const li = document.createElement("li");
    li.className = "no-detections";
    li.textContent = "All categories disabled";
    ul.appendChild(li);
  } else {
    // Group categories for better display - show ALL enabled categories (including those with 0 counts)
    Object.entries(categoryGroups).forEach(([groupName, categories]) => {
      const relevantCategories = categories.filter(cat => 
        enabledCategories.includes(cat)
      );
      
      if (relevantCategories.length > 0) {
        // Add group header
        const groupHeader = document.createElement("li");
        groupHeader.className = "group-header";
        groupHeader.textContent = groupName;
        ul.appendChild(groupHeader);
        
        // Add categories in this group (including those with 0 counts)
        relevantCategories.forEach(category => {
          const li = document.createElement("li");
          li.className = "count-item";
          
          const count = pg_counts[category] || 0;
          
          // Add visual styling for zero counts
          if (count === 0) {
            li.classList.add("zero-count");
          }
          
          const dot = document.createElement("span");
          dot.className = `count-dot ${labelColors[category] || "gray"}`;
          
          const label = document.createElement("span");
          label.className = "count-label";
          label.textContent = category;
          
          const countSpan = document.createElement("span");
          countSpan.className = "count-value";
          countSpan.textContent = count;
          
          li.appendChild(dot);
          li.appendChild(label);
          li.appendChild(countSpan);
          ul.appendChild(li);
        });
      }
    });
  }
}

function loadAll(){
  chrome.storage.local.get(
    { pg_prefs: defaults, pg_counts: {} },
    ({ pg_prefs, pg_counts }) => {
      document.getElementById("enabled").checked = !!pg_prefs.enabled;
      renderCounts(pg_counts, pg_prefs);
    }
  );
}

document.getElementById("enabled").addEventListener("change", (e)=>{
  chrome.storage.local.get({ pg_prefs: defaults }, ({ pg_prefs })=>{
    pg_prefs.enabled = e.target.checked;
    chrome.storage.local.set({ pg_prefs });
  });
});

document.getElementById("resetCounts").addEventListener("click", ()=>{
  chrome.storage.local.set({ pg_counts: {} }, loadAll);
});

document.getElementById("openOptions").addEventListener("click", ()=>{
  chrome.runtime.openOptionsPage();
});

loadAll();

// live-update if content script bumps counts while popup is open
chrome.storage.onChanged.addListener((changes)=>{
  if (changes.pg_counts || changes.pg_prefs) {
    // Reload everything to ensure consistency with new preferences
    loadAll();
  }
});
