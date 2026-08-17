import { fetch } from 'undici';
const check = async () => {
    let res = await fetch(`https://api.remanga.org/api/search/catalog/?count=5&offset=0&callback=test`);
    let text = await res.text();
    console.log(text.substring(0, 100));
}
check();
