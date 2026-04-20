require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

mongoose.set('strictQuery', false);

// ============================================================
// نظام إدارة التوكن (JWT) المتكامل
// ============================================================
const TokenManager = {
    generateToken(userId) {
        return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
    },

    verifyToken(token) {
        try {
            return jwt.verify(token, process.env.JWT_SECRET);
        } catch (error) {
            return null;
        }
    },

    async addSession(user, token, deviceId, ip) {
        user.sessions.push({
            token,
            deviceId,
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            ip
        });
        await user.save();
    },

    async removeSession(user, token) {
        user.sessions = user.sessions.filter(s => s.token !== token);
        await user.save();
    },

    async refreshToken(user, deviceId, ip) {
        const newToken = this.generateToken(user._id);
        await this.addSession(user, newToken, deviceId, ip);
        return newToken;
    },

    isTokenValid(token) {
        return this.verifyToken(token) !== null;
    }
};

// ============================================================
// Middleware
// ============================================================
const authenticate = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ error: 'No token provided' });

        const decoded = TokenManager.verifyToken(token);
        if (!decoded) return res.status(401).json({ error: 'Invalid or expired token' });

        const user = await User.findById(decoded.userId);
        if (!user || user.isBanned) return res.status(401).json({ error: 'Unauthorized' });

        req.user = user;
        next();
    } catch (error) {
        res.status(401).json({ error: 'Authentication failed' });
    }
};

const authorize = (roles = []) => {
    return (req, res, next) => {
        if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
        if (roles.length && !roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }
        next();
    };
};

// خدمة الملفات الثابتة
app.use(express.static(path.join(__dirname, '../../')));
app.use('/eagle-voice', express.static(path.join(__dirname, '../../eagle-voice')));
app.use('/uploads', express.static(path.join(__dirname, '../../uploads')));

// روابط الصفحات
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, '../../index.html')); });
app.get('/admin', (req, res) => { res.sendFile(path.join(__dirname, '../../eagle-voice/index.html')); });
app.get('/api/test', (req, res) => { res.json({ status: 'ok', message: 'Server is working!' }); });

const PORT = process.env.PORT || 3000;

// ============================================================
// النماذج (Models)
// ============================================================
const UserSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    email: { type: String, unique: true, sparse: true },
    password: { type: String, required: true },
    phone: String,
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
    currentDeviceId: String,
    lastLoginIp: String,
    lastLoginDate: Date,
    sessions: [{ token: String, deviceId: String, createdAt: Date, expiresAt: Date, ip: String }],
    agencyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agency' },
    invitedAdmins: [{
        adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        agencyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agency' },
        joinedAt: Date
    }],
    invitedAdminsStats: { count: { type: Number, default: 0 }, totalEarnings: { type: Number, default: 0 } },
    transactions: [{
        type: String,
        amount: Number,
        coins: Number,
        diamonds: Number,
        description: String,
        date: Date,
        status: String
    }],
    createdAt: { type: Date, default: Date.now }
});

const RoomSchema = new mongoose.Schema({
    name: { type: String, required: true },
    ownerId: { type: String, required: true },
    users: [{ userId: String, joinedAt: Date }],
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
    isLuckyGift: { type: Boolean, default: false },
    winChance: { type: Number, default: 10 },
    winMultiplier: { type: Number, default: 2 },
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

// ============================================================
// Routes
// ============================================================

// --- المصادقة والتوكن ---
app.post('/api/register', async (req, res) => {
    try {
        const { username, password, email, phone, deviceId } = req.body;
        const existing = await User.findOne({ username });
        if (existing) return res.status(400).json({ error: 'اسم المستخدم موجود' });

        const hashed = await bcrypt.hash(password, 10);
        const user = new User({ username, email, phone, password: hashed, deviceId });
        await user.save();

        const token = TokenManager.generateToken(user._id);
        await TokenManager.addSession(user, token, deviceId, req.ip);

        res.json({
            success: true,
            token,
            user: {
                id: user._id,
                username: user.username,
                role: user.role,
                coins: user.coins,
                diamonds: user.diamonds
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, password, deviceId } = req.body;
        const user = await User.findOne({ username });
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ error: 'بيانات غير صحيحة' });
        }
        if (user.isBanned) return res.status(403).json({ error: 'الحساب محظور' });

        user.devices.push({ deviceId, lastLogin: new Date(), ip: req.ip });
        user.currentDeviceId = deviceId;
        user.lastLoginIp = req.ip;
        user.lastLoginDate = new Date();

        const token = TokenManager.generateToken(user._id);
        await TokenManager.addSession(user, token, deviceId, req.ip);
        await user.save();

        res.json({
            success: true,
            token,
            user: {
                id: user._id,
                username: user.username,
                role: user.role,
                coins: user.coins,
                diamonds: user.diamonds,
                vipLevel: user.vipLevel
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/user', authenticate, async (req, res) => {
    res.json({ user: req.user });
});

app.post('/api/refresh-token', authenticate, async (req, res) => {
    const newToken = await TokenManager.refreshToken(req.user, req.user.currentDeviceId, req.ip);
    res.json({ success: true, token: newToken });
});

app.post('/api/logout', authenticate, async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    await TokenManager.removeSession(req.user, token);
    res.json({ success: true, message: 'Logged out successfully' });
});

// --- إدارة المستخدمين (Admin) ---
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
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true, message: `تم حظر ${user.username}` });
});

