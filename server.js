/**
 * Oracle Question Storage API
 * 
 * Stores and serves question data (including test cases) as JSON files.
 * This runs on your Oracle instance and is accessed by the main CodeMaze backend.
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || 'codemaze_oracle_secret_2025';
const DATA_DIR = process.env.DATA_DIR || './data';
const QUESTIONS_DIR = path.join(DATA_DIR, 'questions');

// Ensure data directories exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(QUESTIONS_DIR)) fs.mkdirSync(QUESTIONS_DIR, { recursive: true });

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Large test cases support

// API Key middleware for write operations
const requireApiKey = (req, res, next) => {
  const key = req.headers['x-api-key'] || req.query.apiKey;
  if (key !== API_KEY) {
    return res.status(401).json({ error: 'Invalid or missing API key' });
  }
  next();
};

// =============================================================================
// ROUTES
// =============================================================================

// Health check
app.get('/health', (req, res) => {
  const questionsCount = fs.readdirSync(QUESTIONS_DIR).filter(f => f.endsWith('.json')).length;
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    questionsCount,
    uptime: process.uptime()
  });
});

// GET all questions (metadata only for listing)
app.get('/questions', (req, res) => {
  try {
    const files = fs.readdirSync(QUESTIONS_DIR).filter(f => f.endsWith('.json'));
    const questions = files.map(file => {
      const data = JSON.parse(fs.readFileSync(path.join(QUESTIONS_DIR, file), 'utf8'));
      // Return only metadata for listing (no test cases)
      return {
        _id: data._id,
        title: data.title,
        slug: data.slug,
        difficulty: data.difficulty,
        tags: data.tags,
        companies: data.companies,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt
      };
    });
    res.json({ success: true, count: questions.length, data: questions });
  } catch (error) {
    console.error('Error listing questions:', error);
    res.status(500).json({ error: 'Failed to list questions' });
  }
});

// GET single question by ID (full data including test cases)
app.get('/questions/:id', (req, res) => {
  try {
    const { id } = req.params;
    const filePath = path.join(QUESTIONS_DIR, `${id}.json`);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Question not found' });
    }
    
    const question = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    res.json({ success: true, data: question });
  } catch (error) {
    console.error('Error getting question:', error);
    res.status(500).json({ error: 'Failed to get question' });
  }
});

// GET question by slug
app.get('/questions/slug/:slug', (req, res) => {
  try {
    const { slug } = req.params;
    const files = fs.readdirSync(QUESTIONS_DIR).filter(f => f.endsWith('.json'));
    
    for (const file of files) {
      const data = JSON.parse(fs.readFileSync(path.join(QUESTIONS_DIR, file), 'utf8'));
      if (data.slug === slug) {
        return res.json({ success: true, data });
      }
    }
    
    res.status(404).json({ error: 'Question not found' });
  } catch (error) {
    console.error('Error getting question by slug:', error);
    res.status(500).json({ error: 'Failed to get question' });
  }
});

// GET only test cases for a question (for code execution)
app.get('/questions/:id/testcases', (req, res) => {
  try {
    const { id } = req.params;
    const filePath = path.join(QUESTIONS_DIR, `${id}.json`);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Question not found' });
    }
    
    const question = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    res.json({ 
      success: true, 
      data: {
        testCases: question.testCases || [],
        timeLimit: question.timeLimit,
        memoryLimit: question.memoryLimit
      }
    });
  } catch (error) {
    console.error('Error getting test cases:', error);
    res.status(500).json({ error: 'Failed to get test cases' });
  }
});

// CREATE question (requires API key)
app.post('/questions', requireApiKey, (req, res) => {
  try {
    const questionData = req.body;
    
    // Use provided _id or generate new one
    const id = questionData._id || require('crypto').randomBytes(12).toString('hex');
    questionData._id = id;
    
    // Add timestamps
    questionData.createdAt = questionData.createdAt || new Date().toISOString();
    questionData.updatedAt = new Date().toISOString();
    
    const filePath = path.join(QUESTIONS_DIR, `${id}.json`);
    
    // Check if already exists
    if (fs.existsSync(filePath)) {
      return res.status(409).json({ error: 'Question with this ID already exists' });
    }
    
    fs.writeFileSync(filePath, JSON.stringify(questionData, null, 2));
    
    console.log(`[CREATE] Question saved: ${id} - ${questionData.title}`);
    res.status(201).json({ 
      success: true, 
      message: 'Question created',
      data: { _id: id, questionUrl: `http://localhost:${PORT}/questions/${id}` }
    });
  } catch (error) {
    console.error('Error creating question:', error);
    res.status(500).json({ error: 'Failed to create question' });
  }
});

// UPDATE question (requires API key)
app.put('/questions/:id', requireApiKey, (req, res) => {
  try {
    const { id } = req.params;
    const filePath = path.join(QUESTIONS_DIR, `${id}.json`);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Question not found' });
    }
    
    // Read existing data
    const existingData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    // Merge with new data
    const updatedData = {
      ...existingData,
      ...req.body,
      _id: id, // Preserve ID
      createdAt: existingData.createdAt, // Preserve original creation time
      updatedAt: new Date().toISOString()
    };
    
    fs.writeFileSync(filePath, JSON.stringify(updatedData, null, 2));
    
    console.log(`[UPDATE] Question updated: ${id} - ${updatedData.title}`);
    res.json({ success: true, message: 'Question updated', data: updatedData });
  } catch (error) {
    console.error('Error updating question:', error);
    res.status(500).json({ error: 'Failed to update question' });
  }
});

// DELETE question (requires API key)
app.delete('/questions/:id', requireApiKey, (req, res) => {
  try {
    const { id } = req.params;
    const filePath = path.join(QUESTIONS_DIR, `${id}.json`);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Question not found' });
    }
    
    // Read title before deleting for logging
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    fs.unlinkSync(filePath);
    
    console.log(`[DELETE] Question deleted: ${id} - ${data.title}`);
    res.json({ success: true, message: 'Question deleted' });
  } catch (error) {
    console.error('Error deleting question:', error);
    res.status(500).json({ error: 'Failed to delete question' });
  }
});

// Bulk import (for migration)
app.post('/questions/bulk', requireApiKey, (req, res) => {
  try {
    const { questions } = req.body;
    
    if (!Array.isArray(questions)) {
      return res.status(400).json({ error: 'questions must be an array' });
    }
    
    let created = 0;
    let skipped = 0;
    
    for (const q of questions) {
      const id = q._id;
      if (!id) {
        skipped++;
        continue;
      }
      
      const filePath = path.join(QUESTIONS_DIR, `${id}.json`);
      
      if (fs.existsSync(filePath)) {
        skipped++;
        continue;
      }
      
      q.updatedAt = new Date().toISOString();
      fs.writeFileSync(filePath, JSON.stringify(q, null, 2));
      created++;
    }
    
    console.log(`[BULK] Imported ${created} questions, skipped ${skipped}`);
    res.json({ success: true, created, skipped });
  } catch (error) {
    console.error('Error bulk importing:', error);
    res.status(500).json({ error: 'Bulk import failed' });
  }
});

// =============================================================================
// START SERVER
// =============================================================================

app.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║       Oracle Question Storage API                          ║
║       Running on port ${PORT}                                  ║
╠════════════════════════════════════════════════════════════╣
║  Endpoints:                                                ║
║    GET  /health              - Health check                ║
║    GET  /questions           - List all questions          ║
║    GET  /questions/:id       - Get question by ID          ║
║    GET  /questions/slug/:s   - Get question by slug        ║
║    GET  /questions/:id/testcases - Get test cases only     ║
║    POST /questions           - Create question (API key)   ║
║    PUT  /questions/:id       - Update question (API key)   ║
║    DELETE /questions/:id     - Delete question (API key)   ║
║    POST /questions/bulk      - Bulk import (API key)       ║
╚════════════════════════════════════════════════════════════╝
  `);
});
