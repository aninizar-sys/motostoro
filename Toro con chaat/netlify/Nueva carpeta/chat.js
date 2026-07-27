// Función segura que responde el chat de la tienda usando la API de Claude.
// La clave (ANTHROPIC_API_KEY) vive solo aquí, en el servidor de Netlify —
// nunca se expone en el código de la página.

const SUPABASE_URL = "https://yalmrlfchvpayeqrqzcu.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlhbG1ybGZjaHZwYXllcXJxemN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwNzY4NDEsImV4cCI6MjEwMDY1Mjg0MX0.8FugQynmYVO1T1cmp3Tf3_nk7XIo4fwrsIqi9aexx4w";

export default async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "Falta configurar ANTHROPIC_API_KEY en Netlify." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  let messages;
  try {
    const body = await req.json();
    messages = body.messages;
    if (!Array.isArray(messages) || !messages.length) throw new Error("sin mensajes");
  } catch (e) {
    return new Response(JSON.stringify({ error: "Petición inválida." }), { status: 400 });
  }

  // Traer catálogo público actual para que el asistente responda con datos reales
  let catalogoTexto = "(catálogo no disponible por ahora)";
  try {
    const resProd = await fetch(
      `${SUPABASE_URL}/rest/v1/productos?select=nombre,precio,descripcion,categorias(nombre)&activo=eq.true&mostrar_en_tienda_publica=eq.true`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
    );
    const productos = await resProd.json();
    if (Array.isArray(productos) && productos.length) {
      catalogoTexto = productos
        .map(p => `- ${p.nombre} (${p.categorias?.nombre || "sin categoría"})${p.precio > 0 ? `: $${p.precio}` : ": precio a consultar"}`)
        .join("\n");
    }
  } catch (e) {
    // si falla, seguimos sin catálogo en vez de romper el chat
  }

  const systemPrompt = `Eres el asistente virtual de MotosToro, un concesionario de motos de la marca Toro con dos sedes en Táchira, Venezuela: La Fría y Coloncito.

Venden motos nuevas, repuestos originales, cascos, accesorios y aceite, y ofrecen servicio técnico en ambas tiendas.

Formas de pago que manejan:
- Contado
- Crédito directo de la empresa
- Rapid Crédito (crédito con un tercero)
- Plan Ahorro (el cliente paga semanalmente un monto libre hasta completar el precio de la moto, y la retira al terminar)
- Motosán (varios clientes pagan una cuota semanal fija por un grupo; cada mes hay un sorteo entre los que están al día, y el ganador recibe la moto y sigue pagando el resto)

Catálogo actual (nombre, categoría, precio):
${catalogoTexto}

Instrucciones:
- Responde en español venezolano neutro, de forma breve, cálida y directa — como un vendedor amable, no como un robot corporativo.
- La tienda NO vende en línea: cualquier compra se cierra visitando el concesionario o coordinando por WhatsApp.
- Nunca inventes precios, disponibilidad de stock, ni fechas de entrega que no estén en el catálogo de arriba — si no lo sabes, dilo con naturalidad y sugiere confirmar por WhatsApp o visitando la tienda.
- Si preguntan algo totalmente ajeno al negocio (no tiene que ver con motos, repuestos, pagos o las sedes), redirige amablemente la conversación hacia cómo puedes ayudarles con MotosToro.
- Mantén las respuestas cortas (2-4 líneas), esto es un chat, no un correo.`;

  try {
    const respuesta = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 500,
        system: systemPrompt,
        messages: messages,
      }),
    });

    const data = await respuesta.json();

    if (data.error) {
      return new Response(JSON.stringify({ error: data.error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const texto = (data.content || [])
      .filter(b => b.type === "text")
      .map(b => b.text)
      .join("");

    return new Response(JSON.stringify({ reply: texto }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
