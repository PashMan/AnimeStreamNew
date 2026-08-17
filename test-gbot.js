import { fetch } from 'undici';
const check = async () => {
    let res = await fetch(`https://api.remanga.org/api/search/catalog/?count=5&offset=0`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' }
    });
    console.log(res.status);
    let text = await res.text();
    console.log(text.substring(0, 100));
}
check();
