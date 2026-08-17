import { fetch } from 'undici';

async function testSenkuro() {
  try {
    const res = await fetch('https://api.senkuro.com/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
      body: JSON.stringify({ query: "{ searchManga(query: \"isekai\") { id title } }" })
    });
    console.log("Senkuro:", res.status);
  } catch(e) { console.log("Senkuro:", e.message) }
}

async function testMangaLib() {
  try {
    const res = await fetch('https://api.lib.social/api/manga?limit=5', {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    console.log("MangaLib:", res.status);
  } catch(e) { console.log("MangaLib:", e.message) }
}

async function testMangaBuff() {
  try {
    const res = await fetch('https://mangabuff.ru/api/manga?limit=5', {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    console.log("MangaBuff:", res.status);
  } catch(e) { console.log("MangaBuff:", e.message) }
}

async function testMangaOvh() {
  try {
    const res = await fetch('https://manga.ovh/api/manga?limit=5', {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    console.log("MangaOvh:", res.status);
  } catch(e) { console.log("MangaOvh:", e.message) }
}

async function run() {
  await testSenkuro();
  await testMangaLib();
  await testMangaBuff();
  await testMangaOvh();
}
run();
