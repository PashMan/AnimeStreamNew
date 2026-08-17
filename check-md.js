import { fetch } from 'undici';

const check = async () => {
    // 55a8abc696f86a117b07ff1990c01cb9 is the hash, let's fetch any proxy URL
    // Actually we can't test our API unless we run it or just fetch MangaDex fallback directly
    let res = await fetch(`https://uploads.mangadex.org/data/55a8abc696f86a117b07ff1990c01cb9/35-5696e1ebe82b0b1ef382b6e15998dfc384e542efcfb1d7d63df4e7ac4229bc1e.jpg`, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    console.log(res.status);
};
check();
