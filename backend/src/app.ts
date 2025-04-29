import express from 'express';
import suggestRouter from './routes/suggest';

const app = express();

// Middleware for parsing JSON requests
app.use(express.json());

// Mount the suggest router at the path '/suggest'
app.use('/suggest', suggestRouter);

// Other middleware and routes...

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;