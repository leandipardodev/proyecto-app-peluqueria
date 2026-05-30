import Link from "next/link";

export default function PrivacidadPage() {
  return (
    <main className="min-h-screen bg-[#FBFBFC] px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_10px_30px_rgba(0,0,0,0.04)] sm:p-10">
        <div className="mb-6 flex items-center justify-between gap-3">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#1D1D1F]">Política de Privacidad - Klip</h1>
          <Link href="/" className="rounded-full border border-slate-200 px-4 py-1.5 text-sm text-[#1D1D1F] hover:bg-slate-50">Volver</Link>
        </div>

        <div className="space-y-4 text-sm leading-6 text-slate-700">
          <p>
            En Klip nos comprometemos a proteger la privacidad de los datos personales de nuestros usuarios y clientes.
            Esta política describe qué información recolectamos, cómo la usamos y cuáles son tus derechos conforme a la
            Ley N° 25.326 de Protección de Datos Personales de la República Argentina.
          </p>

          <p>
            <strong>1. Responsable del Tratamiento:</strong> Klip (en adelante &quot;el Proveedor&quot;), contacto:
            <a className="font-medium text-[#0071E3]" href="mailto:soporte@klip.com.ar"> soporte@klip.com.ar</a>.
          </p>

          <p>
            <strong>2. Datos que Recolectamos:</strong>
          </p>
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>Datos de registro:</strong> nombre, correo electrónico y contraseña al crear una cuenta.</li>
            <li><strong>Datos del negocio:</strong> nombre del local, dirección, teléfono, horarios, servicios ofrecidos.</li>
            <li><strong>Datos de clientes:</strong> nombre, teléfono, correo electrónico, historial de visitas y preferencias (ingresados por el negocio).</li>
            <li><strong>Datos de pago:</strong> información de transacciones procesadas a través de Mercado Pago. Klip no almacena números de tarjeta ni datos bancarios.</li>
            <li><strong>Datos de navegación:</strong> dirección IP, tipo de navegador, páginas visitadas y duración de la sesión.</li>
          </ul>

          <p>
            <strong>3. Finalidad del Tratamiento:</strong>
          </p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Prestar el servicio de gestión de turnos, agenda y facturación.</li>
            <li>Procesar pagos a través de Mercado Pago.</li>
            <li>Enviar recordatorios de turnos y comunicaciones operativas.</li>
            <li>Mejorar la plataforma y analizar su uso.</li>
            <li>Cumplir con obligaciones legales y fiscales.</li>
          </ul>

          <p>
            <strong>4. Base Legal:</strong> El tratamiento de datos se basa en:
          </p>
          <ul className="list-disc pl-6 space-y-1">
            <li>La ejecución del contrato de servicios entre el Usuario y el Proveedor.</li>
            <li>El consentimiento del titular de los datos al aceptar esta política y los términos de uso.</li>
            <li>El interés legítimo del Proveedor en mejorar y proteger la plataforma.</li>
          </ul>

          <p>
            <strong>5. Conservación de Datos:</strong> Conservamos los datos personales mientras la cuenta del Usuario esté activa. Al darse de baja,
            los datos se eliminan dentro de los 30 días posteriores, excepto aquellos que debamos retener por obligaciones legales o fiscales.
          </p>

          <p>
            <strong>6. Compartición con Terceros:</strong> Klip comparte datos únicamente con:
          </p>
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>Mercado Pago:</strong> para procesar pagos.</li>
            <li><strong>Resend:</strong> para el envío de correos electrónicos.</li>
            <li><strong>Supabase:</strong> como proveedor de base de datos y autenticación.</li>
            <li><strong>Sentry:</strong> para monitoreo de errores (opcional, sin datos personales).</li>
          </ul>
          <p>No vendemos datos personales a terceros bajo ninguna circunstancia.</p>

          <p>
            <strong>7. Derechos del Titular (ARCO):</strong> Conforme a la Ley N° 25.326, podés ejercer tus derechos de
            <strong> Acceso, Rectificación, Cancelación y Oposición</strong> contactándonos a
            <a className="font-medium text-[#0071E3]" href="mailto:soporte@klip.com.ar"> soporte@klip.com.ar</a>.
            Responderemos a tu solicitud dentro de los 10 días hábiles.
          </p>

          <p>
            <strong>8. Seguridad:</strong> Implementamos medidas técnicas y organizativas adecuadas para proteger los datos personales contra
            acceso no autorizado, alteración, divulgación o destrucción. Esto incluye cifrado TLS, RLS en base de datos y autenticación segura.
          </p>

          <p>
            <strong>9. Transferencia Internacional:</strong> Podemos utilizar servicios de terceros que operan servidores fuera de Argentina
            (Estados Unidos, Unión Europea). Al usar Klip, consentís esta transferencia en los términos de la Ley N° 25.326.
          </p>

          <p>
            <strong>10. Cookies:</strong> Utilizamos cookies esenciales para el funcionamiento de la plataforma (autenticación, preferencias).
            No utilizamos cookies de rastreo publicitario sin consentimiento explícito.
          </p>

          <p>
            <strong>11. Cambios a esta Política:</strong> Podemos actualizar esta política periódicamente. Los cambios serán notificados
            a través de la plataforma o por correo electrónico. El uso continuado del servicio implica la aceptación de los cambios.
          </p>

          <p>
            <strong>12. Contacto:</strong> Para consultas sobre esta política o para ejercer tus derechos, escribinos a
            <a className="font-medium text-[#0071E3]" href="mailto:soporte@klip.com.ar"> soporte@klip.com.ar</a>.
          </p>
        </div>
      </div>
    </main>
  );
}
