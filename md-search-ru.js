import { fetch } from 'undici';

const check = async () => {
    let res = await fetch(`https://api.mangadex.org/manga?limit=5&title=${encodeURIComponent("ISEKAI TEN'I KARA HAJIMARU JOSHI RYOU HAREM")}&availableTranslatedLanguage[]=ru`);
    let data = await res.json();
    console.log(JSON.stringify(data, null, 2));
}
check();
