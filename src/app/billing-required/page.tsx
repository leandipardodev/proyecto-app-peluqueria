import Link from "next/link";

export default function BillingRequiredPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md text-center">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-10 space-y-6">
          <div className="mx-auto w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center">
            <svg
              className="w-8 h-8 text-amber-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>

          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Acceso restringido
            </h1>
            <p className="mt-3 text-gray-600 text-sm leading-relaxed">
              Tu plan ha expirado o la cuenta está inactiva. Para volver a
              acceder a tu panel de gestión, necesitás renovar tu suscripción.
            </p>
          </div>

          <div className="bg-amber-50 rounded-lg p-4 text-sm text-amber-800">
            <p>
              Si creés que esto es un error o necesitás más tiempo, contactanos
              directamente.
            </p>
          </div>

          <div className="flex flex-col gap-3 pt-2">
            <a
              href="mailto:soporte@klip.app"
              className="inline-flex items-center justify-center gap-2 bg-violet-600 text-white py-2.5 px-6 rounded-lg text-sm font-medium hover:bg-violet-700 transition-colors cursor-pointer select-none"
            >
              Contactar Soporte
            </a>
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-2 border border-gray-300 bg-white py-2.5 px-6 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer select-none"
            >
              Volver al Login
            </Link>
          </div>
        </div>

        <p className="mt-6 text-xs text-gray-400">
          Klip — Sistema de gestión para peluquerías
        </p>
      </div>
    </div>
  );
}
