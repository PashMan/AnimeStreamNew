import { fetch } from 'undici';

const proxies = [
    'https://api.codetabs.com/v1/proxy?quest=',
    'https://thingproxy.freeboard.io/fetch/',
    'https://api.allorigins.win/get?url='
];

const check = async () => {
    for (const p of proxies) {
        try {
            const encodedUrl = p.includes('allorigins') ? encodeURIComponent('https://api.remanga.org/api/search/catalog/?count=1') : 'https://api.remanga.org/api/search/catalog/?count=1';
            let res = await fetch(`${p}${encodedUrl}`, {
                headers: { 'Origin': 'http://localhost:3000' }
            });
            let text = await res.text();
            console.log(`[${p}] Status: ${res.status}`);
            if (res.status === 200 && text.includes('content')) {
                console.log(`SUCCESS with ${p}`);
            }
        } catch (e) {
            console.log(`[${p}] Error: ${e.message}`);
        }
    }
}
check();
