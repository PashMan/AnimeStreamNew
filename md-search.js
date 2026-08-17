import http from 'http';

const get = async () => {
    let res = await fetch(`https://api.mangadex.org/manga?limit=5&title=${encodeURIComponent("ISEKAI TEN'I KARA HAJIMARU JOSHI RYOU HAREM")}`);
    let data = await res.json();
    console.dir(data, { depth: null });
};
get();
