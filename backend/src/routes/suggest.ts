// backend/src/routes/suggest.ts
import express, { Router, Request, Response } from 'express';
import { getSuggestionForText } from '../services/gemini'; // Import the service function

const router: Router = express.Router();

router.post('/suggest', async (req: Request, res: Response) => {
    const { text } = req.body; // Extract text from request body

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
        console.log("[Suggest Route] Invalid request body:", req.body);
        return res.status(400).json({ error: 'Missing or invalid "text" field in request body.' });
    }

    console.log(`[Suggest Route] Received request for text: "${text.substring(0,50)}..."`);

    try {
        const suggestion = await getSuggestionForText(text);

        if (suggestion !== null) {
            console.log('[Suggest Route] Sending suggestion back.');
            res.json({ suggestion: suggestion });
        } else {
            console.log('[Suggest Route] No suggestion received from service.');
            res.status(500).json({ error: 'Failed to get suggestion from AI service.' });
        }
    } catch (error) {
        console.error("[Suggest Route] Unexpected error:", error);
        res.status(500).json({ error: 'An internal server error occurred.' });
    }
});

export default router; // Export the router