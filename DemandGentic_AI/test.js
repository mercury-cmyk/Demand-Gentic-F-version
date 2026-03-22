import fs from 'fs';
const content = fs.readFileSync('client/src/pages/landing.tsx', 'utf8');
const sIdx = content.indexOf('{/* ─── HOW IT WORKS');
const eIdx = content.indexOf('{/* ─── DATA & INTELLIGENCE');
if (sIdx > 0 && eIdx > sIdx) {
  const start = content.lastIndexOf('      {/*', sIdx);
  const end = content.lastIndexOf('      {/*', eIdx);
  const platStr = fs.readFileSync('plat.txt', 'utf8');
  const newContent = content.substring(0, start) + platStr + content.substring(end);
  fs.writeFileSync('client/src/pages/landing.tsx', newContent);
  console.log('Replaced');
} else { console.log('Markers not found'); }