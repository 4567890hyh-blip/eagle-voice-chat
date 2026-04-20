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

// ✅ خدمة الملفات الثابتة
app.use(express.static(path.join(__dirname, '../../')));

// ✅ خدمة ملفات لوحة التحكم
app.use('/eagle-voice', express.static(path.join(__dirname, '../../eagle-voice')));

// ✅ رابط لوحة التحكم
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, '../../eagle-voice/index.html'));
});

// ✅ رابط الرئيسي
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../../index.html'));
});

// ✅ رابط لترقية المستخدم (سهل)
app.get('/make-me-super', async (req, res) => {
    try {
        const { username } = req.query;
        if (!username) return res.send('❌ أضف ?username=اسم_المستخدم');
        
        const User = mongoose.model('User');
        const user = await User.findOne({ username });
        if (!user) return res.send('❌ المستخدم غير موجود');
        
        user.role = 'super_admin';
        await user.save();
        res.send(`✅ تم ترقية ${username} إلى Super Admin بنجاح!`);
    } catch (error) {
        res.send('❌ خطأ: ' + error.message);
    }
});

const PORT = process.env.PORT || 3000;

// ============ Models ============
const UserSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    email: { type: String, unique: true, sparse: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['user', 'admin', 'super_admin'], default: 'user' },
    coins: { type: Number, default: 0 },
    diamonds: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
});

const RoomSchema = new mongoose.Schema({
    name: { type: String, required: true },
    ownerId: { type: String, required: true },
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
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);
const Room = mongoose.model('Room', RoomSchema);
const Agency = mongoose.model('Agency', AgencySchema);
const Gift = mongoose.model('Gift', GiftSchema);

// ============ API Routes ============

// تسجيل مستخدم جديد
app.post('/api/register', async (req, res) => {
    try {
        const { username, password, email } = req.body;
        
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ error: 'اسم المستخدم موجود بالفعل' });
        }
        
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({ username, email, password: hashedPassword });
        await user.save();
        
        const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET);
        
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

// تسجيل الدخول
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        const user = await User.findOne({ username });
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
        }
        
        if (user.isBanned) {
            return res.status(403).json({ error: 'الحساب محظور' });
        }
        
        const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET);
        
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

// جلب معلومات المستخدم الحالي
app.get('/api/user', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ error: 'No token' });
        
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.userId).select('-password');
        
        res.json({ user });
    } catch (error) {
        res.status(401).json({ error: 'Invalid token' });
    }
});

// جلب جميع الغرف
app.get('/api/rooms', async (req, res) => {
    try {
        const rooms = await Room.find().sort({ createdAt: -1 });
        res.json(rooms);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// إنشاء غرفة جديدة
app.post('/api/rooms', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ error: 'Unauthorized' });
        
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const room = new Room({ name: req.body.name, ownerId: decoded.userId });
        await room.save();
        res.json({ success: true, room });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============ Admin Routes ============

// جلب جميع المستخدمين (للمشرفين فقط)
app.get('/api/admin/users', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ error: 'No token' });
        
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const admin = await User.findById(decoded.userId);
        
        if (admin.role !== 'super_admin' && admin.role !== 'admin') {
            return res.status(403).json({ error: 'غير مصرح' });
        }
        
        const { search, role } = req.query;
        let query = {};
        if (search) query.username = { $regex: search, $options: 'i' };
        if (role) query.role = role;
        
        const users = await User.find(query).select('-password').limit(100);
        res.json({ users });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// حظر مستخدم
app.post('/api/admin/ban-user', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ error: 'No token' });
        
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const admin = await User.findById(decoded.userId);
        
        if (admin.role !== 'super_admin' && admin.role !== 'admin') {
            return res.status(403).json({ error: 'غير مصرح' });
        }
        
        const { userId, reason } = req.body;
        const user = await User.findByIdAndUpdate(userId, { isBanned: true, banReason: reason }, { new: true });
        
        res.json({ success: true, message: `تم حظر ${user.username}` });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// إلغاء حظر مستخدم
app.post('/api/admin/unban-user/:userId', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ error: 'No token' });
        
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const admin = await User.findById(decoded.userId);
        
        if (admin.role !== 'super_admin' && admin.role !== 'admin') {
            return res.status(403).json({ error: 'غير مصرح' });
        }
        
        const { userId } = req.params;
        const user = await User.findByIdAndUpdate(userId, { isBanned: false, banReason: null }, { new: true });
        
        res.json({ success: true, message: `تم فك الحظر عن ${user.username}` });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// إحصائيات Dashboard
app.get('/api/admin/stats', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ error: 'No token' });
        
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const admin = await User.findById(decoded.userId);
        
        if (admin.role !== 'super_admin' && admin.role !== 'admin') {
            return res.status(403).json({ error: 'غير مصرح' });
        }
        
        const totalUsers = await User.countDocuments();
        const totalRooms = await Room.countDocuments();
        const totalCoins = await User.aggregate([{ $group: { _id: null, total: { $sum: "$coins" } } }]);
        const totalRevenue = await User.aggregate([
            { $unwind: "$transactions" },
            { $match: { "transactions.type": "purchase" } },
            { $group: { _id: null, total: { $sum: "$transactions.amount" } } }
        ]);
        
        res.json({ 
            stats: { 
                totalUsers, 
                onlineUsers: global.onlineUsers?.size || 0, 
                totalRooms,
                totalCoins: totalCoins[0]?.total || 0, 
                totalRevenue: totalRevenue[0]?.total || 0 
            } 
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============ Agency Routes ============

// إنشاء وكالة
app.post('/api/agency/create', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ error: 'Unauthorized' });
        
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.userId);
        
        if (user.role !== 'super_admin' && user.role !== 'admin') {
            return res.status(403).json({ error: 'غير مصرح' });
        }
        
        const { name } = req.body;
        const existingAgency = await Agency.findOne({ name });
        if (existingAgency) {
            return res.status(400).json({ error: 'الاسم موجود بالفعل' });
        }
        
        const agency = new Agency({ name, ownerId: user._id });
        await agency.save();
        
        res.json({ success: true, agency });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============ Gift Routes ============

