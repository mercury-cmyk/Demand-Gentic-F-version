import fs from 'fs';
const content = fs.readFileSync('client/src/pages/landing.tsx', 'utf8');

const startMarker = '      {/* --- HOW IT WORKS ';
const endMarker = '      {/* --- DATA & INTELLIGENCE ';

const startIndex = content.indexOf(startMarker);
const endIndex = content.indexOf(endMarker);

if (startIndex !== -1 && endIndex !== -1) {
  const newContent = content.substring(0, startIndex) + content.substring(endIndex);
  fs.writeFileSync('client/src/pages/landing.tsx', newContent);
  console.log('Successfully replaced');
} else {
  console.log('Markers not found', { startIndex, endIndex });
}