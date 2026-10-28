import {readFile,writeFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
let html=await readFile(new URL('index.html',root),'utf8');
for(const name of ['cards.js','collection.js','storage.js','app.js']) {
  const code=(await readFile(new URL(name,root),'utf8')).replace(/<\/script/gi,'<\\/script');
  html=html.replace(`<script src="${name}"></script>`,()=>`<script>\n${code}\n</script>`);
}
await writeFile(new URL('riftbound_tracker.html',root),html);
console.log('Standalone regenerated from index.html and shared scripts.');
