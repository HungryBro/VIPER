import { useAuth } from '../auth/AuthContext';


export default function LoginPage() {
  const { error, login } = useAuth();

  return (
    <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-6">
      <section className="w-full max-w-md rounded-2xl border border-teal-500/30 bg-slate-900 p-8 shadow-2xl shadow-teal-950/40">
        <div className="mb-7 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-teal-500/15 text-2xl font-black text-teal-300 ring-1 ring-teal-400/30">
            V
          </div>
          <h1 className="text-2xl font-black tracking-wide text-teal-300">VIPER</h1>
          <p className="mt-2 text-sm text-slate-400">
            Visual Image Processing &amp; Evaluation Resource
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={login}
          className="flex w-full items-center justify-center gap-3 rounded-xl bg-white px-4 py-3 font-bold text-slate-800 transition hover:bg-slate-100 active:scale-[0.99]"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-sm font-black text-blue-600">G</span>
          Sign in with Google
        </button>

        <p className="mt-5 text-center text-xs leading-relaxed text-slate-500">
          Sign in is required to build workflows and use the VIPER platform.
        </p>
      </section>
    </main>
  );
}
