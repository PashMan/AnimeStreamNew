import { fetch } from 'undici';
async function run() {
   const urls = [
      'https://api.manga.ovh/api/mangas',
      'https://api.manga.ovh/api/manga',
      'https://api.manga.ovh/api/titles',
      'https://api.manga.ovh/catalog',
      'https://api.manga.ovh/manga',
      'https://api.manga.ovh/search',
   ];
   for (let u of urls) {
      try {
         let r = await fetch(u);
         console.log(u, r.status);
      } catch(e) {}
   }
}
run();
