import { fetch } from 'undici';

const check = async () => {
    let res = await fetch(`https://api.remanga.org/api/search/catalog/?search=${encodeURIComponent("ISEKAI TEN'I KARA HAJIMARU JOSHI RYOU HAREM")}`);
    let data = await res.json();
    console.log(JSON.stringify(data, null, 2));
}
check();
