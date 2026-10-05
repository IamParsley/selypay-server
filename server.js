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

// uploads 폴더가 없으면 자동 생성 및 디스크 스토리지 설정
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// 업로드된 파일들을 정적 파일로 서빙
app.use('/uploads', express.static(uploadDir));

mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
.then(() => console.log('✅ MongoDB Connected'))
.catch(err => console.error('❌ MongoDB Error:', err));

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    apiKey: { type: String, required: true, unique: true },
    createdAt: { type: Date, default: Date.now },
    defaultAlert: {
        useImage: { type: Boolean, default: true }
    },
    reactions: [{
        name: { type: String, default: "후원 리액션" },
        amount: { type: Number, required: true },
        imageUrl: { type: String, default: "/alerticon.gif" },
        soundUrl: { type: String, default: "" }
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

// 리액션 및 기본 설정 조회 API
app.get('/api/reactions/:apiKey', async (req, res) => {
    try {
        const user = await User.findOne({ apiKey: req.params.apiKey });
        if (!user) return res.status(404).json({ success: false, error: 'Not found' });
        
        const formattedReactions = (user.reactions || []).map(r => ({
            _id: r._id,
            name: r.name || '후원 리액션',
            amount: r.amount,
            imageUrl: r.imageUrl || '/alerticon.gif',
            soundUrl: r.soundUrl || ''
        }));
        res.json({ 
            success: true, 
            reactions: formattedReactions,
            defaultAlert: user.defaultAlert || { useImage: true }
        });
    } catch (e) { res.status(500).json({ success: false }); }
});

// 기본 알림 설정 저장 API
app.post('/api/settings/:apiKey', async (req, res) => {
    try {
        const { useImage } = req.body;
        await User.findOneAndUpdate(
            { apiKey: req.params.apiKey },
            { $set: { "defaultAlert.useImage": Boolean(useImage) } },
            { new: true }
        );
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.post('/api/reactions/:apiKey', upload.fields([{ name: 'imageFile', maxCount: 1 }, { name: 'soundFile', maxCount: 1 }]), async (req, res) => {
    try {
        const { name, amount } = req.body;
        const files = req.files;
        if (!amount) return res.status(400).json({ success: false, error: 'Amount required' });

        const reactionId = new mongoose.Types.ObjectId();
        let imageUrl = '/alerticon.gif';
        let soundUrl = '';

        if (files && files['imageFile']) {
            imageUrl = `/uploads/${files['imageFile'][0].filename}`;
        }

        if (files && files['soundFile']) {
            soundUrl = `/uploads/${files['soundFile'][0].filename}`;
        }

        const user = await User.findOneAndUpdate(
            { apiKey: req.params.apiKey },
            { $push: { reactions: { 
                _id: reactionId, 
                name: name || '후원 리액션',
                amount: Number(amount), 
                imageUrl, 
                soundUrl
            } } },
            { new: true }
        );
        res.json({ success: true, reactions: user.reactions });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.delete('/api/reactions/:apiKey/:reactionId', async (req, res) => {
    try {
        const user = await User.findOne({ apiKey: req.params.apiKey });
        if (!user) return res.status(404).json({ success: false });

        const reaction = user.reactions.id(req.params.reactionId);
        if (reaction) {
            if (reaction.imageUrl && reaction.imageUrl.startsWith('/uploads/')) {
                const imgPath = path.join(__dirname, reaction.imageUrl);
                if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
            }
            if (reaction.soundUrl && reaction.soundUrl.startsWith('/uploads/')) {
                const sndPath = path.join(__dirname, reaction.soundUrl);
                if (fs.existsSync(sndPath)) fs.unlinkSync(sndPath);
            }
        }

        const updatedUser = await User.findOneAndUpdate(
            { apiKey: req.params.apiKey },
            { $pull: { reactions: { _id: req.params.reactionId } } },
            { new: true }
        );
        res.json({ success: true, reactions: updatedUser.reactions });
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

        res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${user.username} 대시보드</title><style>body{font-family:sans-serif;background:#f4f7f6;padding:40px;margin:0;}.container{max-width:600px;margin:0 auto;background:white;padding:30px;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,0.1);}.box{background:#eee;padding:10px;font-family:monospace;word-break:break-all;border-radius:5px;margin-top:5px;}.log-box{background:#fafafa;border:1px solid #ddd;padding:15px;border-radius:5px;max-height:200px;overflow-y:auto;margin-top:10px;}.log-item{padding:6px 0;border-bottom:1px solid #eee;font-size:13px;}.btn{display:inline-block;padding:8px 12px;background:#3498db;color:white;text-decoration:none;border-radius:5px;font-weight:bold;font-size:13px;margin-top:8px;}</style></head><body><div class="container"><h2>환영합니다, ${user.username}님! 🎉</h2><p><b>고유 API Key:</b></p><div class="box">${user.apiKey}</div><p style="margin-top:15px;"><b>OBS 알림 오버레이 주소:</b></p><div class="box">https://${req.get('host')}/overlay/${user.apiKey}</div><a href="/manage/alert/${user.apiKey}" class="btn" target="_blank">⚙ 후원 리액션 관리</a><p style="margin-top:15px;"><b>OBS 랭킹판 오버레이 주소:</b></p><div class="box">https://${req.get('host')}/ranking-overlay/${user.apiKey}</div><p style="margin-top:25px;"><b>🏆 오늘의 후원 랭킹</b></p><div class="log-box" id="rankingList">불러오는 중...</div><p style="margin-top:20px;"><b>📋 최근 후원 내역</b></p><div class="log-box" id="donationLogList">불러오는 중...</div><p style="margin-top:20px;text-align:right;"><a href="/login">로그아웃</a></p></div><script>
        async function fetchData() {
            try {
                const logRes = await fetch('/api/logs/${user.apiKey}');
                const logs = await logRes.json();
                const logDiv = document.getElementById('donationLogList');
                logDiv.innerHTML = logs.length ? '' : '<div class="log-item">내역이 없습니다.</div>';
                logs.slice(0, 15).forEach(l => {
                    const d = document.createElement('div'); d.className = 'log-item';
                    d.innerHTML = '<b>[' + l.datetime + ']</b> ' + l.nickname + ' (' + l.amount.toLocaleString() + '원): ' + l.message;
                    logDiv.appendChild(d);
                });
                const rankRes = await fetch('/api/ranking/${user.apiKey}');
                const ranking = await rankRes.json();
                const rankDiv = document.getElementById('rankingList');
                rankDiv.innerHTML = ranking.length ? '' : '<div class="log-item">오늘 후원 내역이 없습니다.</div>';
                ranking.forEach((r, i) => {
                    const d = document.createElement('div'); d.className = 'log-item';
                    d.innerHTML = '<b>' + (i + 1) + '위</b> ' + r._id + ' - ' + r.totalAmount.toLocaleString() + '원 (' + r.count + '회)';
                    rankDiv.appendChild(d);
                });
            } catch(e){}
        }
        fetchData(); setInterval(fetchData, 4000);
        </script></body></html>`);
    } catch (e) { res.status(500).send('Error'); }
});

app.post('/api/notification', async (req, res) => {
    const { apiKey, message } = req.body;
    if (!apiKey || !message) return res.status(400).json
