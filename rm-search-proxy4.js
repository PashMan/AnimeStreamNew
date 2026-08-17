process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import { fetch } from 'undici';

const check = async () => {
    try {
        let res = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent('https://api.remanga.org/api/search/catalog/?count=5&offset=0')}`);
        let text = await res.text();
        console.log(res.status);
        console.log(text.substring(0, 200));
    } catch (e) {
        console.error(e);
    }
}
check();
