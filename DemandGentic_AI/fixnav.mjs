import fs from 'fs';
let code = fs.readFileSync('client/src/pages/landing.tsx', 'utf8');
code = code.replace(/>Solutions/g, '>Our Solutions');
code = code.replace(/href="\/about"/g, 'href="#about"');
fs.writeFileSync('client/src/pages/landing.tsx', code);