require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const { OpenAI } = require('openai');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || 'sk-dummy-key-for-local-dev' });

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50mb' }));

// ─── Authentication & Multi-Tenant Middleware ─────────────────────────────────
app.use(async (req, res, next) => {
    if (req.path.startsWith('/api/auth') || req.path === '/api/seed') return next();
    
    const userId = req.headers['x-user-id'];
    if (userId) {
        try {
            const user = await mongoose.model('User').findOne({ id: userId }).lean();
            if (user) {
                req.user = user;
                if (user.role === 'admin') {
                    if (((user.permissions && user.permissions.isOwner) || user.id === 'admin')) {
                        req.tenantId = req.query.tenantId || 'main';
                    } else {
                        req.tenantId = user.id;
                    }
                } else {
                    req.tenantId = user.tenantId || 'main';
                }
            } else {
                req.tenantId = req.query.tenantId || 'main';
            }
        } catch(e) { req.tenantId = req.query.tenantId || 'main'; }
    } else {
        req.tenantId = req.query.tenantId || 'main';
    }
    next();
});

// ─── Serve Static Files ───────────────────────────────────────────────────────
// Serve student platform from numi-project root
app.use(express.static(path.join(__dirname, '..')));
// Serve admin panel from parent Numi folder
app.use(express.static(path.join(__dirname, '..', '..')));

// ─── MongoDB Connection ───────────────────────────────────────────────────────
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/numi_local_db';
const NODE_ENV = process.env.NODE_ENV || 'development';

if (!process.env.MONGO_URI) {
  console.warn('⚠️ WARNING: MONGO_URI is not defined in environment variables. Falling back to local database.');
}

console.log(`🌍 Environment: ${NODE_ENV}`);
console.log('🔌 Connecting to MongoDB Atlas...');

const mongoOptions = {
    serverSelectionTimeoutMS: 20000,   // Increase timeout for server selection
    connectTimeoutMS: 20000,           // Increase connection timeout
    socketTimeoutMS: 45000             // Increase socket timeout
};

// Only allow invalid TLS certs in development (local clock issues)
if (NODE_ENV !== 'production') {
    mongoOptions.tlsAllowInvalidCertificates = true;
}

mongoose.connect(MONGO_URI, mongoOptions)
  .then(() => console.log('✅ Connected to MongoDB Atlas successfully'))
  .catch(err => {
    console.error('❌ MongoDB connection FAILED:', err.message);
    console.error('📌 Check your MONGO_URI in environment variables and ensure your IP is whitelisted in Atlas.');
    process.exit(1); // Exit if cannot connect to DB as the app depends on it
  });

// ─── Schemas & Models ─────────────────────────────────────────────────────────

// PlatformData: stores the full CMS tree (classes → groups → courses → units → lessons)
const PlatformDataSchema = new mongoose.Schema({
  docId: { type: String, default: 'main', unique: true },
  data:  { type: mongoose.Schema.Types.Mixed, default: { classes: {} } }
}, { timestamps: true });
const PlatformData = mongoose.model('PlatformData', PlatformDataSchema);

// User: students & admins
const UserSchema = new mongoose.Schema({
  id:               { type: String, unique: true, required: true },
  name:             { type: String, required: true },
  phone:            { type: String, unique: true, required: true },
  password:         { type: String, default: '' },       // student code / password
  role:             { type: String, default: 'student' }, // 'student' | 'admin'
  tenantId:         { type: String, default: 'main' },
  status:           { type: String, default: 'inactive' }, // 'active' | 'inactive' | 'locked'
  classId:          { type: String, default: '' },
  groupId:          { type: String, default: '' },
  completedLessons: { type: [String], default: [] },
  quizScores:       { type: mongoose.Schema.Types.Mixed, default: {} }, // lessonId -> score (string format "X / Y")
  quizAnswers:      { type: mongoose.Schema.Types.Mixed, default: {} }, // lessonId -> [ans1, ans2, ...]
  xp:               { type: Number, default: 0 },
  streak:           { type: Number, default: 0 },
  deviceId:         { type: String, default: '' },
  parentPhone:      { type: String, default: '' },
  school:           { type: String, default: '' },
  dob:              { type: String, default: '' },
  avatar:           { type: String, default: '' },
  permissions:      { type: mongoose.Schema.Types.Mixed, default: {} },
  liveStats:        { type: mongoose.Schema.Types.Mixed, default: { totalSessions: 0, completedSessions: 0 } },
  quizResets:       { type: mongoose.Schema.Types.Mixed, default: {} } // lessonId -> { allowedUntil, resetAt }
}, { timestamps: true });
const User = mongoose.model('User', UserSchema);
 
// ChatSession: store conversation history for 15 days
const ChatSessionSchema = new mongoose.Schema({
    id:         { type: String, unique: true, required: true },
    userId:     { type: String, required: true },
    messages:   { type: [mongoose.Schema.Types.Mixed], default: [] }, // Array of objects { isUser: bool, text: string }
    createdAt:  { type: Date, default: Date.now, index: { expires: '15d' } }
}, { timestamps: true });
const ChatSession = mongoose.model('ChatSession', ChatSessionSchema);

// QuizAttempt: tracking student quiz sessions
const QuizAttemptSchema = new mongoose.Schema({
    userId:     { type: String, required: true },
    lessonId:   { type: String, required: true },
    status:     { type: String, default: 'in-progress' }, // 'in-progress' | 'completed'
    score:      { type: String, default: '' },
    answers:    { type: [mongoose.Schema.Types.Mixed], default: [] },
    startTime:  { type: Date, default: Date.now },
    endTime:    { type: Date },
    remainingTime: { type: Number }, // in seconds
    deviceId:   { type: String },
    attemptNum: { type: Number, default: 1 } // Support multiple attempts
}, { timestamps: true });
QuizAttemptSchema.index({ userId: 1, lessonId: 1, attemptNum: 1 }, { unique: true });
const QuizAttempt = mongoose.model('QuizAttempt', QuizAttemptSchema);

