import type { Metadata } from "next";
import { LEGAL_CONTACT_EMAIL, LegalDocument, LegalList, LegalSection } from "@/components/legal/legal-document";

export const metadata: Metadata = {
  title: "Términos de Servicio — Kristall Film",
  description: "Condiciones de uso del sistema de gestión de Kristall Film y de sus comunicaciones automáticas.",
};

export default function TerminosPage() {
  const mail = <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="underline underline-offset-2">{LEGAL_CONTACT_EMAIL}</a>;

  return (
    <LegalDocument
      title="Términos de Servicio"
      intro="Estos términos regulan el uso del sistema de gestión de Kristall Film (crm.kristallfilm.com) y de las comunicaciones que se envían desde él. Al iniciar sesión o al usar un link o servicio del sistema, aceptás estas condiciones."
    >
      <LegalSection n={1} title="Qué es este servicio">
        <p>
          Es un sistema de gestión comercial que Kristall Film usa para administrar contactos, presupuestos, ventas,
          stock, pagos, remitos, garantías y comunicaciones con clientes, instaladores y distribuidores. No es un
          servicio abierto al público ni se ofrece como producto a terceros: el acceso lo otorga Kristall.
        </p>
      </LegalSection>

      <LegalSection n={2} title="Cuentas y acceso">
        <LegalList
          items={[
            "las cuentas las crea y administra Kristall; no hay registro abierto;",
            "cada cuenta es personal e intransferible, y quien la usa es responsable de lo que se haga con ella;",
            "el rol asignado (operador, administrador o superadministrador) define qué se puede ver y hacer;",
            "tenés que cuidar tu contraseña y avisarnos de inmediato si sospechás que alguien más accedió.",
          ]}
        />
      </LegalSection>

      <LegalSection n={3} title="Uso aceptable">
        <p>Está prohibido:</p>
        <LegalList
          items={[
            "acceder a datos o funciones para las que no tenés permiso, o intentar eludir los controles de seguridad;",
            "copiar, exportar o usar información de clientes para fines ajenos al trabajo en Kristall;",
            "cargar datos de terceros sin derecho a hacerlo, o datos falsos;",
            "enviar mensajes no solicitados, engañosos o abusivos a través de los canales del sistema;",
            "alterar, desmontar o hacer ingeniería inversa del sistema, o sobrecargarlo deliberadamente.",
          ]}
        />
      </LegalSection>

      <LegalSection n={4} title="Datos que se cargan">
        <p>
          Quien carga información en el sistema declara que tiene derecho a hacerlo y que la usará solo para la tarea
          que tiene asignada. Los datos de clientes e instaladores son confidenciales. El tratamiento de datos
          personales se rige por nuestra <a href="/privacidad" className="underline underline-offset-2">Política de Privacidad</a>.
        </p>
      </LegalSection>

      <LegalSection n={5} title="Comunicaciones por WhatsApp y correo">
        <p>
          El sistema envía mensajes automáticos, por ejemplo el aviso de un pedido de turno a un instalador, el pedido
          de datos a un cliente, y los comprobantes y garantías por correo. Al usar el servicio de WhatsApp Business de
          Meta, esas comunicaciones también se rigen por las condiciones de Meta y de WhatsApp, incluida su política
          comercial. Quien reciba un mensaje puede pedir que no se le escriba más, avisándonos por cualquier medio o
          en {mail}.
        </p>
      </LegalSection>

      <LegalSection n={6} title="Remitos, garantías y links personales">
        <p>
          Los remitos y las garantías que se emiten desde el sistema valen según sus condiciones particulares. Los
          links personales (para firmar un remito, consultar una garantía o cargar datos) funcionan como una llave:
          son para la persona a quien se enviaron y no deben reenviarse ni publicarse.
        </p>
      </LegalSection>

      <LegalSection n={7} title="Funciones con inteligencia artificial">
        <p>
          Algunas funciones usan inteligencia artificial para redactar o resumir. Sus resultados pueden contener
          errores: quien las usa debe revisarlos antes de enviarlos o de tomar una decisión. La IA no decide por
          Kristall.
        </p>
      </LegalSection>

      <LegalSection n={8} title="Propiedad intelectual">
        <p>
          El software, el diseño y los contenidos del sistema, y las marcas Kristall y Kristall Film, pertenecen a sus
          titulares. Usar el sistema no transfiere ningún derecho sobre ellos: solo se permite usarlo para el fin para
          el que se te dio acceso.
        </p>
      </LegalSection>

      <LegalSection n={9} title="Disponibilidad y límites de responsabilidad">
        <p>
          Hacemos lo razonable para que el sistema funcione sin interrupciones, pero lo ofrecemos «tal cual está» y
          puede haber cortes por mantenimiento o por causas ajenas, como fallas de proveedores. En la medida en que la
          ley lo permita, Kristall no responde por pérdidas indirectas ni por interrupciones de servicios de terceros
          (por ejemplo, Meta o el correo). Esto no limita derechos que la ley reconoce a los consumidores ni
          responsabilidades que no puedan excluirse.
        </p>
      </LegalSection>

      <LegalSection n={10} title="Suspensión y baja">
        <p>
          Podemos suspender o dar de baja una cuenta si se incumplen estos términos, si hay riesgo para la seguridad
          o cuando termina la relación con la persona. Los datos de la cuenta se conservan según lo que dice la
          Política de Privacidad.
        </p>
      </LegalSection>

      <LegalSection n={11} title="Cambios">
        <p>
          Podemos modificar estos términos. Publicaremos la versión nueva en esta página con su fecha. Seguir usando el
          sistema después del cambio implica que lo aceptás.
        </p>
      </LegalSection>

      <LegalSection n={12} title="Ley aplicable y contacto">
        <p>
          Estos términos se rigen por las leyes de la República Argentina. Cualquier controversia se someterá a los
          tribunales ordinarios competentes de la República Argentina. Consultas: {mail}.
        </p>
      </LegalSection>
    </LegalDocument>
  );
}
