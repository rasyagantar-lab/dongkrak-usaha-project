import React from 'react';
import { AlertTriangle, RefreshCw, ClipboardCopy } from 'lucide-react';

/*
  A render error used to take the whole app to a white screen, with nothing on it to
  report and no way back except reloading the tab. That is the worst possible failure
  for an operator mid-run: they cannot tell what broke, and we cannot fix what we
  cannot see.

  Each tab is wrapped separately, so a crash in one panel leaves the rest of the app
  usable, shows what happened, and offers the two things that actually help: try this
  tab again (re-mount, keeps the session and any running job), or copy the details.
*/

// Errors that never reach a boundary -- a rejected fetch, a handler, a failed image --
// leave no trace once a later render dies. Keeping the last few means the copied
// report can say what happened BEFORE the crash, which is usually the real cause.
const breadcrumbs: string[] = [];
const noteBreadcrumb = (what: string) => {
  breadcrumbs.push(`${new Date().toLocaleTimeString('id-ID')} ${what}`);
  if (breadcrumbs.length > 6) breadcrumbs.shift();
};
if (typeof window !== 'undefined' && !(window as any).__duErrorTap) {
  (window as any).__duErrorTap = true;
  window.addEventListener('error', e => noteBreadcrumb(`error: ${e.message}`));
  window.addEventListener('unhandledrejection', e => {
    const r: any = (e as PromiseRejectionEvent).reason;
    noteBreadcrumb(`promise: ${String(r?.message || r || '').slice(0, 160)}`);
  });
}

interface Props { label: string; children: React.ReactNode; }
interface State { error: Error | null; info: string; attempt: number; }

// No @types/react is installed in this project, so React -- and therefore
// React.Component -- is an implicit any to the compiler and inherited members are
// invisible. Declaring the two we use keeps this file type-checked without adding a
// types package (declare emits nothing, so runtime behaviour is untouched).
export class ErrorBoundary extends React.Component<Props, State> {
  declare props: Props;
  declare setState: (update: Partial<State> | ((prev: State) => Partial<State>)) => void;
  state: State = { error: null, info: '', attempt: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Keep it in the console too: the extension console panel and any support session
    // can read it there even after the operator clicks "coba lagi".
    console.error(`[UI] ${this.props.label} crashed:`, error, info.componentStack);
    this.setState({ info: (info.componentStack || '').split('\n').slice(0, 6).join('\n') });
  }

  private reset = () => this.setState(s => ({ error: null, info: '', attempt: s.attempt + 1 }));

  private copy = () => {
    const { error, info } = this.state;
    const text = [
      `Bagian: ${this.props.label}`,
      `${error?.name}: ${error?.message}`,
      error?.stack?.split('\n').slice(0, 5).join('\n') || '',
      info,
      breadcrumbs.length ? `Sebelum error:\n${breadcrumbs.join('\n')}` : ''
    ].filter(Boolean).join('\n');
    navigator.clipboard?.writeText(text).catch(() => { /* clipboard blocked; console has it */ });
  };

  render() {
    const { error } = this.state;
    if (!error) return <React.Fragment key={this.state.attempt}>{this.props.children}</React.Fragment>;
    return (
      <div className="max-w-2xl mx-auto my-8 rounded-xl border border-rose-200 bg-rose-50 p-5 space-y-3">
        <div className="flex items-start gap-2.5">
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-rose-900">{this.props.label} berhenti karena error</h3>
            <p className="text-xs text-rose-800 mt-1 leading-relaxed">
              Bagian lain tetap jalan, dan pekerjaan yang sedang berjalan di latar belakang tidak dibatalkan.
              Tekan "Coba lagi" untuk memuat ulang bagian ini saja. Kalau terulang, kirim hasil "Salin detail error".
            </p>
          </div>
        </div>
        <pre className="text-3xs text-rose-900/90 bg-white/70 border border-rose-200 rounded-lg p-2.5 overflow-x-auto whitespace-pre-wrap">
          {error.name}: {error.message}
        </pre>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={this.reset} className="inline-flex items-center gap-1.5 px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg cursor-pointer">
            <RefreshCw className="w-3.5 h-3.5" /> Coba lagi
          </button>
          <button type="button" onClick={this.copy} className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-rose-300 text-rose-800 text-xs font-bold rounded-lg cursor-pointer">
            <ClipboardCopy className="w-3.5 h-3.5" /> Salin detail error
          </button>
        </div>
      </div>
    );
  }
}
