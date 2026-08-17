import { fetch } from 'undici';
async function test() {
  const res = await fetch('https://manga.ovh/');
  const text = await res.text();
  const scriptMatch = text.match(/src="(\/_astro\/[^"]+\.js)"/g);
  for (let s of scriptMatch) {
     const src = s.match(/src="([^"]+)"/)[1];
     try {
       const res2 = await fetch('https://manga.ovh' + src);
       const text2 = await res2.text();
       if (text2.includes('api.manga.ovh')) {
          console.log("FOUND in", src);
       }
       if (text2.includes('fetch(') || text2.includes('.get(') || text2.includes('.post(')) {
          let searches = ['/mangas', '/titles', '/search', 'graphql', '/chapters', 'query'];
          for (let q of searches) {
             if (text2.includes(`"${q}"`)) console.log(`found ${q} in ${src}`);
          }
       }
     } catch (e) {}
  }
}
test();
