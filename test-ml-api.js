import { fetch } from 'undici';
const check = async () => {
    let res = await fetch('https://api.lib.social/api/manga?site_id=1&limit=5', {
        headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    console.log(res.status);
    let text = await res.text();
    console.log(text.substring(0, 100));
};
check();
