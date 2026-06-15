import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export async function POST(req: NextRequest) {
  try {
    const { domainName, registrar, dnsRecords } = await req.json();

    if (!domainName || !registrar || !dnsRecords) {
      return NextResponse.json({ error: "domainName, registrar and dnsRecords are required" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Gemini API key is missing (GEMINI_API_KEY)" }, { status: 500 });
    }

    // Initialize Gemini API using @google/generative-ai
    const ai = new GoogleGenerativeAI(apiKey);
    const model = ai.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
      Actúa como un Ingeniero de Sistemas y Administrador de DNS experto.
      
      Debes redactar una guía detallada, amigable y paso a paso en formato Markdown estructurado para configurar los registros de correo corporativo de Migadu en el registrador de dominios "${registrar}" para el dominio "${domainName}".
      
      Los registros DNS requeridos son:
      ${JSON.stringify(dnsRecords, null, 2)}
      
      Requisitos del tutorial:
      1. Explica brevemente qué hace cada registro (TXT, MX, CNAME) para que el cliente entienda.
      2. Da instrucciones paso a paso personalizadas para la interfaz del registrador "${registrar}" (por ejemplo, si es NIC.cl, menciona la delegación DNS o los servidores DNS locales; si es GoDaddy, Cloudflare o Namecheap, detalla cómo ingresar a la sección de administración de zonas DNS).
      3. Añade advertencias críticas:
         - Si usan Cloudflare, recalcar que los CNAME de DKIM deben tener el "Proxy (nube naranja)" DESACTIVADO ("DNS Only").
         - Recordar no colocar el nombre del dominio completo en los campos "Host" o "Nombre" si el proveedor lo añade por defecto (ej. en GoDaddy el host de "key1._domainkey" se ingresa sólo como "key1._domainkey").
         - Tiempo de propagación usual (de 1 a 24 horas).
      4. Utiliza llamadas visuales llamativas como notas y advertencias de GitHub Markdown (ej. > [!IMPORTANT]).
      5. Redacta con un tono profesional, empático y tranquilizador.
    `;

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    return NextResponse.json({ tutorial: text });

  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