// إضافة هدية
app.post('/api/admin/gifts', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ error: 'Unauthorized' });
        
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const admin = await User.findById(decoded.userId);
        
        if (admin.role !== 'super_admin' && admin.role !== 'admin') {
            return res.status(403).json({ error: 'غير مصرح' });
        }
        
        const { name, price } = req.body;
        const gift = new Gift({ name, price });
        await gift.save();
        
        res.json({ success: true, gift });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// جلب جميع الهدايا
app.get('/api/admin/gifts', async (req, res) => {
    try {
        const gifts = await Gift.find();
        res.json(gifts);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============ Invitation Routes ============

// إرسال دعوة Admin
app.post('/api/invitations/send-admin', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ error: 'Unauthorized' });
        
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const sender = await User.findById(decoded.userId);
        
        if (sender.role !== 'super_admin' && sender.role !== 'admin') {
            return res.status(403).json({ error: 'غير مصرح' });
        }
        
        const { targetUserId, targetUsername, createNewAgency } = req.body;
        
        let targetUser = null;
        if (targetUserId) {
            targetUser = await User.findById(targetUserId);
        } else if (targetUsername) {
            targetUser = await User.findOne({ username: targetUsername });
        }
        
        if (!targetUser) {
            return res.status(404).json({ error: 'المستخدم غير موجود' });
        }
        
        if (targetUser.role === 'admin' || targetUser.role === 'super_admin') {
            return res.status(400).json({ error: 'المستخدم بالفعل Admin' });
        }
        
        targetUser.role = 'admin';
        
        if (createNewAgency) {
            const newAgency = new Agency({ name: `${targetUser.username}_Agency`, ownerId: targetUser._id });
            await newAgency.save();
            targetUser.agencyId = newAgency._id;
        }
        
        await targetUser.save();
        
        res.json({ success: true, message: `تمت ترقية ${targetUser.username} إلى Admin بنجاح` });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============ إنشاء Super Admin تلقائياً ============
const createSuperAdmin = async () => {
    try {
        const existing = await User.findOne({ role: 'super_admin' });
        if (!existing) {
            const hashedPassword = await bcrypt.hash('SuperAdmin123!', 10);
            await User.create({
                username: 'SuperAdmin',
                email: 'superadmin@eaglevoice.com',
                password: hashedPassword,
                role: 'super_admin',
                coins: 999999,
                diamonds: 999999
            });
            console.log('✅ Super Admin created: superadmin@eaglevoice.com / SuperAdmin123!');
        } else {
            console.log('✅ Super Admin already exists');
        }
    } catch (error) {
        console.error('Error creating Super Admin:', error.message);
    }
};

// ============ تشغيل الخادم ============
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI is not defined');
    process.exit(1);
}

mongoose.connect(MONGODB_URI, { dbName: 'eagle-voice-chat' })
    .then(async () => {
        console.log('✅ MongoDB connected successfully');
        await createSuperAdmin();
        
        const server = app.listen(PORT, '0.0.0.0', () => {
            console.log(`🦅 Eagle Voice Chat running on port ${PORT}`);
            console.log(`📱 User App: https://your-app.onrender.com/`);
            console.log(`🖥️  Admin Panel: https://your-app.onrender.com/admin`);
        });
        
        // ============ Socket.IO ============
        const socketIo = require('socket.io');
        const io = socketIo(server, { 
            cors: { origin: "*" },
            transports: ['websocket', 'polling']
        });
        
        global.onlineUsers = new Map();
        
        io.use(async (socket, next) => {
            try {
                const token = socket.handshake.auth.token;
                if (!token) return next(new Error('No token'));
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                const user = await User.findById(decoded.userId);
                if (!user || user.isBanned) return next(new Error('Unauthorized'));
                socket.user = user;
                next();
            } catch (err) {
                next(new Error('Auth failed'));
            }
        });
        
        io.on('connection', (socket) => {
            console.log('✅ Socket connected:', socket.user.username);
            global.onlineUsers.set(socket.user._id.toString(), socket.id);
            
            socket.on('create-room', async (data, callback) => {
                try {
                    const room = new Room({ name: data.name, ownerId: socket.user._id });
                    await room.save();
                    socket.join(`room:${room._id}`);
                    callback({ success: true, room });
                    io.emit('rooms-updated');
                } catch (error) {
                    callback({ error: error.message });
                }
            });
            
            socket.on('join-room', async (data, callback) => {
                try {
                    socket.join(`room:${data.roomId}`);
                    callback({ success: true });
                    socket.to(`room:${data.roomId}`).emit('user-joined', socket.user.username);
                } catch (error) {
                    callback({ error: error.message });
                }
            });
            
            socket.on('send-message', (data) => {
                io.to(`room:${data.roomId}`).emit('new-message', {
                    username: socket.user.username,
                    message: data.message,
                    time: new Date()
                });
            });
            
            socket.on('disconnect', () => {
                global.onlineUsers.delete(socket.user._id.toString());
                console.log('❌ Socket disconnected:', socket.user.username);
            });
        });
    })
    .catch(err => {
        console.error('❌ MongoDB error:', err.message);
        process.exit(1);
    });
