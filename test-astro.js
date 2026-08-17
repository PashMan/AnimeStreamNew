import { fetch } from 'undici';
async function test() {
  const res = await fetch('https://manga.ovh/');
  const text = await res.text();
  console.log("api.manga? ", text.includes('api.manga.ovh'));
  console.log("inkstory? ", text.includes('inkstory'));
  console.log("manga.ovh/api? ", text.includes('/api/mangas'));
  console.log(text.match(/"\/api[^"]+"/g)?.slice(0, 5));
}
test();
