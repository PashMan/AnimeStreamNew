
import React, { useEffect, useState } from 'react';
import { Terminal, RefreshCw, Trash2, ChevronDown, ChevronUp } from 'lucide-react';

interface LogEntry {
  timestamp: string;
  message: string;
  data: any;
}

const DebugLogs: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/debug-logs');
      if (response.ok) {
        const data = await response.json();
        setLogs(data);
      }
    } catch (error) {
      console.error('Failed to fetch logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const sendTestLog = async () => {
    try {
      await fetch('/api/test-log?test=true');
      fetchLogs();
    } catch (error) {
      console.error('Failed to send test log:', error);
    }
  };

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 5000); // Auto-refresh every 5s
    return () => clearInterval(interval);
  }, []);

  const toggleExpand = (index: number) => {
    setExpandedIndex(expandedIndex === index ? null : index);
  };

  return (
    <div className="min-h-screen bg-dark text-white p-6 pt-24">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <Terminal className="w-8 h-8 text-primary" />
            <h1 className="text-3xl font-bold font-display uppercase tracking-wider">System Debug Logs</h1>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={sendTestLog}
              className="flex items-center gap-2 bg-primary/20 hover:bg-primary/30 text-primary px-4 py-2 rounded-lg transition-colors"
            >
              Test Log
            </button>
            <button 
              onClick={fetchLogs}
              disabled={loading}
              className="flex items-center gap-2 bg-white/10 hover:bg-white/20 px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        <div className="bg-dark-lighter rounded-2xl border border-white/10 overflow-hidden shadow-2xl">
          <div className="p-4 border-bottom border-white/10 bg-white/5 flex items-center justify-between">
            <span className="text-sm font-mono text-white/50 uppercase tracking-widest">Real-time Backend Activity</span>
            <span className="text-xs text-white/30 italic">Auto-refreshes every 5 seconds</span>
          </div>

          <div className="divide-y divide-white/5 max-h-[70vh] overflow-y-auto">
            {logs.length === 0 ? (
              <div className="p-12 text-center text-white/30 italic">
              No logs recorded yet. Try using the player balancers.
              </div>
            ) : (
              logs.map((log, index) => (
                <div key={index} className="p-4 hover:bg-white/5 transition-colors">
                  <div 
                    className="flex items-start justify-between cursor-pointer"
                    onClick={() => toggleExpand(index)}
                  >
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-mono text-primary/70">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </span>
                        <span className={`font-medium ${log.message.includes('Error') || log.message.includes('Failed') ? 'text-red-400' : 'text-white/90'}`}>
                          {log.message}
                        </span>
                      </div>
                    </div>
                    {log.data && (
                      <div className="text-white/30">
                        {expandedIndex === index ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                      </div>
                    )}
                  </div>

                  {expandedIndex === index && log.data && (
                    <div className="mt-4 p-4 bg-black/40 rounded-xl border border-white/5 font-mono text-xs overflow-x-auto whitespace-pre-wrap text-white/70 leading-relaxed">
                      {JSON.stringify(log.data, null, 2)}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 bg-white/5 rounded-2xl border border-white/10">
            <h3 className="text-primary font-bold mb-2 uppercase text-sm tracking-widest">Why this page?</h3>
            <p className="text-sm text-white/60 leading-relaxed">
              This page captures raw requests and responses from our backend proxy to various player balancers. 
              It helps identify if the APIs are returning errors, empty results, or malformed JSON.
            </p>
          </div>
          <div className="p-6 bg-white/5 rounded-2xl border border-white/10">
            <h3 className="text-primary font-bold mb-2 uppercase text-sm tracking-widest">Common Issues</h3>
            <ul className="text-sm text-white/60 list-disc list-inside space-y-1">
              <li>403 Forbidden: IP is blocked</li>
              <li>404 Not Found: Content missing</li>
              <li>JSON Parse Error: API changed format</li>
            </ul>
          </div>
          <div className="p-6 bg-white/5 rounded-2xl border border-white/10">
            <h3 className="text-primary font-bold mb-2 uppercase text-sm tracking-widest">Privacy</h3>
            <p className="text-sm text-white/60 leading-relaxed">
              These logs are stored in memory only and are cleared whenever the server restarts. 
              No sensitive user data is logged.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DebugLogs;
