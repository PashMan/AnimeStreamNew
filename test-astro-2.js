import { fetch } from 'undici';
async function test() {
  const res = await fetch('https://manga.ovh/');
  const text = await res.text();
  const scriptMatch = text.match(/<script([^>]+)?>([\s\S]*?)<\/script>/g);
  for (let s of scriptMatch) {
     if (s.includes('api.manga.ovh')) {
        let index = s.indexOf('api.manga.ovh');
        console.log(s.substring(Math.max(0, index - 100), Math.min(s.length, index + 200)));
     }
  }
}
test();
