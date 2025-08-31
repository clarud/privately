// Simple test to verify URL detection is working
console.log('Testing URL detection...');

// Import the config (simulate loading)
const DETECTORS = {
  URL: { 
    rx: /(https?:\/\/[^\s]+|www\.[^\s]+)/gi
  }
};

const testText = "Visit https://google.com and www.github.com for more info";
console.log('Test text:', testText);

const config = DETECTORS.URL;
const regex = new RegExp(config.rx.source, config.rx.flags);
console.log('Regex:', regex);

let match;
const matches = [];
while ((match = regex.exec(testText)) !== null) {
  matches.push({
    text: match[0],
    start: match.index,
    end: match.index + match[0].length
  });
}

console.log('Matches found:', matches);

if (matches.length > 0) {
  console.log('✅ URL detection is working!');
  matches.forEach(m => console.log(`  - "${m.text}" at ${m.start}-${m.end}`));
} else {
  console.log('❌ URL detection failed');
}
