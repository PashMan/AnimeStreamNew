import { fetch } from 'undici';
const check = async () => {
    let title = "isekai-teni-kara-hajimaru-joshi-ryou-harem".replace(/-/g, ' ');
    let res = await fetch(`https://api.mangadex.org/manga?limit=3&title=${encodeURIComponent(title)}`);
    let data = await res.json();
    console.log(data.data[0]?.attributes?.title);
}
check();
