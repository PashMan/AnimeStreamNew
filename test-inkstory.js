import { fetch } from 'undici';
async function run() {
  const res = await fetch('https://manga.ovh/');
  const text = await res.text();
  const scriptMatch = text.match(/src="(\/_astro\/[^"]+\.js)"/g);
  for (let s of scriptMatch) {
     const src = s.match(/src="([^"]+)"/)[1];
     try {
       const res2 = await fetch('https://manga.ovh' + src);
       const text2 = await res2.text();
       if (text2.includes('Authorization') || text2.includes('headers') || text2.includes('inkstory')) {
         console.log("Found in", src);
         const lines = text2.split(';').filter(l => l.includes('headers') || l.includes('inkstory'));
         for (let l of lines.slice(0, 5)) {
             console.log(l.substring(0, 150));
         }
       }
     } catch (e) {}
  }
}
run();
