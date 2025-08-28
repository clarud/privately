# privately
Chrome extension that flags out confidential information
'''
privately/
├─ extension/                 # Chrome extension (MV3)
│  ├─ manifest.json
│  ├─ assets/
│  │  ├─ icon16.png
│  │  ├─ icon48.png
│  │  └─ icon128.png
│  └─ src/
│     ├─ content.js           # inline detection + tooltip
│     ├─ overlay.css          # styles for highlights/tooltips
│     ├─ popup.html
│     ├─ popup.js             # dashboard popup
│     ├─ options.html
│     └─ options.js           # settings (categories, modes)
├─ web-dashboard/             # Lynx web dashboard
└─ README.md                  
'''
