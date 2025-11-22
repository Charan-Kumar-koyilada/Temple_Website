// server.js — simple Express CRUD server for temples.json
//  - CRUD endpoints under /api/temples
//  - data is persisted to temples.json

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Path to our temples data file
const DATA_FILE = path.join(__dirname, 'temples.json');

// Utility functions
function readData(){
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (e) {
    return [];
  }
}

function writeData(arr){
  fs.writeFileSync(DATA_FILE, JSON.stringify(arr, null, 2), 'utf8');
}

/* ------------ API ROUTES ------------ */

// Get all temples
app.get('/api/temples', (req, res) => {
  res.json(readData());
});

// Get temple by ID
app.get('/api/temples/:id', (req, res) => {
  const list = readData();
  const item = list.find(t => t.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Not found' });
  res.json(item);
});

// Create temple
app.post('/api/temples', (req, res) => {
  const list = readData();
  const body = req.body;

  const newTemple = {
    id: body.id || "temple_" + Date.now(),
    name: body.name || "Untitled",
    location: body.location || "",
    description: body.description || "",
    ownerUserId: body.ownerUserId || "",
    fund_needed: Number(body.fund_needed || 0),
    fund_received: Number(body.fund_received || 0),
    images: Array.isArray(body.images) ? body.images : [],
    createdAt: new Date().toISOString()
  };

  list.push(newTemple);
  writeData(list);

  res.status(201).json(newTemple);
});

// Update temple
app.put('/api/temples/:id', (req, res) => {
  const list = readData();
  const index = list.findIndex(t => t.id === req.params.id);

  if (index === -1) return res.status(404).json({ error: "Not found" });

  list[index] = { ...list[index], ...req.body };
  writeData(list);

  res.json(list[index]);
});

// Delete temple
app.delete('/api/temples/:id', (req, res) => {
  const list = readData();
  const exists = list.some(t => t.id === req.params.id);

  if (!exists) return res.status(404).json({ error: "Not found" });

  const updated = list.filter(t => t.id !== req.params.id);
  writeData(updated);

  res.json({ success: true });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: "ok" });
});


// Start server
const PORT = 4000;
app.listen(PORT, () => {
  console.log(`Temples API running at http://localhost:${PORT}/api/temples`);
});
