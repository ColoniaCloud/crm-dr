import type { Metadata } from "next";
import { LEGAL_CONTACT_EMAIL, LegalDocument, LegalList, LegalSection } from "@/components/legal/legal-document";

export const metadata: Metadata = {
  title: "Política de Privacidad — Kristall Film",
  description: "Cómo Kristall Film trata los datos personales en su sistema de gestión y en sus comunicaciones por WhatsApp y correo.",
};

export default function PrivacidadPage() {
  const mail = <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="underline underline-offset-2">{LEGAL_CONTACT_EMAIL}</a>;

  return (
    <LegalDocument
      title="Política de Privacidad"
      intro="Esta política explica qué datos personales trata Kristall Film en su sistema de gestión (crm.kristallfilm.com) y en las comunicaciones que se envían desde él, para qué los usa, con quién los comparte y qué derechos tenés sobre ellos."
    >
      <LegalSection n={1} title="Quiénes somos y a quién alcanza">
        <p>
          Kristall Film («Kristall», «nosotros») es una marca de láminas para vidrios que se vende a través de
          distribuidores e instaladores. Este sistema es una herramienta interna: lo usa nuestro equipo para atender
          a las personas con las que trabajamos. No es un sitio de registro abierto.
        </p>
        <p>Esta política alcanza a:</p>
        <LegalList
          items={[
            "clientes, instaladores y distribuidores, y personas que nos consultaron y todavía no compraron;",
            "usuarios finales de una garantía (por ejemplo, el dueño de un vehículo o de una obra);",
            "quienes nos escriben o reciben mensajes nuestros por WhatsApp o correo;",
            "los integrantes del equipo que tienen cuenta en el sistema.",
          ]}
        />
      </LegalSection>

      <LegalSection n={2} title="Qué datos tratamos">
        <LegalList
          items={[
            <><strong>Identificación y contacto:</strong> nombre, empresa, teléfono, email, dirección, provincia y país.</>,
            <><strong>Datos comerciales:</strong> presupuestos, ventas, pagos, remitos (incluida la firma de recepción), stock entregado y condiciones acordadas.</>,
            <><strong>Garantías y reclamos:</strong> datos de la instalación (patente del vehículo o dirección de la obra), fechas, y las fotos o descripciones que se adjunten a un reclamo.</>,
            <><strong>Comunicaciones:</strong> correos enviados y mensajes de WhatsApp (número, nombre de perfil, contenido, fecha y estado de entrega).</>,
            <><strong>Usuarios del sistema:</strong> email, rol y registro de las acciones realizadas.</>,
            <><strong>Datos técnicos:</strong> dirección IP y registros de errores, para seguridad y mantenimiento.</>,
          ]}
        />
        <p>
          Los datos los aporta la propia persona, los cargan nuestros empleados al atenderla, llegan desde los
          formularios de kristallfilm.com, o provienen de fuentes públicas de comercios (como directorios y mapas)
          cuando buscamos instaladores para ofrecerles nuestros productos.
        </p>
        <p>No pedimos ni tratamos datos sensibles (salud, opiniones políticas, religión, etc.).</p>
      </LegalSection>

      <LegalSection n={3} title="Para qué los usamos">
        <LegalList
          items={[
            "gestionar la relación comercial: consultas, presupuestos, ventas, entregas y cobros;",
            "emitir y guardar remitos y garantías, y atender reclamos;",
            "avisar a un instalador que le entró un pedido de turno;",
            "pedirte que completes o actualices tus datos (por ejemplo, tu email) para enviarte comprobantes y garantías;",
            "responder tus mensajes por WhatsApp y correo;",
            "proteger el sistema y cumplir obligaciones legales, contables y fiscales.",
          ]}
        />
        <p>
          Lo hacemos porque es necesario para la relación comercial que tenemos con vos, porque nos diste tu
          consentimiento, porque lo exige la ley, o por nuestro interés legítimo en gestionar el negocio y prevenir
          abusos. No vendemos tus datos ni los usamos para publicidad de terceros.
        </p>
      </LegalSection>

      <LegalSection n={4} title="WhatsApp">
        <p>
          Nos comunicamos por la plataforma WhatsApp Business (API en la nube) de Meta Platforms. Eso significa que:
        </p>
        <LegalList
          items={[
            "los mensajes que intercambiás con nuestro número pasan por los servidores de Meta, que los trata según sus propias políticas, y además guardamos una copia en nuestro sistema para poder atenderte;",
            "los mensajes que iniciamos nosotros, fuera de una conversación que vos abriste, se envían con plantillas aprobadas por Meta y siempre ligados a algo concreto: un turno solicitado o el pedido de tus datos para enviarte comprobantes y garantías;",
            "si no querés recibir más mensajes nuestros, avisanos respondiendo el mensaje o escribiendo a " + LEGAL_CONTACT_EMAIL + ", y lo registramos para no volver a escribirte.",
          ]}
        />
        <p>
          Los links personales que te mandamos (por ejemplo, para cargar tus datos) son solo para vos y vencen a los
          pocos días. No los reenvíes.
        </p>
      </LegalSection>

      <LegalSection n={5} title="Con quién compartimos los datos">
        <p>Solo con quienes nos prestan un servicio necesario, en la medida en que lo usamos:</p>
        <LegalList
          items={[
            "el proveedor del servidor donde funciona el sistema y su base de datos;",
            "Meta Platforms (WhatsApp Business), para enviar y recibir mensajes;",
            "nuestro proveedor de correo electrónico, para enviar comprobantes, garantías y avisos;",
            "Anthropic, cuando el equipo usa las funciones de asistencia con inteligencia artificial del sistema (se envía el texto necesario para la tarea; las decisiones las toman siempre personas);",
            "Google, para geolocalización y mapas;",
            "Sentry, para registrar errores técnicos.",
          ]}
        />
        <p>
          También podemos entregar información a una autoridad cuando una ley o una orden judicial lo exija. En el
          resto de los casos no cedemos tus datos a terceros.
        </p>
        <p>
          Algunos de estos proveedores están fuera de Argentina, por ejemplo en Estados Unidos. Procuramos trabajar con
          proveedores que ofrezcan garantías adecuadas de protección de los datos.
        </p>
      </LegalSection>

      <LegalSection n={6} title="Cuánto tiempo los guardamos">
        <p>
          Mientras dure la relación comercial y la vigencia de la garantía, y después, durante los plazos que
          establece la normativa comercial y fiscal para conservar la documentación de las operaciones. Cumplido el
          plazo, los datos se eliminan o se anonimizan.
        </p>
      </LegalSection>

      <LegalSection n={7} title="Cómo los protegemos">
        <LegalList
          items={[
            "acceso solo con usuario y contraseña, con permisos distintos según el rol de cada persona;",
            "las contraseñas se guardan de forma no reversible y las claves de acceso entre sistemas, cifradas;",
            "conexión cifrada (HTTPS) y registro de las acciones relevantes que hace cada usuario;",
            "información de contacto de clientes visible solo para quien la necesita para su trabajo.",
          ]}
        />
        <p>
          Ningún sistema es infalible. Si detectáramos un incidente que afecte tus datos, actuaremos para contenerlo
          y te avisaremos cuando corresponda.
        </p>
      </LegalSection>

      <LegalSection n={8} title="Tus derechos">
        <p>
          Tenés derecho a acceder a tus datos, a pedir que los rectifiquemos o actualicemos, y a pedir que los
          suprimamos cuando no sean necesarios, conforme a la Ley 25.326 de Protección de los Datos Personales de la
          República Argentina (y, para personas en Uruguay, la Ley 18.331). Podés ejercerlos escribiendo a {mail}. El
          acceso es gratuito y respondemos dentro de los plazos que fija la ley.
        </p>
        <p>
          La Agencia de Acceso a la Información Pública, en su carácter de Órgano de Control de la Ley 25.326, tiene
          la atribución de atender las denuncias y reclamos que interpongan quienes resulten afectados en sus derechos
          por incumplimiento de las normas de protección de datos personales.
        </p>
      </LegalSection>

      <LegalSection n={9} title="Cómo pedir que eliminemos tus datos">
        <p>Para que eliminemos tus datos, incluidos los mensajes de WhatsApp que tengamos guardados:</p>
        <LegalList
          items={[
            <>escribinos a {mail} desde el email, o indicando el número de WhatsApp, con el que nos contactaste;</>,
            "indicá que querés que eliminemos tus datos;",
            "te pedimos algún dato para confirmar que sos vos y, una vez verificado, los eliminamos y te lo confirmamos.",
          ]}
        />
        <p>
          Podemos conservar la información que una ley nos obligue a guardar (por ejemplo, comprobantes de ventas ya
          realizadas) durante el plazo legal, y la usaremos solo para ese fin.
        </p>
      </LegalSection>

      <LegalSection n={10} title="Cookies">
        <p>
          El sistema usa solamente la cookie de sesión necesaria para mantenerte conectado y preferencias de
          funcionamiento guardadas en tu navegador. No usamos cookies de publicidad ni de seguimiento entre sitios.
        </p>
      </LegalSection>

      <LegalSection n={11} title="Menores de edad">
        <p>El sistema y nuestras comunicaciones están dirigidos a mayores de 18 años y no tratamos datos de menores de manera deliberada.</p>
      </LegalSection>

      <LegalSection n={12} title="Cambios en esta política">
        <p>
          Si la modificamos, publicamos la nueva versión en esta página con su fecha de actualización. Si el cambio es
          importante, te lo comunicaremos por los medios que tengamos.
        </p>
      </LegalSection>

      <LegalSection n={13} title="Contacto">
        <p>
          Consultas sobre esta política o sobre tus datos: {mail}. Los términos de uso del sistema están en{" "}
          <a href="/terminos" className="underline underline-offset-2">Términos de Servicio</a>.
        </p>
      </LegalSection>
    </LegalDocument>
  );
}
