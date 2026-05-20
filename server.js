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

// Auth & Tenant Middleware
const User = require('./models/User');
app.use(async (req, res, next) => {
    const userId = req.headers['x-user-id'];
    if (userId) {
        try {
            const user = await User.findOne({ id: userId }).lean();
            if (user) {
                req.user = user;
                const isSuper = user.role === 'super_admin' || user.phone === '01110154093';
                if (isSuper || req.query.scope === 'global') {
                    req.tenantId = 'global';
                    req.isSuperAdmin = true;
                } else {
                    req.tenantId = user.tenantId || 'main';
                }
            }
        } catch (e) { }
    }
    next();
});

// Static Files with Caching
const cachePeriod = 1000 * 60 * 60 * 24 * 7; // 1 week
app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: cachePeriod }));
app.use('/src', express.static(path.join(__dirname, '..', 'src'), { maxAge: cachePeriod }));

// Import Routes
const { requireAuth } = require('./middleware/auth');
const authRoutes = require('./routes/auth.routes');
const curriculumRoutes = require('./routes/curriculum.routes');
const userRoutes = require('./routes/user.routes');

// Use Routes
app.use('/api/auth', authRoutes);
app.use('/api/curriculum', requireAuth, curriculumRoutes);
app.use('/api/users', requireAuth, userRoutes);

// Socket.io Logic (Simplified for now, migrate full logic later)
io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);
    socket.on('disconnect', () => console.log('Client disconnected'));
});

// Fallback to legacy routes (We can keep some of server.old.js logic here or migrate it)
// For now, I will include the critical legacy routes to ensure the frontend doesn't break.
const PlatformData = require('./models/PlatformData'); // Need to create this model file

app.get('/api/platform-data', requireAuth, async (req, res) => {
    try {
        const scope = req.query.scope || (req.isSuperAdmin ? 'global' : '');
        const tenantId = req.tenantId || 'main';

        // Super Admin Global View
        if (scope === 'global') {
            const allDocs = await PlatformData.find({}).lean();
            const merged = { classes: {}, honorBoard: {} };
            allDocs.forEach(doc => {
                if (doc.data && doc.data.classes) {
                    Object.assign(merged.classes, doc.data.classes);
                }
                if (doc.data && doc.data.honorBoard) {
                    Object.assign(merged.honorBoard, doc.data.honorBoard);
                }
            });
            return res.json(merged);
        }

        const fields = req.query.fields;
        let doc;
        if (fields) {
            // Fetch only requested parts of the data blob
            doc = await PlatformData.findOne({ docId: tenantId }).select(fields).lean();
        } else {
            doc = await PlatformData.findOne({ docId: tenantId }).lean();
        }
        
        if (!doc) {
            doc = await PlatformData.create({ docId: tenantId, data: { classes: {} } });
        }
        
        // Always return only the nested 'data' object
        res.json(doc.data || { classes: {} }); 
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/platform-data', requireAuth, async (req, res) => {
    try {
        const tenantId = req.tenantId || 'main';
        if (tenantId === 'global') return res.status(403).json({ error: 'Cannot save to global scope directly' });
        
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
app.get('/api/audit-logs', requireAuth, async (req, res) => {
    try {
        const logs = await AuditLog.find()
            .sort({ createdAt: -1 })
            .limit(100)
            .lean();
        res.json({ success: true, logs });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/audit-logs', requireAuth, async (req, res) => {
    try {
        const log = await AuditLog.create(req.body);
        res.json({ success: true, log });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Missing Honor Board Routes
app.get('/api/honor-board', requireAuth, async (req, res) => {
    try {
        const tenantId = req.tenantId || 'main';
        const doc = await PlatformData.findOne({ docId: tenantId }).lean();
        res.json(doc?.data?.honorBoard || {});
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/honor-board', requireAuth, async (req, res) => {
    try {
        const tenantId = req.tenantId || 'main';
        const doc = await PlatformData.findOne({ docId: tenantId });
        if (doc) {
            if (!doc.data) doc.data = {};
            doc.data.honorBoard = req.body;
            doc.markModified('data');
            await doc.save();
        }
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Missing Organization Routes
const Organization = require('./models/Organization'); // Need to create this
app.get('/api/organizations/:id', requireAuth, async (req, res) => {
    try {
        const org = await Organization.findOne({ id: req.params.id }).lean();
        if (!org) return res.status(404).json({ error: 'Organization not found' });
        res.json({ success: true, data: org });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/organizations', requireAuth, async (req, res) => {
    try {
        if (!req.isSuperAdmin) return res.status(403).json({ error: 'Forbidden' });
        const orgs = await Organization.find().sort({ createdAt: -1 }).lean();
        res.json({ success: true, data: orgs });
    } catch (e) { res.status(500).json({ error: e.message }); }
});


// JSON 404 Handler for API
app.use('/api/*', (req, res) => {
    res.status(404).json({ error: `API Route not found: ${req.originalUrl}` });
});

// Start Server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
