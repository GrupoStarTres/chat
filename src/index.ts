 // src/index.ts

import { Ai } from '@cloudflare/ai';

export interface Env {
  AI: any; // El binding de AI
}

const SYSTEM_PROMPT = "Eres un asistente útil para una tienda de tecnología. Responde preguntas sobre los productos de la tienda basándote en el contexto que se te proporciona. Si no sabes la respuesta, dilo amablemente.";

async function fetchStoreData() {
  const url = 'https://bgftech.shop/tienda/';
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }
    const html = await response.text();
    // Extrae la información relevante del HTML.
    // Por simplicidad, en este ejemplo solo devolvemos el texto plano.
    // Para algo más robusto, usarías un parser de HTML.
    return html.substring(0, 2000); // Limitamos la longitud para no saturar el prompt
  } catch (error) {
    console.error('Error fetching store data:', error);
    return null;
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const ai = new Ai(env.AI);

    // Ruta para el chat (la interfaz de usuario llama a este endpoint)
    if (url.pathname === '/api/chat') {
      if (request.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405 });
      }

      try {
        const { messages } = await request.json() as { messages: { role: string; content: string }[] };

        // 1. Obtener datos de la tienda SI la pregunta del usuario lo amerita.
        // Podrías mejorarlo con un análisis más inteligente.
        const userMessage = messages[messages.length - 1]?.content || '';
        let storeContext = '';
        if (userMessage.toLowerCase().includes('tienda') || userMessage.toLowerCase().includes('producto') || userMessage.toLowerCase().includes('precio')) {
          const storeData = await fetchStoreData();
          if (storeData) {
            storeContext = `\n\nContexto actual de la tienda:\n${storeData}`;
          }
        }

        // 2. Construir el prompt final para la IA.
        const finalMessages = [
          { role: 'system', content: SYSTEM_PROMPT + storeContext },
          ...messages // Incluimos el historial de la conversación
        ];

        // 3. Ejecutar el modelo de IA con el prompt enriquecido.
        const response = await ai.run('@cf/meta/llama-3-8b-instruct', {
          messages: finalMessages,
          stream: true // Habilitamos streaming para mejor experiencia [citation:1]
        });

        // 4. Devolver la respuesta en streaming.
        return new Response(response, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache'
          }
        });

      } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
      }
    }

    // Para cualquier otra ruta, servimos el frontend estático
    return env.ASSETS.fetch(request);
  },
};