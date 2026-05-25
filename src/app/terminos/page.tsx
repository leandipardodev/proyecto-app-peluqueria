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
          <p>
            Esta version establece las condiciones de uso de Klip para usuarios en Argentina. Al registrarte, acceder o utilizar la plataforma,
            aceptas integramente estos terminos.
          </p>

          <p>
            <strong>1. Aceptacion de los Terminos:</strong> Al registrarse, acceder o utilizar la plataforma Klip (&quot;El Servicio&quot;), el Usuario
            declara haber leido, comprendido y aceptado la totalidad de estos Terminos y Condiciones. Si no esta de acuerdo, debe abstenerse de
            usar el servicio.
          </p>

          <p>
            <strong>2. Naturaleza del Servicio:</strong> Klip es una herramienta de gestion y agenda digital (SaaS). El Proveedor es un facilitador
            tecnologico y no es parte de la relacion comercial, profesional o de servicios que ocurra entre el Usuario (el Comercio) y sus clientes
            finales.
          </p>

          <p>
            <strong>3. Responsabilidad y Limitaciones:</strong>
          </p>
          <p>
            <strong>Servicio &quot;Tal Cual Es&quot;:</strong> El Servicio se proporciona &quot;tal cual es&quot; y &quot;segun disponibilidad&quot;. El Proveedor no
            garantiza que el servicio este libre de errores, interrupciones o fallos tecnicos imprevistos.
          </p>
          <p>
            <strong>Exencion de Danos:</strong> El Proveedor no sera responsable por lucro cesante, perdida de turnos, falta de ingresos o cualquier
            dano indirecto derivado de caidas del sistema, fallas en la conectividad o errores de terceros (como proveedores de APIs, servicios de
            correo o SMS).
          </p>
          <p>
            <strong>Techo de Responsabilidad:</strong> En caso de responsabilidad legal demostrada contra el Proveedor, el monto maximo de
            indemnizacion no superara el valor del abono pagado por el Usuario durante el ultimo mes de servicio.
          </p>

          <p>
            <strong>4. Obligaciones del Usuario (Comercio):</strong>
          </p>
          <p>
            <strong>Gestion de Contenido:</strong> El Usuario es el unico responsable de la exactitud de los precios, horarios, servicios y cualquier
            informacion publicada en Klip.
          </p>
          <p>
            <strong>Proteccion de Datos:</strong> El Usuario actua como Responsable de la Base de Datos de sus clientes. El Proveedor actua
            exclusivamente como Encargado del Tratamiento. El Usuario garantiza que cuenta con las autorizaciones legales necesarias para recopilar y
            tratar los datos personales de sus clientes conforme a la Ley N 25.326.
          </p>
          <p>
            <strong>Seguridad:</strong> Es responsabilidad del Usuario proteger sus credenciales de acceso. El Proveedor no sera responsable por
            accesos no autorizados derivados de la negligencia del Usuario.
          </p>

          <p>
            <strong>5. Propiedad Intelectual:</strong> Todo el software, codigo, diseno, logo y logotipos de Klip son propiedad exclusiva del
            Proveedor. Queda prohibida la copia, modificacion, ingenieria inversa o uso no autorizado de los mismos.
          </p>

          <p>
            <strong>6. Suspension y Baja del Servicio:</strong> El Proveedor se reserva el derecho de suspender o cancelar el acceso a la cuenta del
            Usuario ante cualquier incumplimiento de estos terminos, falta de pago o actividad fraudulenta, sin previo aviso y sin derecho a reclamo.
            El Usuario es responsable de exportar su informacion antes de la cancelacion definitiva de su cuenta.
          </p>

          <p>
            <strong>7. Pagos y Suscripciones:</strong> Los abonos son prepagos. El acceso al Servicio se renovara automaticamente salvo aviso de baja
            por parte del Usuario. No se realizan reembolsos por periodos no utilizados una vez abonado el mes en curso.
          </p>

          <p>
            <strong>8. Jurisdiccion y Ley Aplicable:</strong> Cualquier controversia derivada de estos terminos sera resuelta ante los Tribunales
            Ordinarios de la Ciudad de La Plata, renunciando las partes a cualquier otro fuero o jurisdiccion.
          </p>

          <p>Soporte oficial: <a className="font-medium text-[#0071E3]" href="mailto:soporte@klip.com.ar">soporte@klip.com.ar</a>.</p>
        </div>
      </div>
    </main>
  );
}
