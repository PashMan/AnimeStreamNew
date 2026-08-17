import { fetch } from 'undici';

const check = async () => {
    let res = await fetch(`https://api.remanga.org/api/search/catalog/?count=5&offset=0`, {
        headers: {
            'User-Agent': 'ReManga/1.0.0 (Android 11; Mobile)',
            'Accept': 'application/json, text/plain, */*'
        }
    });
    console.log(res.status);
    let text = await res.text();
    console.log(text.substring(0, 100));
}
check();