// GroupChat: message shared within a group
const GroupChatSchema = new mongoose.Schema({
    groupId:    { type: String, required: true },
    senderId:   { type: String, required: true },
    senderName: { type: String, required: true },
    message:    { type: String, required: true },
    isPinned:   { type: Boolean, default: false },
    replyTo:    { type: mongoose.Schema.Types.Mixed }, 
    readBy:     { type: [String], default: [] }, // Array of user IDs who have read the message
    timestamp:  { type: Date, default: Date.now }
}, { timestamps: true });
const GroupChat = mongoose.model('GroupChat', GroupChatSchema);

const PrivateChatSchema = new mongoose.Schema({
    senderId:   { type: String, required: true },
    receiverId: { type: String, required: true },
    senderName: { type: String, required: true },
    message:    { type: String, required: true },
    isPinned:   { type: Boolean, default: false },
    isRead:     { type: Boolean, default: false }, // For private messages (seen tick)
    replyTo:    { type: mongoose.Schema.Types.Mixed }, 
    timestamp:  { type: Date, default: Date.now }
}, { timestamps: true });
const PrivateChat = mongoose.model('PrivateChat', PrivateChatSchema);

// TeacherPlatform: helper platforms saved per teacher/admin
const TeacherPlatformSchema = new mongoose.Schema({
  name:      { type: String, required: true },
  url:       { type: String, required: true },
  teacherId: { type: String, required: true }
}, { timestamps: true });
const TeacherPlatform = mongoose.model('TeacherPlatform', TeacherPlatformSchema);

// Notification
const NotificationSchema = new mongoose.Schema({
  userId:  { type: String, required: true, index: true },
  title:   { type: String, required: true },
  details: { type: String, required: true },
  type:    { type: String, required: true }, // 'video', 'file', 'lesson'
  link:    { type: String, default: '' },
  isRead:  { type: Boolean, default: false }
}, { timestamps: true });
const Notification = mongoose.model('Notification', NotificationSchema);

// LiveClass: tracks live classes linked to a group
const LiveClassSchema = new mongoose.Schema({
  teacherId: { type: String, required: true },
  classId:   { type: String, required: true },
  groupId:   { type: String, required: true },
  title:     { type: String, required: true },
  link:      { type: String, required: true },
  date:      { type: String, required: true },
  time:      { type: String, required: true },
  duration:  { type: Number, required: true },
  status:    { type: String, default: 'scheduled' } // 'scheduled', 'live', 'finished'
}, { timestamps: true });
const LiveClass = mongoose.model('LiveClass', LiveClassSchema);

// ─── TEACHER PLATFORMS ROUTES ─────────────────────────────────────────────────

