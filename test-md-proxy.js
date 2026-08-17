import { fetch } from 'undici';
const check = async () => {
    let res = await fetch('https://cmdxd98sb0x3yprd.mangadex.network/data/55a8abc696f86a117b07ff1990c01cb9/35-5696e1ebe82b0b1ef382b6e15998dfc384e542efcfb1d7d63df4e7ac4229bc1e.jpg', {
        headers: { 'Referer': 'https://mangadex.org/', 'User-Agent': 'Mozilla/5.0' }
    });
    console.log(res.status);
};
check();
