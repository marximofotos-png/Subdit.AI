// api/chat.js
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método no permitido' });
    }

    const { contents, systemInstruction } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        return res.status(500).json({ error: 'Falta configurar la API Key en las variables de entorno del servidor.' });
    }

    try {
        // CAMBIO CLAVE: Petición HTTP adaptada al nuevo estándar de Google con cabecera de seguridad
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey // <-- Clave enviada de forma segura en las cabeceras
            },
            body: JSON.stringify({ contents, systemInstruction })
        });

        const data = await response.json();
        return res.status(200).json(data);
    } catch (error) {
        console.error("Error en el backend:", error);
        return res.status(500).json({ error: 'Error al conectar con Gemini.' });
    }
}