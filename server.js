/**
 * Oracle Storage API
 * 
 * Stores and serves question data (JSON) and uploaded files (images, resumes, etc.).
 * This runs on your Oracle instance and is accessed by the main CodeMaze backend.
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || 'codemaze_oracle_secret_2025';
const DATA_DIR = process.env.DATA_DIR || './data';
const QUESTIONS_DIR = path.join(DATA_DIR, 'questions');

// Allowed file upload folders (extend this list as needed)
const ALLOWED_FOLDERS = ['profileimages', 'resumes'];

// Ensure data directories exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(QUESTIONS_DIR)) fs.mkdirSync(QUESTIONS_DIR, { recursive: true });
ALLOWED_FOLDERS.forEach(folder => {
  const dir = path.join(DATA_DIR, folder);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// --- Multer config for file uploads ---
const fileStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const folder = req.params.folder;
    const dir = path.join(DATA_DIR, folder);
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueName = `${uuidv4()}${ext}`;
    cb(null, uniqueName);
  }
});

const fileUpload = multer({
  storage: fileStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const folder = req.params.folder;
    if (!ALLOWED_FOLDERS.includes(folder)) {
      return cb(new Error(`Folder '${folder}' is not allowed`), false);
    }
    // For profileimages: only images; for resumes: images + PDFs
    if (folder === 'profileimages') {
      if (!file.mimetype.startsWith('image/')) {
        return cb(new Error('Only image files are allowed for profile images'), false);
      }
    } else if (folder === 'resumes') {
      if (!file.mimetype.startsWith('image/') && file.mimetype !== 'application/pdf') {
        return cb(new Error('Only images and PDFs are allowed for resumes'), false);
      }
    }
    cb(null, true);
  }
});

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
// FILE UPLOAD ROUTES (Profile Images, Resumes, etc.)
// =============================================================================

// UPLOAD a file to a folder (requires API key)
app.post('/files/:folder', requireApiKey, (req, res) => {
  fileUpload.single('file')(req, res, (err) => {
    if (err) {
      const status = err instanceof multer.MulterError ? 400 : 400;
      return res.status(status).json({ error: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const folder = req.params.folder;
    const filename = req.file.filename;
    const fileUrl = `${req.protocol}://${req.get('host')}/files/${folder}/${filename}?apiKey=${API_KEY}`;

    console.log(`[UPLOAD] ${folder}/${filename} (${(req.file.size / 1024).toFixed(1)}KB)`);
    res.status(201).json({
      success: true,
      data: {
        url: fileUrl,
        filename,
        folder,
        size: req.file.size,
        mimetype: req.file.mimetype
      }
    });
  });
});

// SERVE a file from a folder (requires API key)
app.get('/files/:folder/:filename', requireApiKey, (req, res) => {
  const { folder, filename } = req.params;
  if (!ALLOWED_FOLDERS.includes(folder)) {
    return res.status(400).json({ error: 'Invalid folder' });
  }

  // Sanitize filename to prevent path traversal
  const safeName = path.basename(filename);
  const filePath = path.join(DATA_DIR, folder, safeName);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  res.sendFile(path.resolve(filePath));
});

// DELETE a file (requires API key)
app.delete('/files/:folder/:filename', requireApiKey, (req, res) => {
  const { folder, filename } = req.params;
  if (!ALLOWED_FOLDERS.includes(folder)) {
    return res.status(400).json({ error: 'Invalid folder' });
  }

  const safeName = path.basename(filename);
  const filePath = path.join(DATA_DIR, folder, safeName);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  fs.unlinkSync(filePath);
  console.log(`[DELETE] ${folder}/${safeName}`);
  res.json({ success: true, message: 'File deleted' });
});

// LIST files in a folder (requires API key)
app.get('/files/:folder', requireApiKey, (req, res) => {
  const { folder } = req.params;
  if (!ALLOWED_FOLDERS.includes(folder)) {
    return res.status(400).json({ error: 'Invalid folder' });
  }

  const folderPath = path.join(DATA_DIR, folder);
  const files = fs.readdirSync(folderPath).map(f => ({
    filename: f,
    url: `${req.protocol}://${req.get('host')}/files/${folder}/${f}`,
    size: fs.statSync(path.join(folderPath, f)).size
  }));

  res.json({ success: true, count: files.length, data: files });
});

// =============================================================================
// START SERVER
// =============================================================================

app.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║       Oracle Storage API                                   ║
║       Running on port ${PORT}                                  ║
╠════════════════════════════════════════════════════════════╣
║  Question Endpoints:                                       ║
║    GET  /health              - Health check                ║
║    GET  /questions           - List all questions          ║
║    GET  /questions/:id       - Get question by ID          ║
║    GET  /questions/slug/:s   - Get question by slug        ║
║    GET  /questions/:id/testcases - Get test cases only     ║
║    POST /questions           - Create question (API key)   ║
║    PUT  /questions/:id       - Update question (API key)   ║
║    DELETE /questions/:id     - Delete question (API key)   ║
║    POST /questions/bulk      - Bulk import (API key)       ║
║                                                            ║
║  File Upload Endpoints:                                    ║
║    POST   /files/:folder            - Upload file          ║
║    GET    /files/:folder/:filename  - Serve file           ║
║    DELETE /files/:folder/:filename  - Delete file          ║
║    GET    /files/:folder            - List files           ║
║  Folders: ${ALLOWED_FOLDERS.join(', ').padEnd(47)}║
╚════════════════════════════════════════════════════════════╝
  `);
});
