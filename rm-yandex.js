import { fetch } from 'undici';
async function test() {
  const url = 'https://api.remanga.org/api/titles/isekai-ten/';
  const trUrl = `https://translate.yandex.net/website?url=${encodeURIComponent(url)}&srv=yaru`;
  try {
     let r = await fetch(trUrl, {headers: {'User-Agent': 'Mozilla/5.0'}});
     console.log(r.status);
     let text = await r.text();
     console.log(text.substring(0, 100));
  } catch(e) {
     console.log(e.message);
  }
}
test();
