import { fetch } from 'undici';
async function test() {
  try {
     let r = await fetch('https://testfront.mangalib.me/api/manga');
     console.log("Mangalib ME:", r.status);
  } catch(e) {
     console.log(e.message);
  }
}
test();
