import { fetch } from 'undici';
const check = async () => {
    let res = await fetch('https://api.mangalib.me/api/manga?limit=5', {
        headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    console.log(res.status);
};
check();
