import { fetch } from 'undici';
async function test() {
  try {
     let r = await fetch('https://corsproxy.io/?url=' + encodeURIComponent('https://api.remanga.org/api/search/catalog/?count=5&offset=0'), {
        headers: { 'User-Agent': 'Mozilla/5.0' }
     });
     console.log("Corsproxy:", r.status);
     console.log((await r.text()).substring(0,100));
  } catch(e) {
     console.log(e.message);
  }
}
test();
