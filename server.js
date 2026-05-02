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
app.use(require('compression')()); // Enable Gzip compression
app.use(express.json({ limit: '50mb' }));

// Static Files with Caching
const cachePeriod = 1000 * 60 * 60 * 24 * 7; // 1 week
app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: cachePeriod }));
app.use('/src', express.static(path.join(__dirname, '..', 'src'), { maxAge: cachePeriod }));

// Import Routes
const authRoutes = require('./routes/auth.routes');
const curriculumRoutes = require('./routes/curriculum.routes');
const userRoutes = require('./routes/user.routes');

// Use Routes
app.use('/api/auth', authRoutes);
app.use('/api/curriculum', curriculumRoutes);
app.use('/api/users', userRoutes);

// Socket.io Logic (Simplified for now, migrate full logic later)
io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);
    socket.on('disconnect', () => console.log('Client disconnected'));
});

// Fallback to legacy routes (We can keep some of server.old.js logic here or migrate it)
// For now, I will include the critical legacy routes to ensure the frontend doesn't break.
const PlatformData = require('./models/PlatformData'); // Need to create this model file

app.get('/api/platform-data', async (req, res) => {
    try {
        const tenantId = req.query.tenantId || 'main';
        const fields = req.query.fields; // e.g. "data.classes data.honorBoard"
        
        let doc;
        if (fields) {
            // Fetch only requested parts of the data blob
            doc = await PlatformData.findOne({ docId: tenantId }).select(fields).lean();
        } else {
            doc = await PlatformData.findOne({ docId: tenantId }).lean();
        }
        
        if (!doc) doc = await PlatformData.create({ docId: tenantId, data: { classes: {} } });
        res.json(doc.data || doc); 
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

// Optimized Audit Logs
const AuditLog = require('./models/AuditLog'); 
app.get('/api/audit-logs', async (req, res) => {
    try {
        const logs = await AuditLog.find()
            .sort({ createdAt: -1 })
            .limit(100)
            .lean();
        res.json({ success: true, logs });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/audit-logs', async (req, res) => {
    try {
        const log = await AuditLog.create(req.body);
        res.json({ success: true, log });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Start Server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
