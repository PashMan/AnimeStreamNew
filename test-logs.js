import fetch from 'node-fetch';

async function fetchLogs() {
  try {
    const res = await fetch('http://localhost:3000/api/debug-logs');
    if (!res.ok) {
      console.error(`HTTP Error: ${res.status}`);
      return;
    }
    const logs = await res.json();
    console.log("=== SERVER DEBUG LOGS ===");
    console.log(JSON.stringify(logs.slice(0, 30), null, 2));
  } catch (err) {
    console.error("Failed to fetch logs:", err.message);
  }
}

fetchLogs();
