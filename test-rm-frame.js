import { fetch } from 'undici';
const check = async () => {
    let res = await fetch(`https://remanga.org/manga/isekai-ten/`, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    console.log(res.status);
    let text = await res.text();
    console.log(text.substring(0, 500));
}
check();
