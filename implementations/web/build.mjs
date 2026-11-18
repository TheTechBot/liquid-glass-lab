#!/usr/bin/env node
// Inlines tokens.css, liquid-glass.css and liquid-glass.js into one file:// friendly HTML.
// Usage: node implementations/web/build.mjs   -> implementations/web/dist/liquid-glass-demo.html
//        also writes dist/liquid-glass.css (tokens + material) and dist/liquid-glass.iife.js
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const r = (p) => readFileSync(join(here, p), 'utf8');
const css = r('src/tokens.css') + '\n' + r('src/liquid-glass.css');
const toIife = (src) => '(function(){\n' + src
  .replace(/^export default \w+;\s*$/m, '')
  .replace(/^export (function|const|let|class)/gm, '$1') + '\n})();\n';
const iife = toIife(r('src/liquid-glass.js'));
const refractionIife = toIife(r('src/liquid-glass-refraction.js'));
const effectIife = toIife(r('src/liquid-glass-effect.js').replace(/^import LGRefraction.*$/m, 'const LGRefraction = window.LGRefraction; const { SIGNATURE, PRESETS } = LGRefraction;'));

let html = r('demo/index.html');
html = html.replace(/<!-- build:css -->[\s\S]*?<!-- \/build:css -->/, `<style>\n${css}\n</style>`);
html = html.replace(/<!-- build:js -->\s*<script type="module">\s*import LG from '..\/src\/liquid-glass.js';\s*import LGRefraction from '..\/src\/liquid-glass-refraction.js';/,
  () => `<script>\n${iife}\n</script>\n<script>\n${refractionIife}\n</script>\n<script>\n  const LG = window.LG; const LGRefraction = window.LGRefraction;`);
html = html.replace('<!-- /build:js -->', '');
mkdirSync(join(here, 'dist'), { recursive: true });
writeFileSync(join(here, 'dist/liquid-glass-demo.html'), html);
writeFileSync(join(here, 'dist/liquid-glass.css'), css);
writeFileSync(join(here, 'dist/liquid-glass.iife.js'), iife);
writeFileSync(join(here, 'dist/liquid-glass-refraction.iife.js'), refractionIife);
writeFileSync(join(here, 'dist/liquid-glass-effect.iife.js'), effectIife);
{ // Apple-API demo (glassEffect / GlassEffectContainer / morphing)
  let g = r('glass-effect-demo/index.html');
  g = g.replace(/<!-- build:css -->[\s\S]*?<!-- \/build:css -->/, () => `<style>\n${css}\n</style>`);
  g = g.replace(/<!-- build:js -->[\s\S]*?<!-- \/build:js -->/, () => `<script>\n${iife}\n</script>\n<script>\n${refractionIife}\n</script>\n<script>\n${effectIife}\n</script>`);
  writeFileSync(join(here, 'dist/liquid-glass-effect-demo.html'), g);
}

// refraction lab → one file:// friendly HTML (photo inlined as data URL)
let lab = r('refraction-lab/index.html');
const photo = readFileSync(join(here, 'refraction-lab/assets/photo-nasa-blue-marble.jpg')).toString('base64');
lab = lab.replace('href="assets/photo-nasa-blue-marble.jpg"', `href="data:image/jpeg;base64,${photo}"`);
lab = lab.replace(/<!-- build:css -->[\s\S]*?<!-- \/build:css -->/, `<style>\n${css}\n</style>`);
const labJs = r('refraction-lab/lab.js')
  .replace("import LGRefraction, { DEFAULT_MATERIAL } from '../src/liquid-glass-refraction.js';", 'const LGRefraction = window.LGRefraction; const { DEFAULT_MATERIAL } = LGRefraction;')
  .replace("import LG from '../src/liquid-glass.js';", 'const LG = window.LG;');
lab = lab.replace(/<!-- build:js -->[\s\S]*?<!-- \/build:js -->/, () => `<script>\n${iife}\n</script>\n<script>\n${refractionIife}\n</script>\n<script>\n(function(){\n${labJs}\n})();\n</script>`);
writeFileSync(join(here, 'dist/refraction-lab.html'), lab);

// starter template → one file (the skill copies this for new UIs)
let starter = r('starter/index.html');
starter = starter.replace(/<!-- build:css -->[\s\S]*?<!-- \/build:css -->/, () => `<style>\n${css}\n</style>`);
starter = starter.replace(/<!-- build:js -->\s*<script type="module">\s*import LG from '..\/src\/liquid-glass.js';\s*import LGRefraction from '..\/src\/liquid-glass-refraction.js';/,
  () => `<script>\n${iife}\n</script>\n<script>\n${refractionIife}\n</script>\n<script>\n  const LG = window.LG; const LGRefraction = window.LGRefraction;`);
starter = starter.replace('<!-- /build:js -->', '');
writeFileSync(join(here, 'dist/liquid-glass-starter.html'), starter);
// share the same material + behaviour with the React package
mkdirSync(join(here, '../react/src/core'), { recursive: true });
writeFileSync(join(here, '../react/src/core/liquid-glass.css'), css);
writeFileSync(join(here, '../react/src/core/liquid-glass.js'), r('src/liquid-glass.js'));
writeFileSync(join(here, '../react/src/core/liquid-glass-refraction.js'), r('src/liquid-glass-refraction.js'));
writeFileSync(join(here, '../react/src/core/liquid-glass-effect.js'), r('src/liquid-glass-effect.js'));
console.log('built dist/liquid-glass-demo.html', html.length, 'bytes; synced react/src/core');
