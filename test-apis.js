import { fetch } from 'undici';
async function test() {
  const tests = [
    'https://api.manga.ovh/mangas',
    'https://api.manga.ovh/titles',
    'https://api.manga.ovh/search',
    'https://api.inkstory.net/ayanokouji/v1/titles',
    'https://api.inkstory.net/ayanokouji/mangas',
    'https://api.manga.ovh/v1/mangas',
    'https://api.manga.ovh/v1/titles',
    'https://api.manga.ovh/v1/search/catalog?limit=5',
  ];
  for (let url of tests) {
     try {
        let r = await fetch(url);
        console.log(url, r.status);
     } catch (e) {
        console.log(url, e.message);
     }
  }
}
test();
