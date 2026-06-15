import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export async function POST(req: NextRequest) {
  try {
    const { prompt, emailThread, type } = await req.json();

    if (!prompt && !emailThread) {
      return NextResponse.json({ error: "Either prompt or emailThread is required" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Gemini API key is missing (GEMINI_API_KEY)" }, { status: 500 });
    }

    const ai = new GoogleGenerativeAI(apiKey);
    const model = ai.getGenerativeModel({ model: "gemini-1.5-flash" });

    let apiPrompt = "";

    if (type === "summarize") {
      apiPrompt = `
        Actúa como un asistente ejecutivo altamente analítico. 
        Lee el siguiente hilo de correos y redacta un resumen ejecutivo corto (máximo 4 viñetas) y determina cuál es la acción requerida (Action Items):
        
        --- HILO DE CORREOS ---
        ${emailThread}
        -----------------------
      `;
    } else {
      // Default: Write email draft
      apiPrompt = `
        Actúa como un asistente de redacción corporativo profesional.
        Redacta una propuesta de respuesta de correo electrónico basada en las siguientes instrucciones y/o contexto:
        
        Instrucciones del usuario: "${prompt || "Redactar una respuesta adecuada"}"
        ${emailThread ? `Contexto del hilo previo:\n${emailThread}` : ""}
        
        Requisitos del borrador:
        1. Mantén un tono formal, claro y cortés.
        2. Añade marcadores de posición limpios entre corchetes para los datos variables (ej: [Nombre del Remitente], [Fecha]).
        3. No inventes información fáctica externa al contexto; usa variables genéricas.
        4. Devuelve únicamente el correo redactado listo para usar.
      `;
    }

    const result = await model.generateContent(apiPrompt);
    const responseText = result.response.text();

    return NextResponse.json({ 
      content: responseText 
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
