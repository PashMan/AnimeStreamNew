import { fetch } from 'undici';

const check = async () => {
    let res = await fetch(`https://api.remanga.org/api/search/catalog/?count=5&offset=0`, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Referer': 'https://remanga.org/',
            'Origin': 'https://remanga.org'
        }
    });
    let text = await res.text();
    console.log(res.status);
    console.log(text.substring(0, 200));
}
check();
