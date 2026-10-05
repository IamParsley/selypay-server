const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const crypto = require('crypto');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname));

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname))
});
const upload = multer({ storage: storage });

mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
.then(() => console.log('✅ MongoDB Connected'))
.catch(err => console.error('❌ MongoDB Error:', err));

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    apiKey: { type: String, required: true, unique: true },
    createdAt: { type: Date, default: Date.now },
    reactions: [{
        amount: { type: Number, required: true },
        imageUrl: { type: String, required: true },
        soundUrl: { type: String, default: '' }
    }]
});

const donationSchema = new mongoose.Schema({
    streamerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    nickname: { type: String, default: "익명" },
    amount: { type: Number, default: 0 },
    message: { type: String, default: "" },
    datetime: { type: String, required: true },
    dateKey: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Donation = mongoose.model('Donation', donationSchema);

function getKSTDateTime() {
    return new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function getKSTDateKey() {
    const now = new Date();
    return new Date(now.getTime() + (9 * 60 * 60 * 1000)).toISOString().split('T')[0];
}

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/api/reactions/:apiKey', async (req, res) => {
    try {
        const user = await User.findOne({ apiKey: req.params.apiKey });
        if (!user) return res.status(404).json({ success: false, error: 'Not found' });
        res.json({ success: true, reactions: user.reactions || [] });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.post('/api/reactions/:apiKey', upload.fields([{ name: 'imageFile', maxCount: 1 }, { name: 'soundFile', maxCount: 1 }]), async (req, res) => {
    try {
        const { amount, imageUrlText } = req.body;
        const files = req.files;
        if (!amount) return res.status(400).json({ success: false, error: 'Amount required' });

        let imageUrl = files && files['imageFile'] ? '/uploads/' + files['imageFile'][0].filename : (imageUrlText ? imageUrlText.trim() : '');
        if (!imageUrl) return res.status(400).json({ success: false, error: 'Image required' });

        let soundUrl = files && files['soundFile'] ? '/uploads/' + files['soundFile'][0].filename : '';

        const user = await User.findOneAndUpdate(
            { apiKey: req.params.apiKey },
            { $push: { reactions: { amount: Number(amount), imageUrl, soundUrl } } },
            { new: true }
        );
        res.json({ success: true, reactions: user.reactions });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.delete('/api/reactions/:apiKey/:reactionId', async (req, res) => {
    try {
        const user = await User.findOneAndUpdate(
            { apiKey: req.params.apiKey },
            { $pull: { reactions: { _id: req.params.reactionId } } },
            { new: true }
        );
        res.json({ success: true, reactions: user.reactions });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.get('/', (req, res) => {
    res.send(`<div style="text-align:center;margin-top:50px;font-family:sans-serif;"><h1>SelyPay Server Running 🚀</h1><p><a href="/register">회원가입</a> | <a href="/login">로그인</a></p></div>`);
});

app.get('/register', (req, res) => {
    res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>회원가입</title></head><body style="font-family:sans-serif;background:#f4f7f6;display:flex;justify-content:center;align-items:center;height:100vh;"><div style="background:white;padding:30px;border-radius:10px;width:300px;"><h2>스트리머 회원가입</h2><form action="/api/register" method="POST"><div style="margin-bottom:15px;"><label>아이디</label><br><input type="text" name="username" style="width:100%;padding:8px;margin-top:5px;" required></div><div style="margin-bottom:15px;"><label>비밀번호</label><br><input type="password" name="password" style="width:100%;padding:8px;margin-top:5px;" required></div><button type="submit" style="width:100%;padding:10px;background:#ff4757;color:white;border:none;border-radius:5px;font-weight:bold;">가입하기</button></form><p style="text-align:center;margin-top:15px;"><a href="/login">로그인하기</a></p></div></body></html>`);
});

app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        const apiKey = 'sely_' + crypto.randomBytes(16).toString('hex');
        await new User({ username, password, apiKey }).save();
        res.send(`<script>alert('회원가입 성공!');location.href='/login';</script>`);
    } catch (e) {
        res.send(`<script>alert('회원가입 실패 (중복 아이디)');history.back();</script>`);
    }
});

app.get('/login', (req, res) => {
    res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>로그인</title></head><body style="font-family:sans-serif;background:#f4f7f6;display:flex;justify-content:center;align-items:center;height:100vh;"><div style="background:white;padding:30px;border-radius:10px;width:300px;"><h2>로그인</h2><form action="/api/login" method="POST"><div style="margin-bottom:15px;"><label>아이디</label><br><input type="text" name="username" style="width:100%;padding:8px;margin-top:5px;" required></div><div style="margin-bottom:15px;"><label>비밀번호</label><br><input type="password" name="password" style="width:100%;padding:8px;margin-top:5px;" required></div><button type="submit" style="width:100%;padding:10px;background:#2ed573;color:white;border:none;border-radius:5px;font-weight:bold;">로그인</button></form><p style="text-align:center;margin-top:15px;"><a href="/register">회원가입하기</a></p></div></body></html>`);
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username, password });
        if (!user) return res.send(`<script>alert('정보가 일치하지 않습니다.');history.back();</script>`);

        res.send(`<!DOCTYPE html><html><head><meta charset="UTF
