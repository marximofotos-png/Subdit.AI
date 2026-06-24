// api/chat.js
export default async function handler(req, res) {
    // Solo permitimos peticiones POST de nuestro frontend
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método no permitido' });
    }

    const { contents, systemInstruction } = req.body;
    
    // Obtenemos la llave de manera segura desde las variables de entorno del servidor
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        return res.status(500).json({ error: 'Falta configurar la API Key en el servidor.' });
    }

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ contents, systemInstruction })
        });

        const data = await response.json();
        return res.status(200).json(data);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Error al conectar con la API de Gemini.' });
    }
}