const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    const filePath = path.resolve(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(filePath));
    } else {
      if (filePath.endsWith('.tsx') || filePath.endsWith('.ts')) {
        results.push(filePath);
      }
    }
  });
  return results;
}

const files = walk(path.join(__dirname, 'src'));
let changedFiles = 0;

const neuRegex = /\s*\b(neu-raised|neu-raised-sm|neu-pressed|neu-pressed-sm|neu-flat|neu-hover|neu-active)\b/g;

files.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  if (neuRegex.test(content)) {
    let newContent = content.replace(neuRegex, '');
    
    // Also clean up empty classNames
    newContent = newContent.replace(/className=""/g, '');
    newContent = newContent.replace(/className=" "/g, '');
    newContent = newContent.replace(/className=''/g, '');
    newContent = newContent.replace(/className=\s*\{?['"`]\s*['"`]\}?/g, '');
    
    fs.writeFileSync(file, newContent);
    changedFiles++;
    console.log('Cleaned:', file);
  }
});

console.log(`Cleaned ${changedFiles} files.`);
