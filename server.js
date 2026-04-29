require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const connectDB = require('./config/db');

// Initialize App
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// Connect to Database
connectDB();

// Middleware
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50mb' }));

// Static Files
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/src', express.static(path.join(__dirname, '..', 'src')));

// Import Routes
const authRoutes = require('./routes/auth.routes');
const curriculumRoutes = require('./routes/curriculum.routes');

// Use Routes
app.use('/api/auth', authRoutes);
app.use('/api/curriculum', curriculumRoutes);

// Socket.io Logic (Simplified for now, migrate full logic later)
io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);
    socket.on('disconnect', () => console.log('Client disconnected'));
});

// Fallback to legacy routes (We can keep some of server.old.js logic here or migrate it)
// For now, I will include the critical legacy routes to ensure the frontend doesn't break.
const PlatformData = require('./models/PlatformData'); // Need to create this model file

app.get('/api/platform-data', async (req, res) => {
    // ... logic from server.old.js ...
    try {
        const tenantId = req.query.tenantId || 'main';
        let doc = await PlatformData.findOne({ docId: tenantId });
        if (!doc) doc = await PlatformData.create({ docId: tenantId, data: { classes: {} } });
        res.json(doc.data);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/platform-data', async (req, res) => {
    try {
        const tenantId = req.query.tenantId || 'main';
        await PlatformData.findOneAndUpdate(
            { docId: tenantId },
            { data: req.body },
            { upsert: true, new: true }
        );
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Start Server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
