import Link from "next/link";

interface ConfirmacionPageProps {
  searchParams: Promise<{ status?: string; slug?: string }>;
}

export default async function ConfirmacionPage({ searchParams }: ConfirmacionPageProps) {
  const { status, slug } = await searchParams;

  const isSuccess = status === "success";
  const isPending = status === "pending";

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
      <div className="w-full max-w-md text-center">
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-10 space-y-6">
          {isSuccess ? (
            <>
              <div className="mx-auto w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                Pago aprobado
              </h1>
              <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                Gracias por tu pago. Te vamos a contactar para coordinar el turno.
              </p>
            </>
          ) : isPending ? (
            <>
              <div className="mx-auto w-16 h-16 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                Pago pendiente
              </h1>
              <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                El pago está siendo procesado. Te confirmaremos por email cuando se acredite.
              </p>
            </>
          ) : (
            <>
              <div className="mx-auto w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                Pago cancelado
              </h1>
              <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                El pago no se completó. Podés volver a intentarlo cuando quieras.
              </p>
            </>
          )}

          <div className="pt-2">
            <Link
              href={slug ? `/book/${slug}` : "/"}
              className="inline-flex items-center justify-center gap-2 bg-violet-600 text-white py-2.5 px-6 rounded-lg text-sm font-medium hover:bg-violet-700 transition-colors"
            >
              Volver a reservas
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
