import { fetch } from 'undici';

const check = async () => {
    let res = await fetch(`https://api.remanga.org/api/search/catalog/?count=5&offset=0`);
    let text = await res.text();
    console.log(text.substring(0, 200));
}
check();
