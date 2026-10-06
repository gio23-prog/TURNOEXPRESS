export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-950 to-slate-900 text-white flex flex-col items-center justify-center p-6">
      <div className="max-w-2xl w-full bg-white/10 backdrop-blur-md rounded-2xl p-8 shadow-2xl border border-white/20 text-center">
        <span className="bg-purple-500/20 text-purple-300 text-xs font-semibold px-3 py-1 rounded-full uppercase tracking-widest border border-purple-500/30">
          Sistema de Gestión
        </span>
      
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mt-4 mb-2">
          TURNO<span className="text-purple-400">EXPRESS</span>
        </h1>
        
        <p className="text-slate-300 text-base md:text-lg mb-8">
          Optimiza la gestión de tus turnos y filas de manera rápida, ordenada y sin esperas innecesarias.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
           <a href="/turno" className="bg-purple-600 hover:bg-purple-500 text-white font-medium px-6 py-3 rounded-xl transition-all shadow-lg hover:shadow-purple-500/25 text-center">
            Solicitar un Turno
          </a>
          
          <button className="bg-slate-800/80 hover:bg-slate-700 text-slate-200 font-medium px-6 py-3 rounded-xl transition-all border border-slate-700">
            Ver Estado de Pantalla
          </button>
        </div>
      </div>
      
      <footer className="mt-12 text-slate-500 text-sm">
        TURNOEXPRESS &copy; 2026 &bull; Todos los derechos reservados
      </footer>
    </main>
  );
}