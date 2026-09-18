import React, { useState, useEffect } from 'react';
import { Cpu, AlertTriangle, CheckCircle2, RefreshCw, KeyRound, Clock, Link2 } from 'lucide-react';

type SlotStatus =
  | 'AVAILABLE'
  | 'QUOTA_EXHAUSTED'
  | 'TEMPORARILY_UNAVAILABLE'
  | 'MODEL_NOT_FOUND'
  | 'ERROR'
  | 'NO_KEY';

interface ModelSlot {
  modelId: string;
  name: string;
  status: SlotStatus;
  available: boolean;
  cooldownSecondsLeft: number;
  quotaScope?: 'minute' | 'day' | 'none' | 'unknown';
  retryAfterSeconds?: number;
  // Model-level (all keys) problem: the provider is saturated/hanging on this model.
  unhealthy?: { secondsLeft: number; reason: string; strikes: number };
  successCount: number;
  failureCount: number;
  lastErrorStatus?: number;
  lastErrorMessage?: string;
}

// Human wording for a slot that is not available right now. Quota is split into the
// three very different situations the provider actually reports, because "quota
// exhausted 15m" hid the difference between "wait 30 seconds" and "this model has no
// free allowance for this key at all".
const unavailableLabel = (model: ModelSlot): string => {
  if (model.unhealthy) return `model sedang bermasalah di Google (${model.unhealthy.reason}) · dilewati ${model.unhealthy.secondsLeft} dtk`;
  if (model.status === 'QUOTA_EXHAUSTED') {
    if (model.quotaScope === 'none') return 'tanpa jatah gratis (limit 0)';
    if (model.quotaScope === 'minute') return `limit per menit${model.retryAfterSeconds ? ` · coba lagi ${model.retryAfterSeconds} dtk` : ''}`;
    if (model.quotaScope === 'day') return 'limit harian habis';
    return 'quota habis';
  }
  if (model.status === 'MODEL_NOT_FOUND') return 'model tidak ditemukan (404)';
  if (model.status === 'TEMPORARILY_UNAVAILABLE') return 'sementara tidak tersedia';
  if (model.status === 'NO_KEY') return 'key belum diisi';
  return model.status.replace(/_/g, ' ').toLowerCase();
};

interface AgentStatus {
  feature: string;
  label: string;
  provider: 'gemini' | 'openai' | 'local';
  apiKeyEnv: string;
  keyConfigured: boolean;
  keyFingerprint: string | null;
  models: ModelSlot[];
}

interface StatusPayload {
  features: AgentStatus[];
  sharedKeys: { keyFingerprint: string; features: string[] }[];
  missingKeys: string[];
  generatedAt: string;
}

const formatCooldown = (seconds: number) => {
  if (seconds <= 0) return '';
  if (seconds < 60) return `${seconds}d`;
  return `${Math.ceil(seconds / 60)}m`;
};