/** GET /api/teacher-platforms?teacherId=xxx → get platforms for a teacher */
app.get('/api/teacher-platforms', async (req, res) => {
  try {
    let { teacherId } = req.query;
    if (req.user && req.user.role === 'admin' && !(((req.user.permissions && req.user.permissions.isOwner) || req.user.id === 'admin'))) {
        teacherId = req.user.id;
    }
    if (!teacherId) return res.status(400).json({ success: false, msg: 'teacherId مطلوب.' });
    const platforms = await TeacherPlatform.find({ teacherId }).sort({ createdAt: 1 });
    res.json({ success: true, platforms });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/** POST /api/teacher-platforms → add new platform */
app.post('/api/teacher-platforms', async (req, res) => {
  try {
    let { name, url, teacherId } = req.body;
    if (req.user && req.user.role === 'admin' && !(((req.user.permissions && req.user.permissions.isOwner) || req.user.id === 'admin'))) {
        teacherId = req.user.id;
    }
    if (!name || !url || !teacherId)
      return res.status(400).json({ success: false, msg: 'name و url و teacherId مطلوبة.' });
    const platform = new TeacherPlatform({ name, url, teacherId });
    await platform.save();
    res.json({ success: true, platform });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/** DELETE /api/teacher-platforms/:id → delete platform */
app.delete('/api/teacher-platforms/:id', async (req, res) => {
  try {
    const platform = await TeacherPlatform.findById(req.params.id);
    if (!platform) return res.status(404).json({ success: false });
    if (req.user && req.user.role === 'admin' && !(((req.user.permissions && req.user.permissions.isOwner) || req.user.id === 'admin'))) {
        if (platform.teacherId !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
    }
    await TeacherPlatform.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Native Chat Logic (WebSockets) ──────────────────────────────────────────
io.on('connection', (socket) => {
    socket.on('join', (room) => {
        socket.join(room);
    });

    socket.on('typing', ({ room, userName, isTyping }) => {
        socket.to(room).emit('user_typing', { userName, isTyping });
    });

    socket.on('mark_read', async ({ msgId, type, userId }) => {
        try {
            if (type === 'private') {
                const updated = await PrivateChat.findByIdAndUpdate(msgId, { isRead: true }, { new: true });
                if (updated) {
                    // Notify original sender that message was seen
                    io.to(updated.senderId).emit('message_seen', { msgId });
                    // Also notify the room
                    const room = [updated.senderId, updated.receiverId].sort().join('_');
                    io.to(room).emit('chat_updated', { type: 'private', msgId, isRead: true });
                }
            } else {
                await GroupChat.findByIdAndUpdate(msgId, { $addToSet: { readBy: userId } });
                io.to(msgId).emit('chat_updated', { type: 'group', msgId, readByUserId: userId });
            }
        } catch (e) { console.error('Socket mark_read error:', e); }
    });

    socket.on('disconnect', () => {
        // console.log('User disconnected:', socket.id);
    });
});

// ─── Helper ───────────────────────────────────────────────────────────────────
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

// ─── PLATFORM DATA ROUTES ─────────────────────────────────────────────────────

/** GET  /api/platform-data  → return the full CMS document */
app.get('/api/platform-data', async (req, res) => {
  try {
    const tenantId = req.tenantId || 'main';
    let doc = await PlatformData.findOne({ docId: tenantId });
    if (!doc) doc = await PlatformData.create({ docId: tenantId, data: { classes: {} } });
    res.json(doc.data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/** POST /api/platform-data  → overwrite the full CMS document */
app.post('/api/platform-data', async (req, res) => {
  try {
    const tenantId = req.tenantId || 'main';
    let doc = await PlatformData.findOne({ docId: tenantId });
    if (!doc) {
      doc = new PlatformData({ docId: tenantId, data: req.body });
    } else {
      doc.data = req.body;
      doc.markModified('data');
    }
    await doc.save();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── LIVE CLASSES ROUTES ──────────────────────────────────────────────────────

/** GET /api/live-classes?teacherId=X&groupId=Y */
app.get('/api/live-classes', async (req, res) => {
  try {
    const { teacherId, groupId } = req.query;
    let query = {};
    if (teacherId) query.teacherId = teacherId;
    if (groupId) query.groupId = groupId;
    
    if (req.user && req.user.role === 'admin' && !(((req.user.permissions && req.user.permissions.isOwner) || req.user.id === 'admin'))) {
        query.teacherId = req.user.id;
    }
    
    // Auto-update status logic based on date/time logic can optionally be placed here,
    // or just parsed by the frontend. We will return them as-is.
    const classes = await LiveClass.find(query).sort({ date: 1, time: 1 });
    res.json({ success: true, liveClasses: classes });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/** POST /api/live-classes */
app.post('/api/live-classes', async (req, res) => {
  try {
    let body = req.body;
    if (req.user && req.user.role === 'admin' && !(((req.user.permissions && req.user.permissions.isOwner) || req.user.id === 'admin'))) {
        body.teacherId = req.user.id;
    }
    const liveClass = new LiveClass(body);
    await liveClass.save();
    res.json({ success: true, liveClass });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/** PUT /api/live-classes/:id */
app.put('/api/live-classes/:id', async (req, res) => {
  try {
    const existing = await LiveClass.findById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, msg: 'الحصة غير موجودة' });
    if (req.user && req.user.role === 'admin' && !(((req.user.permissions && req.user.permissions.isOwner) || req.user.id === 'admin'))) {
        if (existing.teacherId !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
        req.body.teacherId = req.user.id;
    }
    const liveClass = await LiveClass.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ success: true, liveClass });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/** DELETE /api/live-classes/:id */
app.delete('/api/live-classes/:id', async (req, res) => {
  try {
    const existing = await LiveClass.findById(req.params.id);
    if (!existing) return res.status(404).json({ success: false });
    if (req.user && req.user.role === 'admin' && !(((req.user.permissions && req.user.permissions.isOwner) || req.user.id === 'admin'))) {
        if (existing.teacherId !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
    }
    await LiveClass.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── USER ROUTES ──────────────────────────────────────────────────────────────

/** POST /api/auth/login  → { phone, password } → { success, user } */
app.post('/api/auth/login', async (req, res) => {
  try {
    const { phone, password, classId, groupId } = req.body;
    if (!phone || !password)
      return res.status(400).json({ success: false, msg: 'يرجى إدخال رقم الهاتف والكود.' });

    const user = await User.findOne({ phone, password });
    if (!user)
      return res.status(401).json({ success: false, msg: 'بيانات الدخول غير صحيحة.' });

    if (user.status === 'inactive')
      return res.status(403).json({ success: false, msg: 'حسابك غير نشط حالياً. يرجى انتظار تفعيل الحساب من قبل الإدارة.' });
    
    if (user.status === 'locked')
      return res.status(403).json({ success: false, msg: 'تم إغلاق حسابك، يرجى التواصل مع الإدارة.' });

    // Update class and group if provided at login
    if (classId) user.classId = classId;
    if (groupId) user.groupId = groupId;
    if (classId || groupId) await user.save();

    // Strip sensitive fields before sending
    const { password: _p, deviceId: _d, ...safeUser } = user.toObject();
    res.json({ success: true, user: safeUser });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/** POST /api/auth/register → { name, phone, password, classId } → { success, user } */
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, phone, password, classId, groupId, parentPhone, school, tenantId } = req.body;
    if (!name || !phone || !password || !classId || !groupId)
      return res.status(400).json({ success: false, msg: 'يرجى إكمال جميع البيانات الأساسية واختيار الصف والمجموعة.' });

    // Check if phone or ID already exists (ID generated automatically if not provided)
    const existing = await User.findOne({ phone });
    if (existing) return res.status(409).json({ success: false, msg: 'رقم الهاتف مسجل بالفعل.' });

    const newUser = new User({
      id: generateId(),
      name,
      phone,
      password,
      classId,
      groupId,
      parentPhone,
      school,
      role: 'student',
      status: 'inactive',
      tenantId: tenantId || 'main'
    });

    await newUser.save();
    const { password: _p, ...safeUser } = newUser.toObject();
    res.json({ success: true, user: safeUser });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/** GET  /api/users          → list all users (admin) */
app.get('/api/users', async (req, res) => {
  try {
    let query = {};
    if (req.user && req.user.role === 'admin' && !(((req.user.permissions && req.user.permissions.isOwner) || req.user.id === 'admin'))) {
        query = { $or: [{ id: req.user.id }, { tenantId: req.user.id }] };
    }
    const users = await User.find(query);
    res.json(users);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/** POST /api/users          → create new user (admin) */
app.post('/api/users', async (req, res) => {
  try {
    const body = req.body;
    if (!body.id) body.id = generateId();
    
    if (req.user && req.user.role === 'admin') {
        if (!(((req.user.permissions && req.user.permissions.isOwner) || req.user.id === 'admin'))) {
            body.role = 'student';
            body.tenantId = req.user.id;
        } else {
            if (body.role === 'admin' && !(((body.permissions && body.permissions.isOwner) || body.id === 'admin'))) {
                body.tenantId = body.id;
            } else {
                body.tenantId = 'main';
            }
        }
    } else {
        body.tenantId = 'main';
    }

    const user = new User(body);
    await user.save();
    const { password: _p, ...safeUser } = user.toObject();
    res.json({ success: true, user: safeUser });
  } catch (e) {
    if (e.code === 11000) {
      const key = Object.keys(e.keyPattern || {})[0];
      const msg = key === 'phone' ? 'رقم الهاتف مستخدم بالفعل.' : 'هذا المعرّف (ID) مستخدم بالفعل.';
      return res.status(409).json({ success: false, msg });
    }
    res.status(500).json({ error: e.message });
  }
});

/** PUT  /api/users/:id      → update user by custom `id` field */
app.put('/api/users/:id', async (req, res) => {
  try {
    let query = { id: req.params.id };
    if (req.user && req.user.role === 'admin' && !(((req.user.permissions && req.user.permissions.isOwner) || req.user.id === 'admin'))) {
         query = { id: req.params.id, $or: [{ id: req.user.id }, { tenantId: req.user.id }] };
    }
    const updated = await User.findOneAndUpdate(query, req.body, { new: true }).select('-password');
    if (!updated) return res.status(404).json({ success: false, msg: 'المستخدم غير موجود.' });
    res.json({ success: true, user: updated });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/** GET  /api/users/:id      → get single user by custom `id` field (for session verification) */
app.get('/api/users/:id', async (req, res) => {
  try {
    const user = await User.findOne({ id: req.params.id }).select('-password -deviceId');
    if (!user) return res.status(404).json({ success: false, msg: 'المستخدم غير موجود.' });
    res.json(user.toObject());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/** DELETE /api/users/:id   → delete user by custom `id` field */
app.delete('/api/users/:id', async (req, res) => {
  try {
    let query = { id: req.params.id };
    if (req.user && req.user.role === 'admin' && !(((req.user.permissions && req.user.permissions.isOwner) || req.user.id === 'admin'))) {
         query = { id: req.params.id, $or: [{ id: req.user.id }, { tenantId: req.user.id }] };
    }
    const deleted = await User.findOneAndDelete(query);
    if (!deleted) return res.status(404).json({ success: false, msg: 'User not found or unauthorized' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/** GET  /api/honor-board           → get all honor board entries */
app.get('/api/honor-board', async (req, res) => {
  try {
    const tenantId = req.tenantId || 'main';
    let doc = await PlatformData.findOne({ docId: tenantId });
    const honorBoard = doc?.data?.honorBoard || {};
    res.json({ success: true, honorBoard });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/** POST /api/honor-board           → save honor board for a class/group */
app.post('/api/honor-board', async (req, res) => {
  try {
    const { classId, groupId, students } = req.body;
    if (!classId || !groupId || !Array.isArray(students))
      return res.status(400).json({ success: false, msg: 'بيانات ناقصة.' });
    
    const tenantId = req.tenantId || 'main';
    let doc = await PlatformData.findOne({ docId: tenantId });
    if (!doc) return res.status(404).json({ success: false, msg: 'لا توجد بيانات منصة.' });
    
    if (!doc.data.honorBoard) doc.data.honorBoard = {};
    const key = `${classId}_${groupId}`;
    doc.data.honorBoard[key] = { classId, groupId, students, updatedAt: new Date().toISOString() };
    doc.markModified('data');
    await doc.save();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── CHAT API ──────────────────────────────────────────────────────────────

// GET group messages
app.get('/api/chat/group/:groupId', async (req, res) => {
    try {
        const messages = await GroupChat.find({ groupId: req.params.groupId }).sort({ timestamp: 1 });
        res.json({ success: true, messages });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST group message
app.post('/api/chat/group', async (req, res) => {
    try {
        const { groupId, senderId, senderName, message, replyTo } = req.body;
        const msg = new GroupChat({ groupId, senderId, senderName, message, replyTo });
        await msg.save();
        io.to(groupId).emit('new_message', { type: 'group', message: msg });
        res.json({ success: true, message: msg });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET private messages
app.get('/api/chat/private/:uid1/:uid2', async (req, res) => {
    try {
        const { uid1, uid2 } = req.params;
        const messages = await PrivateChat.find({
            $or: [
                { senderId: uid1, receiverId: uid2 },
                { senderId: uid2, receiverId: uid1 }
            ]
        }).sort({ timestamp: 1 });
        res.json({ success: true, messages });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST private message
app.post('/api/chat/private', async (req, res) => {
    try {
        const { senderId, receiverId, senderName, message, replyTo } = req.body;
        const msg = new PrivateChat({ senderId, receiverId, senderName, message, replyTo });
        await msg.save();

        const room = [senderId, receiverId].sort().join('_');
        io.to(room).emit('new_message', { type: 'private', message: msg });
        
        // Also notify the receiver individually for badges
        io.to(receiverId).emit('unread_badge', { type: 'private', senderId });

        res.json({ success: true, message: msg });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// TOGGLE pin message
app.put('/api/chat/:type/:msgId/pin', async (req, res) => {
    try {
        const { type, msgId } = req.params;
        const Model = type === 'group' ? GroupChat : PrivateChat;
        const msg = await Model.findById(msgId);
        if (!msg) return res.status(404).json({ success: false, msg: 'الرسالة غير موجودة.' });
        msg.isPinned = !msg.isPinned;
        await msg.save();
        res.json({ success: true, isPinned: msg.isPinned });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE message
app.delete('/api/chat/:type/:msgId', async (req, res) => {
    try {
        const { type, msgId } = req.params;
        const Model = type === 'group' ? GroupChat : PrivateChat;
        await Model.findByIdAndDelete(msgId);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── NOTIFICATIONS API ────────────────────────────────────────────────────────

app.post('/api/notifications/notify-group', async (req, res) => {
    try {
        const { group_id, title, type, link } = req.body;
        if (!group_id || !title) return res.status(400).json({ success: false, msg: 'Missing parameters.' });

        const users = await User.find({ groupId: group_id });
        if (!users || users.length === 0) return res.json({ success: true, count: 0 });

        const notifications = users.map(user => ({
            userId: user.id,
            title: 'تم إضافة محتوى جديد',
            details: title,
            type: type || 'lesson',
            link: link || '',
            isRead: false
        }));

        await Notification.insertMany(notifications);

        users.forEach(user => {
            io.to(user.id).emit('new_notification', {
                title: 'تم إضافة محتوى جديد',
                details: title,
                type: type || 'lesson',
                link: link || '',
                createdAt: new Date()
            });
        });

        res.json({ success: true, count: users.length });
    } catch (e) {
        console.error('Notify Group Error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/notifications/:userId', async (req, res) => {
    try {
        const notifications = await Notification.find({ userId: req.params.userId }).sort({ createdAt: -1 }).limit(50);
        res.json({ success: true, notifications });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/notifications/:id/read', async (req, res) => {
    try {
        await Notification.findByIdAndUpdate(req.params.id, { isRead: true });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});
/** PUT  /api/users/:id/reset-device  → clear deviceId lock */
app.put('/api/users/:id/reset-device', async (req, res) => {
  try {
    let query = { id: req.params.id };
    if (req.user && req.user.role === 'admin' && !(((req.user.permissions && req.user.permissions.isOwner) || req.user.id === 'admin'))) {
        query.tenantId = req.user.id;
    }
    const updated = await User.findOneAndUpdate(query, { deviceId: '' });
    if (!updated) return res.status(404).json({ success: false, msg: 'المستخدم غير موجود' });
    res.json({ success: true, msg: 'تم إعادة تعيين قفل الجهاز.' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/** PUT  /api/users/:id/progress  → update completedLessons & xp */
app.put('/api/users/:id/progress', async (req, res) => {
  try {
    const { lessonId, xpReward, score, answers } = req.body;
    const user = await User.findOne({ id: req.params.id });
    if (!user) return res.status(404).json({ success: false });
    
    // Always update or set the quiz score and answers if provided
    if (score !== undefined) {
      if (typeof user.quizScores !== 'object') user.quizScores = {};
      user.quizScores[lessonId] = score;
      user.markModified('quizScores');
    }
    if (answers !== undefined) {
      if (typeof user.quizAnswers !== 'object') user.quizAnswers = {};
      user.quizAnswers[lessonId] = answers;
      user.markModified('quizAnswers');
    }

    if (!user.completedLessons.includes(lessonId)) {
      user.completedLessons.push(lessonId);
      user.xp = (user.xp || 0) + (xpReward || 50);
    }
    await user.save();
    
    res.json({ 
      success: true, 
      xp: user.xp, 
      completedLessons: user.completedLessons,
      quizScores: user.quizScores,
      quizAnswers: user.quizAnswers
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── SEED route (one-time, for demo accounts) ─────────────────────────────────
app.post('/api/seed', async (req, res) => {
  try {
    const demos = [
      { id: '2024001', name: 'طالب Numi',  phone: '01000000000', password: '2024001', role: 'student', status: 'inactive' },
      { id: '12345',   name: 'أحمد محمد',  phone: '01012345678', password: '12345',   role: 'student', status: 'inactive' },
      { id: 'admin',   name: 'المدير العام', phone: '01099999999', password: 'Numi@2026', role: 'admin', status: 'active' }
    ];
    for (const d of demos) {
      await User.updateOne({ id: d.id }, { $set: d }, { upsert: true });
    }
    res.json({ success: true, seeded: demos.length, adminPhone: '01099999999', adminPassword: 'Numi@2026' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── QUIZ ATTEMPT ROUTES ──────────────────────────────────────────────────────
/** GET Check attempt status */
app.get('/api/quiz/attempts/:userId/:lessonId', async (req, res) => {
    try {
        const { userId, lessonId } = req.params;
        // Search for attempt with flexible matching
        const attempt = await QuizAttempt.findOne({ userId, lessonId }).sort({ createdAt: -1 });
        res.json(attempt || null);
    } catch (e) {
        console.error('Quiz Status Retrieval Error:', e.message);
        res.status(500).json({ error: 'Database access failed' });
    }
});

/** POST Start a new attempt */
app.post('/api/quiz/attempts/start', async (req, res) => {
    try {
        const { userId, lessonId, deviceId, initialTime } = req.body;
        
        // Find the latest attempt
        let attempt = await QuizAttempt.findOne({ userId, lessonId }).sort({ attemptNum: -1 });
        
        if (attempt) {
            // If the latest is completed, and we haven't explicitely started a new numbered one...
            // Wait, if it's completed, student can't restart unless admin created a new 'pending' one.
            if (attempt.status === 'completed') {
                return res.json({ success: false, msg: 'AlreadyCompleted', attempt });
            }
            
            if (attempt.deviceId && attempt.deviceId !== deviceId) {
                return res.status(403).json({ success: false, msg: 'MultipleDevice' });
            }
            return res.json({ success: true, attempt });
        }
        
        // Create first attempt if none exists
        attempt = await QuizAttempt.create({ userId, lessonId, deviceId, remainingTime: initialTime, attemptNum: 1 });
        res.json({ success: true, attempt });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

/** PUT Sync attempt (answers & time) */
app.put('/api/quiz/attempts/:userId/:lessonId/sync', async (req, res) => {
    try {
        const { answers, remainingTime, deviceId } = req.body;
        // Find the latest pending attempt
        const attempt = await QuizAttempt.findOne({ 
            userId: req.params.userId, 
            lessonId: req.params.lessonId,
            status: 'in-progress'
        }).sort({ attemptNum: -1 });

        if (!attempt) return res.json({ success: false });
        if (attempt.deviceId && attempt.deviceId !== deviceId) return res.status(403).json({ error: 'DeviceMismatch' });
        
        attempt.answers = answers;
        attempt.remainingTime = remainingTime;
        await attempt.save();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

/** POST Submit attempt */
app.post('/api/quiz/attempts/:userId/:lessonId/submit', async (req, res) => {
    try {
        const { score, answers, deviceId } = req.body;
        // Find the latest pending attempt
        const attempt = await QuizAttempt.findOne({ 
            userId: req.params.userId, 
            lessonId: req.params.lessonId,
            status: 'in-progress'
        }).sort({ attemptNum: -1 });

        if (!attempt) return res.json({ success: false });
        if (attempt.deviceId && attempt.deviceId !== deviceId) return res.status(403).json({ error: 'DeviceMismatch' });
        
        attempt.score = score;
        attempt.answers = answers;
        attempt.status = 'completed';
        attempt.endTime = new Date();
        attempt.remainingTime = 0;
        await attempt.save();
        res.json({ success: true, attempt });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

/** AI Lesson Generator */
app.post('/api/lesson/generate', async (req, res) => {
    try {
        const { keywords } = req.body;
        if (!keywords) return res.status(400).json({ error: 'Keywords are required.' });

        const systemPrompt = `
أنت مصمم ومنشئ محتوى تعليمي تفاعلي محترف.
مهمتك هي إنشاء درس تفاعلي بصيغة HTML متكاملة ليعمل داخل iframe في منصة تعتمد على النمط المظلم (Dark Mode / Cosmic Theme).
عليك إنشاء المحتوى التعليمي للدرس بناءً على الموضوع المطلوب، ثم دمج هذا المحتوى داخل قالب الـ HTML المبين أدناه.

موضوع الدرس المطلوب: "${keywords}"

يجب أن تقوم بملء الهيكل التالي بالبيانات التعليمية (الشرح، الأمثلة، التدريبات) وتخرج كود HTML كاملاً فقط (بدون أي نصوص خارج الكود، وبدون علامات \`\`\`html):

<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<style>
@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap');
:root {
  --bg: #0b1220; --surface: #111827; --card: #1a2436; --card2: #1e2d45;
  --accent: #38bdf8; --accent2: #fb923c; --accent3: #34d399; --accent4: #a78bfa; --accent5: #f472b6;
  --gold: #fbbf24; --text: #e2e8f0; --muted: #94a3b8;
  --border: rgba(56,189,248,0.12); --border2: rgba(255,255,255,0.06);
}
* { margin:0; padding:0; box-sizing:border-box; font-family: 'Cairo', sans-serif; }
body { background: var(--bg); color: var(--text); padding: 20px; line-height: 1.6; }
.card { background: var(--card); border-radius: 16px; padding: 24px; margin-bottom: 24px; border: 1px solid var(--border); box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
.hero { text-align: center; margin-bottom: 30px; padding: 20px; background: linear-gradient(135deg, var(--card), var(--card2)); border-radius: 16px; border: 1px solid var(--border); }
.hero h1 { color: var(--accent); margin-bottom: 10px; font-weight: 900; }
.phase-nav { display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; justify-content: center; }
.phase-btn { padding: 12px 24px; font-weight: 700; background: var(--surface); color: var(--muted); border: 1px solid var(--border2); border-radius: 12px; cursor: pointer; transition: 0.3s; }
.phase-btn:hover { background: rgba(255,255,255,0.05); }
.phase-btn.active { background: rgba(56,189,248,0.15); color: var(--accent); border-color: var(--accent); }
.phase-content { display: none; animation: fadeIn 0.4s ease; }
.phase-content.active { display: block; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
.math-box { background: rgba(0,0,0,0.4); padding: 15px; border-radius: 8px; font-size: 1.2rem; color: var(--accent3); text-align: center; margin: 15px 0; border-right: 4px solid var(--accent3); }
h2 { color: var(--accent2); margin-bottom: 15px; font-weight: 800; }
h3 { color: var(--accent4); margin-top: 15px; font-weight: 700; }
.quiz-option { display: block; width: 100%; text-align: right; padding: 15px; margin-bottom: 10px; background: var(--surface); border: 1px solid var(--border2); border-radius: 8px; cursor: pointer; transition: 0.3s; color: white; font-size: 1rem; }
.quiz-option:hover { background: var(--border2); }
.quiz-option.correct { background: rgba(52, 211, 153, 0.2); border-color: var(--accent3); color: var(--accent3); }
.quiz-option.wrong { background: rgba(248, 113, 113, 0.2); border-color: #f87171; color: #f87171; }
.feedback { margin-top: 10px; font-weight: bold; display: none; padding: 10px; border-radius: 8px; }
.feedback.success { display: block; background: rgba(52,211,153,0.1); color: var(--accent3); }
.feedback.error { display: block; background: rgba(248,113,113,0.1); color: #f87171; }
</style>
</head>
<body>
<div class="hero">
  <h1>[عنوان الدرس الرائع هنا بناءً على المدخلات]</h1>
  <p style="color: var(--muted);">[مقدمة مشوقة وقصيرة جداً لجذب انتباه الطالب]</p>
</div>

<div class="phase-nav">
  <button class="phase-btn active" onclick="showPhase(1)">1️⃣ الشرح المبسط</button>
  <button class="phase-btn" onclick="showPhase(2)">2️⃣ أمثلة محلولة</button>
  <button class="phase-btn" onclick="showPhase(3)">3️⃣ اختبر نفسك</button>
</div>

<div id="phase1" class="phase-content active card">
  <h2>الشرح الأساسي والمفاهيم</h2>
  <p>[قم بصياغة الشرح هنا بطريقة سردية وممتعة، استخدم القوائم أو فقرات قصيرة]</p>
  <div class="math-box">[ضع قاعدة رياضية أو علمية هنا إن وجدت]</div>
</div>

<div id="phase2" class="phase-content card">
  <h2>أمثلة خطوة بخطوة</h2>
  <!-- أضف 2 أو 3 أمثلة قوية ومحلولة بالتفصيل مع تلوين الخطوات إن أمكن -->
</div>

<div id="phase3" class="phase-content card">
  <h2>تحدي المعرفة السريع</h2>
  <!-- أضف سؤال تفاعلي أو سؤالين بحيث عندما يضغط الطالب يتم تقييم الإجابة وعرض رسالة نجاح أو خطأ -->
  <div id="q1">
      <p style="margin-bottom:15px; font-weight:bold; font-size:1.1rem;">[نص السؤال التفاعلي التفكير هنا]</p>
      <button class="quiz-option" onclick="checkAnswer(this, false, 'q1')">[خيار خاطئ]</button>
      <button class="quiz-option" onclick="checkAnswer(this, true, 'q1')">[الخيار الصحيح]</button>
      <button class="quiz-option" onclick="checkAnswer(this, false, 'q1')">[خيار خاطئ آخر]</button>
      <div class="feedback" id="feedback-q1"></div>
  </div>
</div>

<script>
function showPhase(num) {
  document.querySelectorAll('.phase-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.phase-btn').forEach(el => el.classList.remove('active'));
  document.getElementById('phase' + num).classList.add('active');
  document.querySelectorAll('.phase-btn')[num-1].classList.add('active');
}

function checkAnswer(btn, isCorrect, qId) {
  const container = document.getElementById(qId);
  const options = container.querySelectorAll('.quiz-option');
  options.forEach(opt => {
      opt.disabled = true;
      opt.style.cursor = 'not-allowed';
      if(opt.getAttribute('onclick').includes('true')) opt.classList.add('correct');
  });
  
  const feedback = document.getElementById('feedback-' + qId);
  if (isCorrect) {
      feedback.className = 'feedback success';
      feedback.innerHTML = 'إجابة رائعة! 🎉 [أضف تفسير قصير للإجابة في القالب]';
  } else {
      btn.classList.add('wrong');
      feedback.className = 'feedback error';
      feedback.innerHTML = 'حاول مرة أخرى! 🤔 [أضف توضيح للخطأ]';
  }
}
</script>
</body>
</html>

يجب أن تولد الكود أعلاه مستعيضاً عن الأقواس المربعة [...] بمحتوى حقيقي ومفصل متعلق بـ: "${keywords}".
اجعل الشرح غنياً، وأضف تفاعلات مفيدة ومحتوى غني وأمثلة واضحة وأسئلة تفاعلية حقيقية تعمل بـ JS.
`;

        const completion = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `قم بإنشاء الدرس الآن للكلمات المفتاحية: ${keywords}` }
            ]
        });

        const reply = completion.choices[0].message.content.trim();
        const html = reply.replace(/^```html|```$/gi, '').trim();
        res.json({ success: true, html });
    } catch (e) {
        console.error('Lesson Gen Error:', e.message);
        res.status(500).json({ error: 'تعذر توليف الدرس حالياً.' });
    }
});

/** AI Quiz Generator for Teachers */
app.post('/api/quiz/generate', async (req, res) => {
    try {
        const { text, language } = req.body;
        if (!text) return res.status(400).json({ error: 'Text is required.' });

        const systemPrompt = `
أنت مساعد ذكي للمعلمين، وظيفتك تحويل الأسئلة المكتوبة من المعلم إلى اختبارات منظمة بصيغة JSON.
تلقائيًا، افهم كل سؤال وحدد نوعه (mcq, short, boolean).
تنسيق الـ JSON المطلوب:
{
  "quizzes": [
    {
      "id": "quiz_unique_id",
      "questions": [
        {
          "type": "mcq", // mcq, short, boolean
          "question": "نص السؤال هنا",
          "options": ["خيار 1", "خيار 2", "خيار 3"], // للمتعدد فقط
          "answer": "الإجابة الصحيحة أو النص المتوقع"
        }
      ]
    }
  ]
}
شروط هامة:
1. استخدم نفس لغة المعلم (${language || 'auto'}).
2. لا تضف أسئلة من عندك.
3. الإخراج يجب أن يكون JSON صالح فقط بدون نص إضافي.
`;

        const completion = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: text }
            ],
            response_format: { type: "json_object" }
        });

        res.json(JSON.parse(completion.choices[0].message.content));
    } catch (e) {
        console.error('Quiz Gen Error:', e.message);
        res.status(500).json({ error: 'تعذر توليف الاختبار حالياً.' });
    }
});

// ─── CHAT SESSION ROUTES ──────────────────────────────────────────────────────
/** Start a new chat session for a user */
app.post('/api/chat/session/new', async (req, res) => {
    try {
        const { userId } = req.body;
        if (!userId) return res.status(400).json({ error: 'UserID is required.' });
        const sessionId = generateId();
        const session = await ChatSession.create({ id: sessionId, userId, messages: [] });
        res.json({ success: true, sessionId });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

/** Get all previous sessions for a user */
app.get('/api/chat/history/:userId', async (req, res) => {
    try {
        const sessions = await ChatSession.find({ userId: req.params.userId }).sort({ createdAt: -1 });
        res.json(sessions);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── AI CHAT ROUTE ───────────────────────────────────────────────────────────
app.post('/api/chat', async (req, res) => {
  try {
    const { message, history, studentGrade, userId, sessionId } = req.body;
    
    // If sessionId provided, save the USER message first
    if (sessionId) {
        await ChatSession.updateOne(
            { id: sessionId },
            { $push: { messages: { isUser: true, text: message, timestamp: new Date() } } }
        );
    }
    
    const systemPrompt = `
أنت مدرس رياضيات محترف، مساعد لكل طالب على المنصة.

⚡ ملاحظة مهمة: يجب أن تجيب الطالب **من عندك ومن خبرتك**، **بدون الاعتماد على أي ملفات PDF**.  
لكن الإجابات يجب أن تكون **محدودة تمامًا ضمن منهج الصف الدراسي للطالب**. لا تخرج عن نطاق المنهج للصف الذي يدرسه الطالب.

1️⃣ تلقائيًا، عند استلام السؤال، المنصة تزودك بالصف الدراسي للطالب في المتغير: {student_grade}. تم تزويدك به الآن: ${studentGrade || 'غير محدد'}.

2️⃣ أي سؤال خارج الرياضيات: أجب
   "أنا متخصص في الرياضيات فقط، لا يمكنني الإجابة على هذا السؤال."

3️⃣ **شرح السؤال يجب أن يكون تفصيلي جدًا ومنسق بشكل واضح**:
   - كل خطوة في سطر منفصل  
   - رقّم الخطوات (1، 2، 3…)  
   - ضع عناوين فرعية إذا كان الشرح طويل (مثلاً: **الخطوة 1: التحليل**، **الخطوة 2: الحساب**)  
   - ضع مسافات بين الخطوات لتسهيل القراءة  
   - استخدم أمثلة صغيرة داخل الشرح إذا لزم الأمر لتوضيح النقطة  

4️⃣ بعد الانتهاء، اكتب **النتيجة النهائية** في سطر منفصل وواضح.

5️⃣ إذا الطالب لم يفهم الشرح، أعد الشرح بطريقة مختلفة خطوة خطوة، بدون إعطاء الحل النهائي مباشرة.

6️⃣ **حدد لغة الإجابة حسب لغة السؤال**:
   - إذا كان السؤال بالعربية → أجب بالعربية  
   - إذا كان السؤال بالإنجليزية → أجب بالإنجليزية

7️⃣ اجعل الرد **مريح للعين، منسق، وسهل المتابعة لكل طالب**.

8️⃣ عند كتابة المعادلات، استخدم تنسيق LaTeX حصراً:
   - للسطور المنفصلة: استخدم $$ (المعادلة) $$
   - داخل الجمل: استخدم $ (المعادلة) $
   - **هام جداً:** لكتابة الأسس (مثل x تربيع)، استخدم $ x^2 $ لتظهر بشكل صحيح (x وعليها 2 صغيرة).
   - **تحذير:** لا تستخدم أبداً الأقواس المربعة [ ] وحدها ولا تكتب الرموز ككلام عادي؛ استخدم دائماً إشارات الدولار ($) ليتمكن النظام من تحويلها لرموز رياضية احترافية.
`;

    const chatHistory = history || [];
    const messages = [
      { role: 'system', content: systemPrompt },
      ...chatHistory.map(m => ({ role: m.isUser ? 'user' : 'assistant', content: m.text })),
      { role: 'user', content: message }
    ];

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o', // or gpt-4-turbo-preview
      messages: messages,
      max_tokens: 1000,
      temperature: 0.7
    });

    const reply = completion.choices[0].message.content;

    // Save BOT message
    if (sessionId) {
        await ChatSession.updateOne(
            { id: sessionId },
            { $push: { messages: { isUser: false, text: reply, timestamp: new Date() } } }
        );
    }

    res.json({ success: true, reply });
  } catch (e) {
    console.error('OpenAI Error:', e.message);
    res.status(500).json({ success: false, error: 'تعذر التواصل مع المعلم الذكي حالياً.' });
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────


/** ADMIN: Get lesson reports */
app.get('/api/admin/reports/:lessonId', async (req, res) => {
    try {
        console.log("Fetching reports for lesson:", req.params.lessonId);
        const attempts = await QuizAttempt.find({ lessonId: req.params.lessonId }).lean();
        
        if(!attempts || attempts.length === 0) {
            console.log("No completed attempts found.");
            return res.json([]);
        }

        // Get unique user identifiers from attempts
        const rawUserIds = [...new Set(attempts.map(a => String(a.userId)).filter(Boolean))];
        
        const validObjectIds = [];
        const phoneStrings = [];

        // Rigorous classification of user IDs
        for (const id of rawUserIds) {
            try {
                // If it's a 24-char string and can be converted to ObjectId, it's an ID
                if (id.length === 24) {
                    new mongoose.Types.ObjectId(id); // Test conversion
                    validObjectIds.push(id);
                } else {
                    phoneStrings.push(id);
                }
            } catch (e) {
                // Not a valid ObjectId (must be a phone number)
                phoneStrings.push(id);
            }
        }
        
        let userQuery = {};
        if (req.user && req.user.role === 'admin' && !(((req.user.permissions && req.user.permissions.isOwner) || req.user.id === 'admin'))) {
            userQuery.tenantId = req.user.id;
        }
        
        const [usersById, usersByPhone] = await Promise.all([
            User.find({ _id: { $in: validObjectIds }, ...userQuery }).lean(),
            User.find({ phone: { $in: phoneStrings }, ...userQuery }).lean()
        ]);
        
        const allMatchedUsers = [...usersById, ...usersByPhone];
        
        const report = attempts.map(attempt => {
            const uid = String(attempt.userId);
            const user = allMatchedUsers.find(u => 
                u._id.toString() === uid || 
                u.phone === uid
            );
            return {
                ...attempt,
                studentName: user ? user.name : 'طالب (بيانات ناقصة)',
                studentGroup: user ? user.groupId : '---',
                studentPhone: user ? user.phone : (uid.length < 15 ? uid : '---')
            };
        });
        console.log(`Report generated with ${report.length} students.`);
        res.json(report);
    } catch (e) { 
        console.error("REPORT ERROR:", e);
        res.status(500).json({ error: "خطأ تقني: " + e.message }); 
    }
});


/** ADMIN: Reset quiz attempts for a student on a lesson + set 2-day deadline */
app.delete('/api/admin/reports/:lessonId/user/:userId', async (req, res) => {
    try {
        const { lessonId, userId } = req.params;
        const days = parseInt(req.query.days) || 2;
        const deadline = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

        // 1) Delete all their attempts for this lesson
        const result = await QuizAttempt.deleteMany({ lessonId, userId });
        console.log(`Reset quiz: deleted ${result.deletedCount} attempts for user ${userId}`);

        // 2) Store reset window in the user document (try ObjectId first, then phone)
        const resetField = `quizResets.${lessonId.replace(/\./g, '_')}`;
        const resetValue = { allowedUntil: deadline, resetAt: new Date(), days };
        let updated = false;

        // Try as ObjectId
        try {
            if (userId.length === 24) {
                const u = await User.findByIdAndUpdate(
                    userId,
                    { $set: { [resetField]: resetValue } },
                    { new: true, upsert: false }
                );
                if (u) updated = true;
            }
        } catch(e) {}

        // Fallback: try by phone
        if (!updated) {
            await User.findOneAndUpdate(
                { phone: userId },
                { $set: { [resetField]: resetValue } }
            );
        }

        res.json({ success: true, deletedCount: result.deletedCount, deadline, days });
    } catch (e) {
        console.error('Reset quiz error:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

/** STUDENT: Check quiz reset window */
app.get('/api/quiz-reset-check/:userId/:lessonId', async (req, res) => {
    try {
        const { userId, lessonId } = req.params;
        const safeKey = lessonId.replace(/\./g, '_');
        let user = null;
        try { if (userId.length === 24) user = await User.findById(userId).lean(); } catch(e) {}
        if (!user) user = await User.findOne({ phone: userId }).lean();
        if (!user) return res.json({ hasReset: false });

        const resetData = user.quizResets?.[safeKey];
        if (!resetData) return res.json({ hasReset: false });

        const now = new Date();
        const deadline = new Date(resetData.allowedUntil);
        const expired = now > deadline;

        res.json({
            hasReset: true,
            allowedUntil: resetData.allowedUntil,
            resetAt: resetData.resetAt,
            days: resetData.days || 2,
            expired,
            hoursLeft: expired ? 0 : Math.ceil((deadline - now) / 3600000)
        });
    } catch(e) {
        res.status(500).json({ hasReset: false, error: e.message });
    }
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Numi Backend running with WebSockets → http://localhost:${PORT}`);
});
