import { fetch } from 'undici';

const check = async () => {
    let res = await fetch(`https://api.remanga.org/api/search/catalog/?count=5&offset=0`, {
        headers: {
            'User-Agent': 'Dart/2.14 (dart:io)'
        }
    });
    console.log(res.status);
    let text = await res.text();
    if(res.status===200) console.log("SUCCESS!");
}
check();
