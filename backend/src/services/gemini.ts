// backend/src/services/gemini.ts
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import dotenv from 'dotenv';

dotenv.config(); // Load .env variables

const apiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey || ""); // Initialize with API Key
const modelName = "gemini-1.5-flash-latest"; // Or another suitable model like "gemini-pro"

// --- Basic Safety Settings ---
// Adjust these based on your needs and content policies
// Blocks content above a certain threshold for listed categories
const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
];

// --- Generation Configuration (Optional) ---
const generationConfig = {
    // temperature: 0.9, // Controls randomness (higher = more creative, lower = more deterministic)
    // topK: 1,          // Consider only the top K most likely tokens
    // topP: 1,          // Consider tokens comprising top P probability mass
    // maxOutputTokens: 100, // Limit the length of the response
};


/**
 * Generates a simple definition or translation suggestion for the given text.
 * @param text The text to get a suggestion for.
 * @returns A promise that resolves with the suggestion string or null if failed.
 */
export async function getSuggestionForText(text: string): Promise<string | null> {
    if (!apiKey) {
        console.error("Gemini API Key not found in environment variables.");
        return null;
    }
    if (!text || text.trim().length === 0) {
         console.warn("Received empty text for suggestion.");
         return null;
    }

    console.log(`[Gemini Service] Requesting suggestion for: "${text.substring(0, 50)}..."`);

    try {
        const model = genAI.getGenerativeModel({ model: modelName, safetySettings, generationConfig });

        // --- Construct the Prompt ---
        // Keep it simple and direct for now. You can refine this.
        // Consider asking for translation IF it looks like a foreign word, else definition.
        // Or let the user specify the desired action later.
        const prompt = `Provide a concise definition or translation for the following term or phrase, suitable for a flashcard answer. If it's likely English, provide a definition. If it seems like another language, provide an English translation. Term: "${text}" Suggestion:`;


        const result = await model.generateContent(prompt);
        const response = result.response;
        const suggestionText = response.text();

        console.log(`[Gemini Service] Received suggestion: "${suggestionText.substring(0, 100)}..."`);
        return suggestionText;

    } catch (error: any) {
        console.error("[Gemini Service] Error generating content:", error);
         // Check if it's a safety block error
         if (error.message && error.message.includes('SAFETY')) {
             return "[Suggestion blocked due to safety settings]";
         }
        return null; // Return null on other errors
    }
}