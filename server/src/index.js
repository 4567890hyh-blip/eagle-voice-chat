require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const cors = require('cors');
const path = require('path');
const multer = require('multer');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, '../../uploads')));

mongoose.set('strictQuery', false);

// ============ إعداد رفع الملفات ============
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(__dirname, '../../uploads')),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// ============ نظام التوكن ============
const generateToken = (userId) => jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
const verifyToken = (token) => { try { return jwt.verify(token, process.env.JWT_SECRET); } catch { return null; } };

// ============ Middleware ============
const authenticate = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ error: 'No token' });
        const decoded = verifyToken(token);
        if (!decoded) return res.status(401).json({ error: 'Invalid token' });
        const user = await User.findById(decoded.userId);
        if (!user || user.isBanned) return res.status(401).json({ error: 'Unauthorized' });
        req.user = user;
        next();
    } catch { res.status(401).json({ error: 'Auth failed' }); }
};

const authorize = (roles = []) => (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    if (roles.length && !roles.includes(req.user.role)) return res.status(403).json({ error: 'Forbidden' });
    next();
};

// خدمة الملفات الثابتة
app.use(express.static(path.join(__dirname, '../../client')));
app.use('/eagle-voice', express.static(path.join(__dirname, '../../eagle-voice')));

// ============ النماذج ============
const UserSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    email: { type: String, unique: true, sparse: true },
    password: { type: String, required: true },
    phone: String,
    avatar: { type: String, default: '/uploads/default-avatar.png' },
    frame: { type: String, default: '' },      // إطار الصورة (رابط أو اسم)
    entryEffect: { type: String, default: 'default' }, // تأثير دخول (مثل "طيران"، "ورود"، إلخ)
    role: { type: String, enum: ['user', 'admin', 'super_admin'], default: 'user' },
    coins: { type: Number, default: 0 },
    diamonds: { type: Number, default: 0 },
    vipLevel: { type: Number, default: 0 },
    vipExpiry: Date,
    xp: { type: Number, default: 0 },
    level: { type: Number, default: 1 },
    totalGiftsSent: { type: Number, default: 0 },
    totalGiftsReceived: { type: Number, default: 0 },
    isBanned: { type: Boolean, default: false },
    banReason: String,
    warnings: [{ reason: String, date: Date, moderator: String }],
    riskScore: { type: Number, default: 0 },
    deviceId: String,
    devices: [{ deviceId: String, deviceName: String, lastLogin: Date, ip: String }],
    sessions: [{ token: String, deviceId: String, createdAt: Date, expiresAt: Date, ip: String }],
    agencyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agency' },
    transactions: [{ type: String, amount: Number, coins: Number, diamonds: Number, description: String, date: Date, status: String }],
    createdAt: { type: Date, default: Date.now }
});

const RoomSchema = new mongoose.Schema({
    name: { type: String, required: true },
    ownerId: { type: String, required: true },
    users: [{ userId: String, joinedAt: Date, isSpeaking: Boolean }],
    maxMicrophones: { type: Number, default: 5 },      // عدد المايكات المتاحة
    currentSpeakers: [{ type: String }],              // قائمة بأيدي المستخدمين الذين يرفعون المايك
    isMicsLocked: { type: Boolean, default: false },  // قفل المايكات من قبل صاحب الغرفة
    imageUrl: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
});

const AgencySchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    ownerId: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

const GiftSchema = new mongoose.Schema({
    name: { type: String, required: true },
    price: { type: Number, required: true },
    type: { type: String, enum: ['frame', 'entry_effect', 'avatar', 'sound'], default: 'frame' },
    imageUrl: String,
    effectName: String,
    isActive: { type: Boolean, default: true }
});

const GameSchema = new mongoose.Schema({
    name: String,
    houseEdge: { type: Number, default: 5 },
    aiProtectionEnabled: { type: Boolean, default: true },
    isActive: Boolean
});

const WithdrawalSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    amount: Number,
    method: String,
    status: { type: String, enum: ['pending', 'completed', 'rejected'], default: 'pending' },
    createdAt: { type: Date, default: Date.now }
});

