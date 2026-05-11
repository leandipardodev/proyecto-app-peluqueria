import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <nav className="flex items-center justify-between py-6">
          <div className="text-2xl font-bold text-violet-700">Klip</div>
          <div className="flex gap-3">
            <Link
              href="/login"
              className="px-4 py-2 text-sm font-medium text-violet-700 hover:text-violet-800 transition-colors cursor-pointer select-none"
            >
              Iniciar Sesión
            </Link>
            <Link
              href="/register"
              className="px-4 py-2 text-sm font-medium bg-violet-600 text-white rounded-2xl shadow-sm hover:bg-violet-700 transition-colors cursor-pointer select-none"
            >
              Registrarse
            </Link>
          </div>
        </nav>

        <div className="flex flex-col items-center justify-center min-h-[80vh] text-center">
          <h1 className="text-5xl sm:text-6xl font-semibold text-gray-900 mb-6 tracking-tight">
            Gestioná tu <span className="text-violet-600">peluquería</span> con Klip
          </h1>
          <p className="text-xl text-gray-600 mb-10 max-w-2xl">
            Sistema todo-en-uno para gestionar turnos, servicios e inventario.
            Probado por peluquerías, diseñado para vos.
          </p>

          <div className="flex flex-col sm:flex-row gap-4">
            <Link
              href="/register"
              className="px-8 py-3 bg-violet-600 text-white rounded-2xl shadow-sm font-medium hover:bg-violet-700 transition-colors text-lg cursor-pointer select-none"
            >
              Comenzar Ahora
            </Link>
            <Link
              href="/login"
              className="px-8 py-3 border-2 border-violet-600 text-violet-600 rounded-2xl font-medium hover:bg-violet-50 transition-colors text-lg cursor-pointer select-none"
            >
              Ya tengo cuenta
            </Link>
          </div>

          <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-8 max-w-3xl w-full">
            <div className="p-8 bg-white/20 dark:bg-black/20 backdrop-blur-2xl rounded-[2.5rem] border border-white/10 dark:border-white/5 border-t border-l border-t-white/60 border-l-white/60 dark:border-t-white/20 dark:border-l-white/20 shadow-2xl shadow-black/[0.03]">
              <div className="text-3xl mb-3">📅</div>
              <h3 className="font-semibold text-gray-900 mb-2 tracking-tight">Turnos</h3>
              <p className="text-sm text-gray-600">Gestioná las citas de tus clientes</p>
            </div>
            <div className="p-8 bg-white/20 dark:bg-black/20 backdrop-blur-2xl rounded-[2.5rem] border border-white/10 dark:border-white/5 border-t border-l border-t-white/60 border-l-white/60 dark:border-t-white/20 dark:border-l-white/20 shadow-2xl shadow-black/[0.03]">
              <div className="text-3xl mb-3">✂️</div>
              <h3 className="font-semibold text-gray-900 mb-2 tracking-tight">Servicios</h3>
              <p className="text-sm text-gray-600">Administrá tu catálogo de servicios</p>
            </div>
            <div className="p-8 bg-white/20 dark:bg-black/20 backdrop-blur-2xl rounded-[2.5rem] border border-white/10 dark:border-white/5 border-t border-l border-t-white/60 border-l-white/60 dark:border-t-white/20 dark:border-l-white/20 shadow-2xl shadow-black/[0.03]">
              <div className="text-3xl mb-3">📦</div>
              <h3 className="font-semibold text-gray-900 mb-2 tracking-tight">Inventario</h3>
              <p className="text-sm text-gray-600">Controlá tu stock en tiempo real</p>
            </div>
          </div>

          <p className="mt-12 text-sm text-gray-500">
            Versión 0.1.0 - Disponible para testing
          </p>
        </div>
      </div>
    </main>
  );
}
