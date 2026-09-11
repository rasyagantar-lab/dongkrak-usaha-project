import React, { useState, useEffect } from 'react';
import { Cpu, AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';

interface ModelStatus {
  id: string;
  name: string;
  priority: number;
  available: boolean;
  status: 'AVAILABLE' | 'QUOTA_EXHAUSTED' | 'TEMPORARILY_UNAVAILABLE';
  lastError?: number;
  unavailableUntil?: number;
}

const DEFAULT_MODELS: ModelStatus[] = [
  { id: "gemini-3.6-flash", name: "Gemini 3.6 Flash", priority: 1, available: true, status: 'AVAILABLE' },
  { id: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro Preview", priority: 2, available: true, status: 'AVAILABLE' },
  { id: "gemini-latest-pro", name: "Gemini Latest Pro", priority: 3, available: true, status: 'AVAILABLE' },
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", priority: 4, available: true, status: 'AVAILABLE' },
  { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro", priority: 5, available: true, status: 'AVAILABLE' },
  { id: "gemini-1.5-flash", name: "Gemini 1.5 Flash", priority: 6, available: true, status: 'AVAILABLE' }
];

export const ModelStatusIndicator: React.FC = () => {
  const [models, setModels] = useState<ModelStatus[]>(DEFAULT_MODELS);
  const [isLoading, setIsLoading] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const fetchStatus = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/gemini/status');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setModels(data);
        }
      }
    } catch {
      // Quietly handle transient network/boot errors
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000); // Check every 30 seconds
    return () => clearInterval(interval);
  }, []);

  if (models.length === 0) return null;

  const primaryModel = models.find(m => m.priority === 1);
  const activeModel = models.find(m => m.available) || primaryModel;

  const allDown = models.every(m => !m.available);

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div 
        className={`bg-white rounded-xl shadow-lg border p-3 flex flex-col gap-2 transition-all ${allDown ? 'border-red-300' : 'border-slate-200'}`}
      >
        <div 
          className="flex items-center gap-3 cursor-pointer select-none"
          onClick={() => setShowDetails(!showDetails)}
        >
          <div className={`p-2 rounded-lg ${allDown ? 'bg-red-50 text-red-600' : (activeModel?.id === primaryModel?.id ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600')}`}>
            <Cpu className="w-5 h-5" />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-bold tracking-wider text-slate-500 uppercase">
              AI Engine Status
            </span>
            <div className="flex items-center gap-1.5">
              {allDown ? (
                <>
                  <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                  <span className="text-sm font-bold text-red-700">All Models Unavailable</span>
                </>
              ) : activeModel?.id === primaryModel?.id ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="text-sm font-bold text-slate-800">{activeModel?.name}</span>
                </>
              ) : (
                <>
                  <RefreshCw className="w-3.5 h-3.5 text-amber-500" />
                  <span className="text-sm font-bold text-amber-700">Fallback: {activeModel?.name}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {showDetails && (
          <div className="mt-2 pt-2 border-t border-slate-100 text-xs w-64 max-h-64 overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-slate-700">Model Fallback Chain</span>
              <button onClick={fetchStatus} disabled={isLoading} className="text-blue-600 hover:text-blue-800">
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
            
            <div className="space-y-2">
              {models.map(model => (
                <div key={model.id} className={`p-2 rounded border ${model.available ? (model.id === activeModel?.id ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200') : 'bg-red-50 border-red-200'}`}>
                  <div className="flex justify-between items-start">
                    <span className={`font-semibold ${model.available ? 'text-slate-800' : 'text-red-700'}`}>
                      {model.priority}. {model.name}
                    </span>
                    {model.id === activeModel?.id && (
                      <span className="bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded text-[9px] font-bold">ACTIVE</span>
                    )}
                  </div>
                  {!model.available && (
                    <div className="mt-1 text-[10px] text-red-600">
                      Status: {model.status.replace(/_/g, ' ')}
                      {model.lastError && ` (HTTP ${model.lastError})`}
                    </div>
                  )}
                </div>
              ))}
            </div>
            
            {!primaryModel?.available && activeModel?.available && (
              <div className="mt-3 p-2 bg-amber-50 text-amber-800 rounded border border-amber-200 text-[10px] leading-tight">
                <strong>Fallback Active:</strong> {primaryModel?.name} is currently unavailable. Using {activeModel?.name} to prevent interruption.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
