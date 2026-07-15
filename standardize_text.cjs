const fs = require('fs');
const path = require('path');

const targetDirs = [
  path.join(__dirname, 'components'),
  __dirname
];

const regexList = [
  /text-\[9px\]/g,
  /text-\[10px\]/g,
  /text-\[11px\]/g,
  /text-2xs/g
];

function processDirectory(dir) {
  const files = fs.readdirSync(dir);
  let totalReplaced = 0;

  files.forEach(file => {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      if (file !== 'node_modules' && file !== '.git' && file !== 'dist' && file !== 'supabase_migrations') {
        totalReplaced += processDirectory(fullPath);
      }
    } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      let originalContent = content;
      
      regexList.forEach(regex => {
        content = content.replace(regex, 'text-xs');
      });

      if (content !== originalContent) {
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log(`Updated typography in ${fullPath}`);
        totalReplaced++;
      }
    }
  });
  
  return totalReplaced;
}

const numFiles = processDirectory(targetDirs[1]);
console.log(`Successfully standardized text sizes in ${numFiles} files.`);