const EventSchema = new mongoose.Schema({
    name: String,
    type: String,
    isActive: Boolean,
    startDate: Date,
    endDate: Date,
    createdAt: { type: Date, default: Date.now }
});

const SplashScreenSchema = new mongoose.Schema({
    imageUrl: String,
    duration: Number,
    isActive: Boolean,
    startDate: Date,
    endDate: Date
});

const BannerSchema = new mongoose.Schema({
    imageUrl: String,
    linkUrl: String,
    isActive: Boolean,
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);
const Room = mongoose.model('Room', RoomSchema);
const Agency = mongoose.model('Agency', AgencySchema);
const Gift = mongoose.model('Gift', GiftSchema);
const Game = mongoose.model('Game', GameSchema);
const Withdrawal = mongoose.model('Withdrawal', WithdrawalSchema);
const Event = mongoose.model('Event', EventSchema);
const SplashScreen = mongoose.model('SplashScreen', SplashScreenSchema);
const Banner = mongoose.model('Banner', BannerSchema);

// ============ Routes API ============

// تسجيل / دخول / معلومات المستخدم
app.post('/api/register', async (req, res) => {
    try {
        const { username, password, email, phone, deviceId } = req.body;
        const existing = await User.findOne({ username });
        if (existing) return res.status(400).json({ error: 'اسم المستخدم موجود' });
        const hashed = await bcrypt.hash(password, 10);
        const user = new User({ username, email, phone, password: hashed, deviceId });
        await user.save();
        const token = generateToken(user._id);
        user.sessions.push({ token, deviceId, createdAt: new Date(), expiresAt: new Date(Date.now() + 7*24*60*60*1000), ip: req.ip });
        await user.save();
        res.json({ success: true, token, user: { id: user._id, username: user.username, role: user.role, coins: user.coins, diamonds: user.diamonds, avatar: user.avatar, frame: user.frame, entryEffect: user.entryEffect } });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, password, deviceId } = req.body;
        const user = await User.findOne({ username });
        if (!user || !(await bcrypt.compare(password, user.password))) return res.status(401).json({ error: 'بيانات غير صحيحة' });
        if (user.isBanned) return res.status(403).json({ error: 'الحساب محظور' });
        user.devices.push({ deviceId, lastLogin: new Date(), ip: req.ip });
        user.currentDeviceId = deviceId;
        user.lastLoginIp = req.ip;
        user.lastLoginDate = new Date();
        const token = generateToken(user._id);
        user.sessions.push({ token, deviceId, createdAt: new Date(), expiresAt: new Date(Date.now() + 7*24*60*60*1000), ip: req.ip });
        await user.save();
        res.json({ success: true, token, user: { id: user._id, username: user.username, role: user.role, coins: user.coins, diamonds: user.diamonds, vipLevel: user.vipLevel, avatar: user.avatar, frame: user.frame, entryEffect: user.entryEffect } });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/user', authenticate, async (req, res) => {
    res.json({ user: req.user });
});

// رفع صورة بروفايل
app.post('/api/upload-avatar', authenticate, upload.single('avatar'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'لم يتم رفع ملف' });
    req.user.avatar = '/uploads/' + req.file.filename;
    await req.user.save();
    res.json({ success: true, avatar: req.user.avatar });
});

// شراء إطار أو تأثير دخول
app.post('/api/buy-item', authenticate, async (req, res) => {
    const { itemId, type } = req.body; // type: 'frame' أو 'entry_effect'
    const gift = await Gift.findOne({ _id: itemId, type, isActive: true });
    if (!gift) return res.status(404).json({ error: 'العنصر غير موجود' });
    if (req.user.coins < gift.price) return res.status(400).json({ error: 'رصيد غير كاف' });
    req.user.coins -= gift.price;
    if (type === 'frame') req.user.frame = gift.imageUrl || gift.name;
    else if (type === 'entry_effect') req.user.entryEffect = gift.effectName || gift.name;
    await req.user.save();
    res.json({ success: true, frame: req.user.frame, entryEffect: req.user.entryEffect, newBalance: req.user.coins });
});

