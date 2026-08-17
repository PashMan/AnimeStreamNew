import { fetch } from 'undici';
import fs from 'fs';

async function test() {
  const res = await fetch('https://manga.ovh/');
  const text = await res.text();
  const scriptMatch = text.match(/<script[^>]+src="([^">]+)"/g);
  if (scriptMatch) {
     for (let s of scriptMatch) {
        const src = s.match(/src="([^">]+)"/)[1];
        let scriptUrl = src.startsWith('http') ? src : 'https://manga.ovh' + src;
        try {
           let r = await fetch(scriptUrl);
           let js = await r.text();
           if (js.includes('api.inkstory.net') || js.includes('api.manga.ovh')) {
              console.log("FOUND API in:", scriptUrl);
              // write to file for inspection
              fs.writeFileSync('./ovh-script.js', js);
           }
        } catch(e) {}
     }
  }
}
test();
