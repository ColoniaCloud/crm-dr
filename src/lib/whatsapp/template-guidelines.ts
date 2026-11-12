/**
 * Los lineamientos de Meta para plantillas de WhatsApp, tal como se le pasan a la
 * IA que revisa una plantilla antes de mandarla (ver `template-review.ts`).
 *
 * La IA no revisa "de memoria": opina contra este texto. Es un resumen de la
 * documentación oficial, tomado el 2026-11-12 de developers.facebook.com:
 *
 *   - Template components       …/whatsapp/templates/components
 *   - Template categorization   …/whatsapp/templates/template-categorization
 *   - Template review           …/whatsapp/templates/template-review
 *
 * Si Meta cambia una regla, se cambia acá y la revisión la sigue. Lo que la
 * documentación no dice no va como regla: va, si hace falta, en la sección de
 * criterio, marcado como tal.
 *
 * Las reglas con respuesta exacta (largos, cantidades, agrupación de botones) no
 * están acá para que la IA las controle: las valida `template-rules.ts` antes de
 * llamarla, y bloquean siempre.
 */
export const GUIDELINES_DATE = "2026-11-12";

export const TEMPLATE_GUIDELINES = `
# Lineamientos de Meta para plantillas de WhatsApp (resumen de la documentación oficial, ${GUIDELINES_DATE})

## 1. Categorías

- MARKETING: es la categoría más flexible. Todo contenido mixto cuenta como marketing, y también el
  contenido poco claro (por ejemplo un cuerpo que es solo una variable, o solo "¡Felicitaciones!").
  Ejemplos de la documentación: "Como agradecimiento por tu último pedido, disfrutá un {{1}}% de descuento
  en el próximo." / "Dejaste productos en tu carrito. Finalizá la compra acá abajo." (el retargeting es
  marketing aunque la persona lo haya pedido).
- UTILITY: tiene que ser NO promocional y además (a) específico de esa persona o pedido por ella, o
  (b) esencial o crítico (por ejemplo, seguridad). Las plantillas de gestión de pedidos y de alertas de
  cuenta no pueden promocionar, recomendar, hacer upselling ni cross-selling, incluir ofertas, ni buscar
  renovaciones. Una encuesta de opinión solo es utilidad si se refiere a un pedido o interacción anterior
  concretos; una encuesta genérica no. No se puede iniciar una conversación para "seguir charlando" si la
  persona no lo pidió.
  Ejemplos de la documentación: "¡Gracias! Tu pedido {{1}} está confirmado. Te avisamos cuando salga." /
  "Recordatorio: tu pago mensual de {{1}} se debita el {{2}}."
- La documentación no fija una regla general sobre botones o links por categoría. Para UTILITY la prueba
  es la intención no promocional del mensaje completo, botones incluidos: un botón que invita a comprar,
  ver ofertas, conocer productos o pedir un presupuesto vuelve promocional a una plantilla que en el texto
  parecía de utilidad. Un botón que sirve a la gestión concreta (confirmar, reprogramar, cancelar, ver el
  estado, ver el comprobante) es coherente con UTILITY.

## 2. Qué pasa si la categoría está mal

- Si Meta decide al crearla que una plantilla enviada como UTILITY es MARKETING, la aprueba como MARKETING
  (se cobra como marketing). También puede rechazarla con motivo INCORRECT_CATEGORY.
- Meta revisa periódicamente las plantillas ya aprobadas y les cambia la categoría si corresponde.
- Si una empresa clasifica marketing como utilidad de forma reiterada, Meta aplica restricciones
  crecientes: advertencia escrita, tope al volumen de utilidad, pasar a MARKETING todas las plantillas de
  utilidad e impedir crear nuevas (7 días, 30 si reincide), y restricción a nivel de todo el portfolio.

## 3. Motivos de rechazo en la revisión

- Variables: llaves desparejas o faltantes; variables con caracteres especiales (#, $, %); variables no
  correlativas; demasiadas variables para el largo del mensaje; el mensaje empieza o termina con una
  variable.
- Política de Comercio o Política de WhatsApp Business: contenido que las infringe.
- Identificadores sensibles: no se puede pedir el número completo de una tarjeta, de una cuenta bancaria
  ni de un documento de identidad, ni documentos que los contengan. Pedir una parte (los últimos 4
  dígitos) está permitido.
- Contenido abusivo o amenazante: amenazar con acciones legales o con exponer a la persona.
- Spam o contenido con aspecto de estafa.
- Duplicado: mismo cuerpo y pie que una plantilla que ya existe en la cuenta.
- Las plantillas con variables tienen que traer un ejemplo de cada una.

## 4. Botones (componente BUTTONS)

- Respuesta rápida (QUICK_REPLY): al tocarla, la persona le manda al negocio ese texto. El uso que la
  documentación pone de ejemplo es dejar que el cliente se dé de baja de los mensajes de marketing
  ("Unsubscribe from Promos").
- Link (URL): abre la dirección en el navegador del teléfono.
- Llamada (PHONE_NUMBER): llama al teléfono del negocio.
- Con 4 o más botones, o con una respuesta rápida junto a otro tipo de botón, el mensaje no se puede ver
  en los clientes de escritorio de WhatsApp: se le pide a la persona que lo abra en el teléfono.
- Con más de 3 botones se muestran dos y un "Ver todas las opciones".
- La documentación no restringe emojis ni formato en el texto de un botón; solo fija el largo (25).

## 5. Criterio (NO son reglas documentadas por Meta; usalas como señal, no como motivo de rechazo seguro)

- Un link que no deja ver a dónde lleva (acortadores) o que no es del dominio del negocio se parece a los
  patrones de estafa del punto 3.
- El texto del botón tiene que decir lo que pasa al tocarlo y coincidir con lo que promete el mensaje.
- Textos de botón genéricos ("Click acá", "Ver más") funcionan peor que una acción concreta.
- En MARKETING, ofrecer una respuesta rápida para dejar de recibir promociones baja los bloqueos y los
  reportes, que es lo que le baja la calidad a una plantilla y la termina pausando.
`.trim();
