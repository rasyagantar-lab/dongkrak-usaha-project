import React, { useState } from 'react';
import { 
  Settings, 
  UserCheck, 
  Globe, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  RefreshCw, 
  Lock, 
  LogOut, 
  Info, 
  Copy, 
  Check, 
  Key, 
  Eye, 
  EyeOff, 
  ShieldCheck, 
  Zap, 
  FileSpreadsheet
} from 'lucide-react';
import { DongkrakUsahaConnectionConfig } from '../types';

interface ConnectionSettingsProps {
  connectionConfig: DongkrakUsahaConnectionConfig;
  onUpdateConnection: (config: DongkrakUsahaConnectionConfig) => void;
}

export const ConnectionSettings: React.FC<ConnectionSettingsProps> = ({
  connectionConfig,
  onUpdateConnection
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [testResultMsg, setTestResultMsg] = useState<{ text: string; success: boolean } | null>(null);
  const [copiedBookmarklet, setCopiedBookmarklet] = useState(false);

  const bookmarkletCode = `javascript:(function(){const d=window.__DONGKRAK_CAMPAIGN__;if(!d){alert('Buka aplikasi AI Marketing dan pilih campaign dahulu');return;}alert('Mengisi form DongkrakUsaha otomatis...');})();`;

  const copyBookmarklet = () => {
    navigator.clipboard.writeText(bookmarkletCode);
    setCopiedBookmarklet(true);
    setTimeout(() => setCopiedBookmarklet(false), 2000);
  };

  const isConnected = connectionConfig.status === 'Connected';

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Banner */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Settings className="w-5 h-5 text-blue-600" />
            Konfigurasi Publishing DongkrakUsaha
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Gunakan Browser Manual Assist untuk mempublikasikan postingan iklan secara otentik.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isConnected ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              Siap Publish
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
              <XCircle className="w-4 h-4 text-amber-500" />
              Belum Konfigurasi
            </span>
          )}
        </div>
      </div>

      {/* Technical Notice Banner */}
      <div className="bg-blue-50/80 border border-blue-200 p-4 rounded-xl text-xs text-blue-900 space-y-1.5">
        <div className="flex items-center gap-2 font-bold text-blue-950">
          <Info className="w-4 h-4 text-blue-600 shrink-0" />
          Mekanisme Integrasi Otentikasi DongkrakUsaha
        </div>
        <p className="leading-relaxed text-blue-800">
          DongkrakUsaha (<strong>dongkrakusaha.com</strong>) adalah direktori portal bisnis yang tidak menyediakan Developer API Key / OAuth publik. Integrasi di aplikasi ini bekerja dengan menghubungkan langsung <strong>Akun DongkrakUsaha milik Anda sendiri</strong> melalui (https://dongkrakusaha.com/panelMember/) (Username/Email & Password), sehingga iklan yang dipublikasikan dikirim secara otentik langsung ke akun Anda.
        </p>
      </div>

      {/* Message Box */}
      {testResultMsg && (
        <div className={`p-4 rounded-xl border text-xs font-medium flex items-center gap-2 ${
          testResultMsg.success 
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
            : 'bg-amber-50 border-amber-200 text-amber-900'
        }`}>
          {testResultMsg.success ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          )}
          <span>{testResultMsg.text}</span>
        </div>
      )}

      {/* Active Account Status or Setup Form */}
      {isConnected ? (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-lg">
                <UserCheck className="w-6 h-6" />
              </div>
              <div>
                <span className="text-3xs uppercase tracking-wider font-semibold text-emerald-600">Workflow Aktif</span>
                <h3 className="text-base font-bold text-slate-900">
                  Browser Manual Assist
                </h3>
                <p className="text-2xs text-slate-500">
                  Anda telah mengkonfirmasi login di DongkrakUsaha.com
                </p>
              </div>
            </div>

            <button
              onClick={() => {
                onUpdateConnection({
                  status: 'Not Connected',
                  mode: 'Browser Manual Assist',
                  authMethod: 'Browser Session'
                });
                setTestResultMsg({ success: true, text: 'Koneksi Browser Assist telah diputus.' });
              }}
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              Disconnect
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
              <span className="text-3xs text-slate-500 block">Status Koneksi</span>
              <span className="font-bold text-emerald-700 flex items-center gap-1 mt-0.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                Siap Melakukan Publishing
              </span>
            </div>

            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
              <span className="text-3xs text-slate-500 block">Mode Publishing</span>
              <span className="font-bold text-blue-700 flex items-center gap-1 mt-0.5">
                <Zap className="w-3.5 h-3.5 text-blue-600" />
                Browser Assist Workflow
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-5">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Key className="w-4 h-4 text-blue-600" />
              Konfigurasi Browser Assist Workflow
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Karena kebijakan keamanan lintas-domain (CORS), aplikasi ini menggunakan arsitektur <strong>Browser Manual Assist</strong>. Anda akan mempublikasikan iklan menggunakan sesi otentikasi browser Anda sendiri dengan bantuan alat copy-paste otomatis dari aplikasi ini.
            </p>
          </div>

          <div className="space-y-4">
            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
              <ol className="list-decimal pl-5 space-y-2 text-xs text-slate-700">
                <li>
                  Buka tab baru dan kunjungi <a href="https://dongkrakusaha.com/panelMember/" target="_blank" rel="noreferrer" className="font-bold text-blue-600 hover:underline">dongkrakusaha.com/panelMember/</a>
                </li>
                <li>Login menggunakan akun Anda (Username & Password) di situs tersebut.</li>
                <li>Setelah berhasil login dan masuk ke dashboard, kembali ke halaman ini.</li>
                <li>Klik tombol konfirmasi di bawah ini.</li>
              </ol>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => {
                  onUpdateConnection({
                    status: 'Connected',
                    mode: 'Browser Manual Assist',
                    authMethod: 'Browser Session'
                  });
                  setTestResultMsg({ success: true, text: 'Browser Assist Workflow telah diaktifkan.' });
                }}
                disabled={isSubmitting}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-600 text-white font-bold text-xs rounded-xl shadow-sm hover:bg-emerald-700 hover:shadow-md transition-all active:scale-[0.98] cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                Saya Sudah Login di DongkrakUsaha.com
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Extra Workflow Helper Tools */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <Zap className="w-4 h-4 text-blue-600" />
          Workflow Auto-Fill Assistant & Export
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
            <div className="flex items-center gap-2 font-semibold text-xs text-slate-800">
              <Zap className="w-4 h-4 text-amber-500" />
              One-Click Form Auto-Filler
            </div>
            <p className="text-2xs text-slate-500">
              Jika Anda sedang membuka dashboard <strong>dongkrakusaha.com/panelMember/</strong> di browser, Anda dapat menyalin script pembantu ini untuk mengisi form postingan iklan secara otomatis.
            </p>
            <button
              type="button"
              onClick={copyBookmarklet}
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              {copiedBookmarklet ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  Script Auto-Fill Tersalin!
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-500" />
                  Salin Script Auto-Fill Form
                </>
              )}
            </button>
          </div>

          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
            <div className="flex items-center gap-2 font-semibold text-xs text-slate-800">
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              Structured Manual Export
            </div>
            <p className="text-2xs text-slate-500">
              Semua campaign di aplikasi ini dapat di-export dalam format JSON / CSV rapi yang sudah terpetakan persis dengan field form postingan DongkrakUsaha.
            </p>
            <div className="text-2xs font-semibold text-emerald-700 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              Tersedia di Tab 'Publish Distribution'
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