// ============ إدارة المستخدمين (Admin) ============
app.get('/api/admin/users', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    const { search } = req.query;
    let query = {};
    if (search) query.username = { $regex: search, $options: 'i' };
    const users = await User.find(query).select('-password -sessions');
    res.json({ users });
});

app.post('/api/admin/ban-user', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    const { userId, reason } = req.body;
    const user = await User.findByIdAndUpdate(userId, { isBanned: true, banReason: reason }, { new: true });
    res.json({ success: true, message: `تم حظر ${user.username}` });
});

app.post('/api/admin/unban-user/:userId', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    await User.findByIdAndUpdate(req.params.userId, { isBanned: false, banReason: null });
    res.json({ success: true });
});

app.post('/api/admin/add-coins', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    const { userId, coins } = req.body;
    await User.findByIdAndUpdate(userId, { $inc: { coins } });
    res.json({ success: true });
});

app.get('/api/admin/stats', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    const totalUsers = await User.countDocuments();
    const totalCoins = (await User.aggregate([{ $group: { _id: null, total: { $sum: "$coins" } } }]))[0]?.total || 0;
    res.json({ stats: { totalUsers, onlineUsers: global.onlineUsers?.size || 0, totalCoins } });
});

// ============ الغرف (API + Socket.IO) ============
app.get('/api/rooms', async (req, res) => {
    const rooms = await Room.find({ isActive: true }).sort({ createdAt: -1 });
    res.json(rooms);
});

// ============ تشغيل الخادم ============
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) { console.error('❌ MONGODB_URI is not defined'); process.exit(1); }

