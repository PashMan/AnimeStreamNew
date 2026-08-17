import { fetch } from 'undici';

async function test() {
  const res = await fetch('https://manga.ovh/');
  const text = await res.text();
  console.log(text.substring(text.indexOf('<script'), text.indexOf('<script')+4000));
}
test();
