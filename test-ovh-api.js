import { fetch } from 'undici';
async function test() {
  const res = await fetch('https://manga.ovh/');
  const text = await res.text();
  // grep for api urls
  const matches = text.match(/https?:\/\/[^\s"'`]+/g);
  let apiUrls = new Set();
  if (matches) {
     for (let m of matches) {
        if (m.includes('api')) apiUrls.add(m);
     }
  }
  console.log(Array.from(apiUrls));
}
test();