app.post('/api/admin/unban-user/:userId', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    const user = await User.findByIdAndUpdate(req.params.userId, { isBanned: false, banReason: null }, { new: true });
    res.json({ success: true });
});

app.post('/api/admin/add-coins', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    const { userId, coins } = req.body;
    const user = await User.findByIdAndUpdate(userId, { $inc: { coins } }, { new: true });
    res.json({ success: true });
});

app.post('/api/admin/add-diamonds', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    const { userId, diamonds } = req.body;
    const user = await User.findByIdAndUpdate(userId, { $inc: { diamonds } }, { new: true });
    res.json({ success: true });
});

app.get('/api/admin/user-devices/:userId', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    const user = await User.findById(req.params.userId).select('devices');
    res.json({ devices: user?.devices || [] });
});

app.get('/api/admin/device-users/:deviceId', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    const users = await User.find({ deviceId: req.params.deviceId }).select('username role coins diamonds isBanned lastLoginDate');
    res.json({ users });
});

app.get('/api/admin/stats', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    const totalUsers = await User.countDocuments();
    const totalCoins = (await User.aggregate([{ $group: { _id: null, total: { $sum: "$coins" } } }]))[0]?.total || 0;
    const totalDiamonds = (await User.aggregate([{ $group: { _id: null, total: { $sum: "$diamonds" } } }]))[0]?.total || 0;
    const totalRevenue = (await User.aggregate([{ $unwind: "$transactions" }, { $match: { "transactions.type": "purchase" } }, { $group: { _id: null, total: { $sum: "$transactions.amount" } } }]))[0]?.total || 0;
    res.json({ stats: { totalUsers, onlineUsers: global.onlineUsers?.size || 0, totalCoins, totalDiamonds, totalRevenue } });
});

// --- إدارة الغرف (للمستخدمين العاديين) ---
app.get('/api/rooms', async (req, res) => {
    const rooms = await Room.find({ isActive: true }).sort({ createdAt: -1 });
    res.json(rooms);
});

app.post('/api/rooms', authenticate, async (req, res) => {
    const existing = await Room.findOne({ ownerId: req.user._id });
    if (existing) return res.status(400).json({ error: 'لديك غرفة بالفعل' });
    const room = new Room({ name: req.body.name, ownerId: req.user._id });
    await room.save();
    res.json({ success: true, room });
});

