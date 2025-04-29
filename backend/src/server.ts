// backend/src/server.ts
import express, { Express, Request, Response } from 'express';
import dotenv from 'dotenv';
import cors from 'cors';

// Load environment variables from .env file
dotenv.config();

const app: Express = express();
const port = process.env.PORT || 3001; // Use port 3001 or from env

// Middleware
app.use(cors()); // Enable CORS for requests from the extension
app.use(express.json()); // Parse JSON request bodies

// Simple test route
app.get('/', (req: Request, res: Response) => {
  res.send('Flashcard AI Backend Proxy is running!');
});

// Placeholder for the actual suggestion route (to be added)
// app.post('/api/suggest', (req: Request, res: Response) => {
//   // Logic to call Gemini will go here
//   res.json({ suggestion: 'Placeholder suggestion' });
// });

app.listen(port, () => {
  console.log(`[server]: Server is running at http://localhost:${port}`);
});