mongoose.connect(MONGODB_URI, { dbName: 'eagle-voice-chat' })
    .then(async () => {
        console.log('✅ MongoDB connected');
        // إنشاء Super Admin تلقائياً
        const existing = await User.findOne({ role: 'super_admin' });
        if (!existing) {
            const hashed = await bcrypt.hash('SuperAdmin123!', 10);
            await User.create({ username: 'SuperAdmin', email: 'superadmin@eaglevoice.com', password: hashed, role: 'super_admin', coins: 999999, diamonds: 999999 });
            console.log('✅ Super Admin created');
        }
        const server = app.listen(PORT, '0.0.0.0', () => console.log(`🦅 Server running on port ${PORT}`));
        
        const socketIo = require('socket.io');
        const io = socketIo(server, { cors: { origin: "*" }, transports: ['websocket', 'polling'] });
        global.io = io;
        global.onlineUsers = new Map();

        io.use((socket, next) => {
            const token = socket.handshake.auth.token;
            if (!token) return next(new Error('No token'));
            const decoded = verifyToken(token);
            if (!decoded) return next(new Error('Invalid token'));
            User.findById(decoded.userId).then(user => {
                if (!user || user.isBanned) return next(new Error('Unauthorized'));
                socket.user = user;
                next();
            }).catch(next);
        });

        io.on('connection', (socket) => {
            console.log('✅ Socket connected:', socket.user.username);
            global.onlineUsers.set(socket.user._id.toString(), socket.id);

            // إنشاء غرفة (بحد أقصى غرفة واحدة لكل مستخدم)
            socket.on('create-room', async (data, cb) => {
                const existing = await Room.findOne({ ownerId: socket.user._id });
                if (existing) return cb({ error: 'لديك غرفة بالفعل' });
                const room = new Room({ name: data.name, ownerId: socket.user._id, maxMicrophones: data.maxMicrophones || 5 });
                await room.save();
                socket.join(`room:${room._id}`);
                room.users.push({ userId: socket.user._id, joinedAt: new Date() });
                await room.save();
                cb({ success: true, room });
                io.emit('rooms-updated');
            });

            // الانضمام إلى غرفة + إرسال تأثير الدخول
            socket.on('join-room', async (data, cb) => {
                const room = await Room.findById(data.roomId);
                if (!room) return cb({ error: 'الغرفة غير موجودة' });
                if (!room.isActive) return cb({ error: 'الغرفة محظورة' });
                if (room.users.some(u => u.userId === socket.user._id)) return cb({ error: 'أنت بالفعل في الغرفة' });
                socket.join(`room:${room._id}`);
                room.users.push({ userId: socket.user._id, joinedAt: new Date() });
                await room.save();

                // إشعار الدخول مع تأثير
                io.to(`room:${room._id}`).emit('user-joined', {
                    userId: socket.user._id,
                    username: socket.user.username,
                    avatar: socket.user.avatar,
                    frame: socket.user.frame,
                    entryEffect: socket.user.entryEffect,
                    entrySound: '/sounds/enter.mp3'
                });
                cb({ success: true, room, user: { username: socket.user.username, avatar: socket.user.avatar, frame: socket.user.frame } });
                // إرسال قائمة المتحدثين الحالية للمستخدم الجديد
                io.to(`room:${room._id}`).emit('speakers-list', { speakers: room.currentSpeakers });
            });

            // رفع المايك (طلب التحدث)
            socket.on('request-mic', async (data, cb) => {
                const room = await Room.findById(data.roomId);
                if (!room) return cb({ error: 'الغرفة غير موجودة' });
                if (room.isMicsLocked && room.ownerId !== socket.user._id) return cb({ error: 'الميكروفونات مقفلة من قبل صاحب الغرفة' });
                if (room.currentSpeakers.includes(socket.user._id)) return cb({ error: 'أنت بالفعل تتحدث' });
                if (room.currentSpeakers.length >= room.maxMicrophones) return cb({ error: 'عدد المايكات ممتلئ' });
                room.currentSpeakers.push(socket.user._id);
                await room.save();
                io.to(`room:${room._id}`).emit('speaker-joined', { userId: socket.user._id, username: socket.user.username });
                cb({ success: true });
            });

            // إنزال المايك (للمستخدم نفسه أو للمشرف)
            socket.on('remove-speaker', async (data, cb) => {
                const room = await Room.findById(data.roomId);
                if (!room) return cb({ error: 'الغرفة غير موجودة' });
                const isOwner = room.ownerId === socket.user._id;
                const isSelf = data.userId === socket.user._id;
                if (!isOwner && !isSelf) return cb({ error: 'غير مصرح' });
                room.currentSpeakers = room.currentSpeakers.filter(id => id !== data.userId);
                await room.save();
                io.to(`room:${room._id}`).emit('speaker-removed', data.userId);
                cb({ success: true });
            });

            // قفل/فتح المايكات (لصاحب الغرفة فقط)
            socket.on('lock-mics', async (data, cb) => {
                const room = await Room.findById(data.roomId);
                if (room.ownerId !== socket.user._id) return cb({ error: 'غير مصرح' });
                room.isMicsLocked = data.locked;
                await room.save();
                io.to(`room:${room._id}`).emit('mics-locked', data.locked);
                cb({ success: true });
            });

            // إرسال رسالة نصية
            socket.on('send-message', (data) => {
                io.to(`room:${data.roomId}`).emit('new-message', {
                    username: socket.user.username,
                    message: data.message,
                    time: new Date(),
                    avatar: socket.user.avatar,
                    frame: socket.user.frame
                });
            });

            // مغادرة الغرفة
            socket.on('leave-room', async (data) => {
                const room = await Room.findById(data.roomId);
                if (room) {
                    room.users = room.users.filter(u => u.userId !== socket.user._id);
                    room.currentSpeakers = room.currentSpeakers.filter(id => id !== socket.user._id);
                    await room.save();
                    socket.leave(`room:${room._id}`);
                    io.to(`room:${room._id}`).emit('user-left', socket.user._id);
                }
            });

            socket.on('disconnect', () => {
                global.onlineUsers.delete(socket.user._id.toString());
                console.log('❌ Socket disconnected');
            });
        });
    })
    .catch(err => { console.error('❌ MongoDB error:', err.message); process.exit(1); });