// --- إدارة الغرف (Admin) ---
app.get('/api/admin/rooms', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    try {
        const rooms = await Room.find().sort({ createdAt: -1 });
        res.json({ rooms });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/admin/rooms/:roomId', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    try {
        const { name, imageUrl, isActive } = req.body;
        const updateData = {};
        if (name !== undefined) updateData.name = name;
        if (imageUrl !== undefined) updateData.imageUrl = imageUrl;
        if (isActive !== undefined) updateData.isActive = isActive;

        const room = await Room.findByIdAndUpdate(req.params.roomId, updateData, { new: true });
        if (!room) return res.status(404).json({ error: 'الغرفة غير موجودة' });
        res.json({ success: true, room });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/admin/rooms/:roomId/ban', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    try {
        const room = await Room.findByIdAndUpdate(req.params.roomId, { isActive: false }, { new: true });
        if (!room) return res.status(404).json({ error: 'الغرفة غير موجودة' });
        res.json({ success: true, message: `تم حظر الغرفة ${room.name}` });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/admin/rooms/:roomId/unban', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    try {
        const room = await Room.findByIdAndUpdate(req.params.roomId, { isActive: true }, { new: true });
        if (!room) return res.status(404).json({ error: 'الغرفة غير موجودة' });
        res.json({ success: true, message: `تم فك حظر الغرفة ${room.name}` });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/admin/rooms/:roomId', authenticate, authorize(['super_admin']), async (req, res) => {
    try {
        const room = await Room.findByIdAndDelete(req.params.roomId);
        if (!room) return res.status(404).json({ error: 'الغرفة غير موجودة' });
        res.json({ success: true, message: `تم حذف الغرفة ${room.name}` });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- الوكالات ---
app.get('/api/agencies', authenticate, async (req, res) => {
    const agencies = await Agency.find().populate('ownerId', 'username');
    res.json({ agencies });
});

app.post('/api/agency/create', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    const { name } = req.body;
    const existing = await Agency.findOne({ name });
    if (existing) return res.status(400).json({ error: 'الاسم موجود' });
    const agency = new Agency({ name, ownerId: req.user._id });
    await agency.save();
    res.json({ success: true, agency });
});

// --- VIP ---
app.post('/api/admin/give-vip', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    const { userId, level, days } = req.body;
    const user = await User.findByIdAndUpdate(userId, { vipLevel: level, vipExpiry: new Date(Date.now() + (days || 30) * 24 * 60 * 60 * 1000) }, { new: true });
    res.json({ success: true, message: `تم ترقية ${user.username} إلى VIP ${level}` });
});

app.post('/api/admin/remove-vip/:userId', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    await User.findByIdAndUpdate(req.params.userId, { vipLevel: 0, vipExpiry: null });
    res.json({ success: true });
});

app.get('/api/vip/ranking', async (req, res) => {
    const users = await User.find({ vipLevel: { $gt: 0 } }).sort({ vipLevel: -1, coins: -1 }).select('username vipLevel coins');
    res.json(users);
});

// --- الهدايا ---
app.get('/api/admin/gifts', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    res.json(await Gift.find());
});

app.post('/api/admin/gifts', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    const gift = new Gift(req.body);
    await gift.save();
    res.json({ success: true, gift });
});

app.delete('/api/admin/gifts/:giftId', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    await Gift.findByIdAndDelete(req.params.giftId);
    res.json({ success: true });
});

app.post('/api/gift/send', authenticate, async (req, res) => {
    const { giftId, targetUserId } = req.body;
    const gift = await Gift.findById(giftId);
    if (!gift) return res.status(404).json({ error: 'الهدية غير موجودة' });
    if (req.user.coins < gift.price) return res.status(400).json({ error: 'رصيد غير كاف' });
    req.user.coins -= gift.price;
    const target = await User.findById(targetUserId);
    if (target) target.diamonds += gift.price;
    await target?.save();
    await req.user.save();
    res.json({ success: true });
});

// --- الألعاب ---
app.get('/api/admin/games', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    res.json(await Game.find());
});

app.put('/api/admin/games/:gameId', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    await Game.findByIdAndUpdate(req.params.gameId, req.body);
    res.json({ success: true });
});

// --- المخالفات ---
app.post('/api/admin/warnings/add', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    const { userId, reason } = req.body;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.warnings.push({ reason, date: new Date(), moderator: req.user.username });
    user.riskScore += 10;
    await user.save();
    res.json({ success: true, riskScore: user.riskScore });
});

// --- السحوبات ---
app.get('/api/admin/withdrawals', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    res.json(await Withdrawal.find().populate('userId', 'username'));
});

app.post('/api/admin/withdrawals/:id/approve', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    await Withdrawal.findByIdAndUpdate(req.params.id, { status: 'completed' });
    res.json({ success: true });
});

// --- الدعوات ---
app.post('/api/invitations/send-admin', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    const { targetUserId } = req.body;
    const target = await User.findById(targetUserId);
    if (!target) return res.status(404).json({ error: 'المستخدم غير موجود' });
    if (target.role === 'admin') return res.status(400).json({ error: 'المستخدم بالفعل Admin' });
    target.role = 'admin';
    const agency = new Agency({ name: `${target.username}_Agency`, ownerId: target._id });
    await agency.save();
    target.agencyId = agency._id;
    await target.save();
    res.json({ success: true });
});

