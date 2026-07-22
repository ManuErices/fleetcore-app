const FUNCTION_URL = import.meta.env.DEV 
  ? "/api-generardocumento" 
  : "https://southamerica-west1-mpf-maquinaria.cloudfunctions.net/generarDocumento"

export async function generarConIA(prompt, onChunk) {
  const response = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1500,
      system: `Eres el redactor técnico oficial de MPF Ingeniería Civil SPA. 
Tu único trabajo es transformar borradores en documentos profesionales, 
formales y sin errores ortográficos, aptos para presentar al mandante Río Tinto Mining. 
Responde SOLO con el documento redactado, sin comentarios adicionales.`,
      messages: [{ role: "user", content: prompt }],
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Error ${response.status}: ${err}`)
  }

  const data = await response.json()
  const texto = data.content?.[0]?.text || ""

  // Efecto de escritura progresiva
  for (const char of texto) {
    onChunk(char)
    await new Promise(r => setTimeout(r, 4))
  }

  return texto
}
