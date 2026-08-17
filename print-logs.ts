async function printLogs() {
  try {
    const res = await fetch('http://127.0.0.1:3000/api/debug-logs');
    const logs = await res.json() as any[];
    console.log(`Retrieved ${logs.length} logs:`);
    logs.forEach(log => {
      console.log(`[${log.timestamp}] ${log.message}`, log.data ? JSON.stringify(log.data) : '');
    });
  } catch (e: any) {
    console.error('Failed to print logs:', e.message);
  }
}
printLogs();
