import Link from "next/link";

export default function TerminosPage() {
  return (
    <main className="min-h-screen bg-[#FBFBFC] px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_10px_30px_rgba(0,0,0,0.04)] sm:p-10">
        <div className="mb-6 flex items-center justify-between gap-3">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#1D1D1F]">Terminos y Condiciones de Uso - Klip</h1>
          <Link href="/" className="rounded-full border border-slate-200 px-4 py-1.5 text-sm text-[#1D1D1F] hover:bg-slate-50">Volver</Link>
        </div>

        <div className="space-y-4 text-sm leading-6 text-slate-700">
          <p>Al crear una cuenta en Klip, aceptas expresamente los siguientes terminos:</p>
          <p><strong>Naturaleza del Servicio:</strong> Klip es una plataforma SaaS de gestion de turnos. El Proveedor no presta servicios de peluqueria ni estetica; la relacion comercial es exclusivamente entre el local y sus clientes finales.</p>
          <p><strong>Exencion de Responsabilidad:</strong> El Proveedor no se hace responsable por perdidas economicas, lucro cesante o perdida de turnos derivados de caidas del sistema, fallas en la base de datos o errores en el envio de notificaciones (Resend/Amazon). El software se entrega "tal cual es".</p>
          <p><strong>Responsabilidad del Comercio:</strong> El local es el unico responsable de los precios, horarios y servicios publicados, asi como del cumplimiento de la Ley de Proteccion de Datos Personales respecto a sus clientes.</p>
          <p><strong>Limitacion de Indemnidad:</strong> Ante cualquier eventual reclamo judicial, la responsabilidad maxima del Proveedor no superara el equivalente a un (1) mes del abono pagado por el Cliente.</p>
          <p><strong>Jurisdiccion:</strong> Para cualquier controversia, las partes se someten a los Tribunales Ordinarios de la Ciudad de La Plata, renunciando a cualquier otro fuero.</p>
          <p>Soporte oficial: <a className="font-medium text-[#0071E3]" href="mailto:soporte@klip.com.ar">soporte@klip.com.ar</a>.</p>
        </div>
      </div>
    </main>
  );
}
