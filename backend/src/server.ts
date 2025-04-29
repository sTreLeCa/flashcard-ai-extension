// backend/src/server.ts
import express, { Express, Request, Response } from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import suggestionRouter from './routes/suggest'; // <<< IMPORT THE ROUTER

dotenv.config();

const app: Express = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(cors()); // Enable CORS
app.use(express.json()); // Enable JSON body parsing

// --- Routes ---
// Basic health check route
app.get('/', (req: Request, res: Response) => {
  res.send('Flashcard AI Backend Proxy is running!');
});

// Use the suggestion router for paths starting with /api
app.use('/api', suggestionRouter); // <<< USE THE ROUTER

// --- Start Server ---
app.listen(port, () => {
  console.log(`[server]: Server is running at http://localhost:${port}`);
});