export const ModelStatusIndicator: React.FC = () => {
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const fetchStatus = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/gemini/status');
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.features)) setStatus(data);
      }
    } catch {
      // Quietly handle transient network/boot errors
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  if (!status) return null;

  const agents = status.features;
  const unconfigured = agents.filter(a => !a.keyConfigured);
  const starved = agents.filter(a => a.keyConfigured && !a.models.some(m => m.available));
  const allReady = unconfigured.length === 0 && starved.length === 0;

  const headline = unconfigured.length === agents.length
    ? 'Belum ada agent dikonfigurasi'
    : unconfigured.length > 0
      ? `${unconfigured.length} agent tanpa API key`
      : starved.length > 0
        ? `${starved.length} agent kehabisan model`
        : `${agents.length} agent siap`;

  const toneClasses = allReady
    ? 'bg-emerald-50 text-emerald-600'
    : unconfigured.length === agents.length
      ? 'bg-red-50 text-red-600'
      : 'bg-amber-50 text-amber-600';

  return (
    <div className="fixed du-above-nav right-4 z-50">
      <div className={`bg-white rounded-xl shadow-lg border p-3 flex flex-col gap-2 transition-all ${allReady ? 'border-slate-200' : 'border-amber-300'}`}>
        <div
          className="flex items-center gap-3 cursor-pointer select-none"
          onClick={() => setShowDetails(!showDetails)}
        >
          <div className={`p-2 rounded-lg ${toneClasses}`}>
            <Cpu className="w-5 h-5" />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-bold tracking-wider text-slate-500 uppercase">
              AI Agent Status
            </span>
            <div className="flex items-center gap-1.5">
              {allReady ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              ) : (
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
              )}
              <span className={`text-sm font-bold ${allReady ? 'text-slate-800' : 'text-amber-700'}`}>
                {headline}
              </span>
            </div>
          </div>
        </div>

        {showDetails && (
          <div className="mt-2 pt-2 border-t border-slate-100 text-xs w-80 max-h-96 overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-slate-700">Slot Key & Quota per Agent</span>
              <button onClick={fetchStatus} disabled={isLoading} data-guide="status.agent" className="text-blue-600 hover:text-blue-800">
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {status.sharedKeys.length > 0 && (
              <div className="mb-2 p-2 bg-blue-50 border border-blue-200 rounded text-[10px] text-blue-900 flex items-start gap-1.5">
                <Link2 className="w-3 h-3 shrink-0 mt-0.5" />
                <span>
                  Key dipakai bersama, jadi quota-nya juga dibagi:{' '}
                  {status.sharedKeys.map(s => s.features.join(' + ')).join('; ')}
                </span>
              </div>
            )}

            <div className="space-y-2">
              {agents.map(agent => {
                const activeModel = agent.models.find(m => m.available);
                return (
                  <div
                    key={agent.feature}
                    className={`p-2 rounded border ${
                      !agent.keyConfigured
                        ? 'bg-slate-50 border-slate-200'
                        : activeModel
                          ? 'bg-emerald-50 border-emerald-200'
                          : 'bg-red-50 border-red-200'
                    }`}
                  >
                    <div className="flex justify-between items-start gap-2">
                      <span className="font-semibold text-slate-800">{agent.label}</span>
                      {!agent.keyConfigured ? (
                        <span className="bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded text-[9px] font-bold shrink-0">
                          NO KEY
                        </span>
                      ) : activeModel ? (
                        <span className="bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded text-[9px] font-bold shrink-0">
                          READY
                        </span>
                      ) : (
                        <span className="bg-red-100 text-red-700 px-1.5 py-0.5 rounded text-[9px] font-bold shrink-0">
                          COOLING
                        </span>
                      )}
                    </div>

                    {!agent.keyConfigured ? (
                      <div className="mt-1 text-[10px] text-slate-500 flex items-center gap-1">
                        <KeyRound className="w-3 h-3" />
                        Isi <code className="font-mono text-slate-700">{agent.apiKeyEnv}</code> di .env
                      </div>
                    ) : (
                      <div className="mt-1.5 space-y-1">
                        {agent.models.map((model, index) => (
                          <div key={model.modelId} className="flex items-center justify-between gap-2 text-[10px]">
                            <span className={model.available ? 'text-slate-700' : 'text-red-600'}>
                              {index + 1}. {model.name}
                              {index === 0 && <span className="text-slate-400"> (utama)</span>}
                            </span>
                            {model.available ? (
                              <span className="text-emerald-600 font-semibold shrink-0">
                                {model.successCount > 0 ? `${model.successCount} ok` : 'siap'}
                              </span>
                            ) : (
                              <span className="text-red-600 font-semibold shrink-0 flex items-center gap-1">
                                <Clock className="w-2.5 h-2.5" />
                                {unavailableLabel(model)}
                                {model.cooldownSecondsLeft > 0 && model.quotaScope !== 'minute' && ` ${formatCooldown(model.cooldownSecondsLeft)}`}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {status.missingKeys.length > 0 && (
              <div className="mt-3 p-2 bg-amber-50 text-amber-800 rounded border border-amber-200 text-[10px] leading-tight">
                <strong>Belum dikonfigurasi:</strong> {status.missingKeys.join(', ')}. Isi di file <code className="font-mono">.env</code> lalu restart server.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
