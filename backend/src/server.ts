// backend/src/server.ts
import express, { Express, Request, Response } from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import suggestionRouter from './routes/suggest'; // Your existing router
import path from 'path'; // Import the 'path' module

dotenv.config();

const app: Express = express();
const port = process.env.PORT || 3001; // Your backend runs on 3001

// Middleware
app.use(cors());
app.use(express.json());

// --- Variable to store the most recent data for the assignment ---
let latestAssignmentData: string = "No data received for assignment yet.";

// --- Routes ---
// Basic health check route (existing)
app.get('/', (req: Request, res: Response) => {
  res.send('Flashcard AI Backend Proxy is running!');
});

// Use the suggestion router for paths starting with /api (existing)
app.use('/api', suggestionRouter);

// --- NEW: Assignment-specific endpoints ---

// Endpoint to receive data for the assignment (matches assignment requirement)
// Path: /api/create-answer
app.post('/api/create-answer', (req: Request, res: Response) => {
    console.log("[Assignment] Received POST request to /api/create-answer");
    console.log("[Assignment] Request body:", req.body);

    if (req.body && typeof req.body.data === 'string') {
        latestAssignmentData = req.body.data;
        console.log("[Assignment] Stored new data:", latestAssignmentData);
        res.status(200).json({ message: "Assignment data received and stored successfully." });
    } else {
        res.status(400).json({ error: "Invalid request body for assignment. Expecting { \"data\": \"some-text-here\" }." });
    }
});

// Endpoint for the frontend to fetch the latest assignment data
// Path: /api/get-latest-answer (you can name this as you like, frontend will call this)
app.get('/api/get-latest-answer', (req: Request, res: Response) => {
    console.log("[Assignment] Received GET request to /api/get-latest-answer");
    res.status(200).json({ data: latestAssignmentData });
});

// --- NEW: Serve the simple HTML page for the /answer path ---
// This path matches the frontend URL requirement: http://your-ip-address:PORT/answer
app.get('/answer', (req: Request, res: Response) => {
  // When running the compiled code from `dist/server.js`, `__dirname` will be `backend/dist`.
  // We need to go up one level to `backend/` and then into `public/`.
  // So, create a folder `public` inside `backend/` and put `answer.html` there.
  res.sendFile(path.join(__dirname, '../public/answer.html'));
});

// --- Start Server ---
app.listen(port, () => {
  console.log(`[server]: Server is running at http://localhost:${port}`);
  console.log(`[server]: Assignment frontend page will be at http://localhost:${port}/answer`);
  console.log(`[server]: Assignment POST endpoint will be at http://localhost:${port}/api/create-answer`);
});