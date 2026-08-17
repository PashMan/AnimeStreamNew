import { fetch } from 'undici';
async function test() {
  const url = 'https://api.manga.ovh/graphql';
  const query = `
    query {
      __schema {
        types {
          name
        }
      }
    }
  `;
  try {
     let r = await fetch(url + "?query=" + encodeURIComponent('{__typename}'));
     console.log("GET:", r.status);
  } catch (e) {
     console.log("GET ERR:", e.message);
  }
}
test();