// --- الفعاليات ---
app.get('/api/admin/events', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    res.json(await Event.find());
});

app.post('/api/admin/events', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    const event = new Event(req.body);
    await event.save();
    res.json({ success: true });
});

app.delete('/api/admin/events/:id', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    await Event.findByIdAndDelete(req.params.id);
    res.json({ success: true });
});

// --- شاشة الظهور ---
app.get('/api/admin/splash', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    res.json(await SplashScreen.find());
});

app.post('/api/admin/splash', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    const splash = new SplashScreen(req.body);
    await splash.save();
    res.json({ success: true });
});

app.delete('/api/admin/splash/:id', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    await SplashScreen.findByIdAndDelete(req.params.id);
    res.json({ success: true });
});

// --- البانرات ---
app.get('/api/admin/banners', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    res.json(await Banner.find());
});

app.post('/api/admin/banners', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    const banner = new Banner(req.body);
    await banner.save();
    res.json({ success: true });
});

app.delete('/api/admin/banners/:id', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    await Banner.findByIdAndDelete(req.params.id);
    res.json({ success: true });
});

// --- أسعار الشحن والإحصائيات المتقدمة ---
app.get('/api/packages', async (req, res) => {
    res.json({ '1000_coins': { price: 0.10, coins: 1000 } });
});

app.get('/api/admin/advanced-stats', authenticate, authorize(['admin', 'super_admin']), async (req, res) => {
    res.json({
        users: { totalUsers: await User.countDocuments() },
        vip: { total: await User.countDocuments({ vipLevel: { $gt: 0 } }) }
    });
});

// ============================================================
// إنشاء Super Admin تلقائياً
// ============================================================
const createSuperAdmin = async () => {
    const existing = await User.findOne({ role: 'super_admin' });
    if (!existing) {
        const hashed = await bcrypt.hash('SuperAdmin123!', 10);
        await User.create({
            username: 'SuperAdmin',
            email: 'superadmin@eaglevoice.com',
            password: hashed,
            role: 'super_admin',
            coins: 999999,
            diamonds: 999999
        });
        console.log('✅ Super Admin created');
    }
};

// ============================================================
// تشغيل الخادم مع Socket.IO
// ============================================================
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI is not defined');
    process.exit(1);
}

mongoose.connect(MONGODB_URI, { dbName: 'eagle-voice-chat' })
    .then(async () => {
        console.log('✅ MongoDB connected');
        await createSuperAdmin();

        const server = app.listen(PORT, '0.0.0.0', () => {
            console.log(`🦅 Server running on port ${PORT}`);
        });

        const socketIo = require('socket.io');
        const io = socketIo(server, { cors: { origin: "*" } });
        global.io = io;
        global.onlineUsers = new Map();

        io.use((socket, next) => {
            const token = socket.handshake.auth.token;
            if (!token) return next(new Error('No token'));
            const decoded = TokenManager.verifyToken(token);
            if (!decoded) return next(new Error('Invalid token'));
            User.findById(decoded.userId).then(user => {
                if (!user || user.isBanned) return next(new Error('Unauthorized'));
                socket.user = user;
                next();
            }).catch(next);
        });

        io.on('connection', (socket) => {
            console.log('✅ Socket connected:', socket.user?.username);
            global.onlineUsers.set(socket.user?._id.toString(), socket.id);

            socket.on('create-room', async (data, cb) => {
                const existing = await Room.findOne({ ownerId: socket.user._id });
                if (existing) return cb({ error: 'لديك غرفة بالفعل' });
                const room = new Room({ name: data.name, ownerId: socket.user._id });
                await room.save();
                socket.join(`room:${room._id}`);
                cb({ success: true, room });
                io.emit('rooms-updated');
            });

            socket.on('join-room', (data, cb) => {
                socket.join(`room:${data.roomId}`);
                cb({ success: true });
                socket.to(`room:${data.roomId}`).emit('user-joined', socket.user.username);
            });

            socket.on('send-message', (data) => {
                io.to(`room:${data.roomId}`).emit('new-message', {
                    username: socket.user.username,
                    message: data.message,
                    time: new Date()
                });
            });

            socket.on('disconnect', () => {
                global.onlineUsers.delete(socket.user?._id.toString());
                console.log('❌ Socket disconnected');
            });
        });
    })
    .catch(err => {
        console.error('❌ MongoDB error:', err.message);
        process.exit(1);
    });
