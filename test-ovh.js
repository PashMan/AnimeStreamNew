import { fetch } from 'undici';
async function testMangaOvh() {
  try {
    const res = await fetch('https://manga.ovh/', {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const text = await res.text();
    console.log("MangaOvh Home Length:", text.length);
    console.log("Snippet:", text.substring(0, 200));
  } catch (e) {
    console.log("Error:", e.message);
  }
}
testMangaOvh();
