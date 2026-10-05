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
        soundUrl: { type: String, default: '/coinsound.mp3' }
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

        let soundUrl = files && files['soundFile'] ? '/uploads/' + files['soundFile'][0].filename : '/coinsound.mp3';

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
    if (!apiKey || !message) return res.status(400).json({ success: false });
    try {
        const user = await User.findOne({ apiKey });
        if (!user) return res.status(401).json({ success: false });

        let amount = 0;
        const match = message.match(/([0-9,]+)\s*원/);
        if (match) amount = parseInt(match[1].replace(/,/g, ''), 10) || 0;

        let nickname = message.includes("님") ? message.split("님")[0].trim() : "익명";

        const donation = new Donation({ streamerId: user._id, nickname, amount, message, datetime: getKSTDateTime(), dateKey: getKSTDateKey() });
        await donation.save();
        res.status(200).json({ success: true, data: donation });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.get('/overlay/:apiKey', async (req, res) => {
    const user = await User.findOne({ apiKey: req.params.apiKey });
    if (!user) return res.status(404).send('Not found');
    res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>html,body{width:100%;height:100%;margin:0;background:transparent!important;font-family:sans-serif;overflow:hidden;}#alert-container{width:100vw;height:100vh;display:none;flex-direction:column;justify-content:center;align-items:center;text-align:center;}#alert-image{max-height:35vh;margin-bottom:1.5vh;}#alert-line1,#alert-line2{color:#fff;font-size:7vh;font-weight:800;text-shadow:-2px -2px 0 #000,2px -2px 0 #000,-2px 2px 0 #000,2px 2px 0 #000;width:90vw;word-break:break-word;}</style></head><body><div id="alert-container"><img id="alert-image" src="/alerticon.gif"><div id="alert-line1"></div><div id="alert-line2"></div></div><audio id="alert-sound" crossorigin="anonymous"></audio><script>
        let lastTime="", hideTimeout=null;
        async function check() {
            try {
                const res = await fetch('/api/logs/${req.params.apiKey}');
                const logs = await res.json();
                if(logs.length && logs[0].datetime !== lastTime) {
                    lastTime = logs[0].datetime;
                    trigger(logs[0]);
                }
            }catch(e){}
        }
        async function trigger(d) {
            let img = "/alerticon.gif", sound = "/coinsound.mp3";
            try {
                const res = await fetch('/api/reactions/${req.params.apiKey}');
                const data = await res.json();
                if(data.success && data.reactions) {
                    const m = data.reactions.sort((a,b)=>b.amount-a.amount).find(r=>d.amount>=r.amount);
                    if(m){ img = m.imageUrl; sound = m.soundUrl; }
                }
            }catch(e){}
            showAlert(d.message, img, sound);
        }
        function showAlert(msg, imgUrl, soundUrl) {
            const c = document.getElementById('alert-container'), img = document.getElementById('alert-image'), l1 = document.getElementById('alert-line1'), l2 = document.getElementById('alert-line2'), s = document.getElementById('alert-sound');
            if(hideTimeout) clearTimeout(hideTimeout);
            s.pause(); img.src = imgUrl; s.src = soundUrl; s.load();
            let t1 = msg, t2 = "";
            if(msg.indexOf('\\\\n') !== -1){ t1 = msg.substring(0, msg.indexOf('\\\\n')); t2 = msg.substring(msg.indexOf('\\\\n') + 2); }
            l1.innerText = t1; l2.innerText = t2; c.style.display = 'flex'; s.currentTime = 0;
            
            s.onloadedmetadata = () => {
                s.play().catch(e=>{});
                let ms = (!isNaN(s.duration) && s.duration > 0) ? s.duration * 1000 : 5000;
                hideTimeout = setTimeout(() => { c.style.display = 'none'; }, ms);
            };
            
            setTimeout(() => {
                if(c.style.display === 'flex' && !hideTimeout) {
                    s.play().catch(e=>{});
                    let ms = (!isNaN(s.duration) && s.duration > 0) ? s.duration * 1000 : 5000;
                    hideTimeout = setTimeout(() => { c.style.display = 'none'; }, ms);
                }
            }, 300);
        }
        setInterval(check, 1000);
        </script></body></html>`);
});

app.get('/manage/alert/:apiKey', async (req, res) => {
    const user = await User.findOne({ apiKey: req.params.apiKey });
    if (!user) return res.status(404).send('Not found');
    res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>리액션 관리</title><style>body{font-family:sans-serif;background:#f4f7f6;padding:40px;margin:0;}.container{max-width:700px;margin:0 auto;background:white;padding:30px;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,0.1);}.box{background:#eee;padding:10px;font-family:monospace;word-break:break-all;border-radius:5px;margin-top:5px;}.form-group{margin-bottom:15px;}.form-group label{display:block;font-weight:bold;margin-bottom:5px;}.form-group input{width:100%;padding:8px;box-sizing:border-box;border:1px solid #ddd;border-radius:4px;}.btn{padding:8px 12px;background:#3498db;color:white;text-decoration:none;border:none;border-radius:5px;font-weight:bold;cursor:pointer;}.reaction-item{display:flex;justify-content:space-between;align-items:center;padding:10px;background:#f9f9f9;border:1px solid #ddd;border-radius:5px;margin-bottom:8px;}</style></head><body><div class="container"><h2>🎁 후원 리액션 관리</h2><p>OBS 주소:</p><div class="box">https://${req.get('host')}/overlay/${user.apiKey}</div><hr style="margin:20px 0;"><h3>➕ 리액션 추가</h3><form id="form"><div class="form-group"><label>금액 (원)</label><input type="number" id="amount" required></div><div class="form-group"><label>이미지 파일</label><input type="file" id="imageFile" accept="image/*"></div><div class="form-group"><label>사운드 파일 (선택)</label><input type="file" id="soundFile" accept="audio/*"></div><button type="submit" class="btn">추가하기</button></form><hr style="margin:20px 0;"><h3>📋 목록</h3><div id="list">불러오는 중...</div><br><a href="javascript:history.back();" class="btn" style="background:#7f8c8d;">돌아가기</a></div><script>
        async function load() {
            const res = await fetch('/api/reactions/${req.params.apiKey}');
            const data = await res.json();
            const l = document.getElementById('list'); l.innerHTML = '';
            if(!data.reactions || !data.reactions.length){ l.innerHTML = '<p>등록된 리액션이 없습니다.</p>'; return; }
            data.reactions.forEach(r => {
                const div = document.createElement('div'); div.className = 'reaction-item';
                div.innerHTML = '<div><b>' + r.amount.toLocaleString() + '원 이상</b></div><button class="btn" style="background:#e74c3c;" onclick="del(\\''+r._id+'\\')">삭제</button>';
                l.appendChild(div);
            });
        }
        document.getElementById('form').addEventListener('submit', async e => {
            e.preventDefault();
            const fd = new FormData();
            fd.append('amount', document.getElementById('amount').value);
            const img = document.getElementById('imageFile').files[0]; if(img) fd.append('imageFile', img);
            const snd = document.getElementById('soundFile').files[0]; if(snd) fd.append('soundFile', snd);
            
            const res = await fetch('/api/reactions/${req.params.apiKey}', { method: 'POST', body: fd });
            const r = await res.json();
            if(r.success){ alert('추가 완료!'); document.getElementById('amount').value=''; document.getElementById('imageFile').value=''; document.getElementById('soundFile').value=''; load(); } else { alert('실패'); }
        });
        async function del(id) {
            if(!confirm('삭제하시겠습니까?')) return;
            await fetch('/api/reactions/${req.params.apiKey}/' + id, { method: 'DELETE' });
            load();
        }
        load();
        </script></body></html>`);
});

app.get('/ranking-overlay/:apiKey', async (req, res) => {
    const user = await User.findOne({ apiKey: req.params.apiKey });
    if (!user) return res.status(404).send('Not found');
    res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{background:transparent;margin:0;font-family:sans-serif;}.board{background:rgba(0,0,0,0.75);color:#fff;padding:20px;border-radius:10px;min-width:250px;}h3{margin:0 0 15px 0;color:#f1c40f;text-align:center;}.item{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.2);font-size:15px;}</style></head><body><div class="board"><h3>🏆 실시간 랭킹</h3><div id="content">불러오는 중...</div></div><script>
        async function loadRank() {
            try{
                const res = await fetch('/api/ranking/${req.params.apiKey}');
                const data = await res.json();
                const c = document.getElementById('content'); c.innerHTML = '';
                if(!data.length){ c.innerHTML = '<div style="text-align:center;color:#aaa;">내역 없음</div>'; return; }
                data.forEach((r, i) => {
                    const d = document.createElement('div'); d.className = 'item';
                    d.innerHTML = '<span><b>' + (i + 1) + '. ' + r._id + '</b></span><span>' + r.totalAmount.toLocaleString() + '원</span>';
                    c.appendChild(d);
                });
            }catch(e){}
        }
        loadRank(); setInterval(loadRank, 5000);
        </script></body></html>`);
});

app.get('/api/logs/:apiKey', async (req, res) => {
    try {
        const user = await User.findOne({ apiKey: req.params.apiKey });
        if (!user) return res.status(404).json([]);
        const logs = await Donation.find({ streamerId: user._id }).sort({ timestamp: -1 }).limit(50);
        res.json(logs);
    } catch (e) { res.status(500).json([]); }
});

app.get('/api/ranking/:apiKey', async (req, res) => {
    try {
        const user = await User.findOne({ apiKey: req.params.apiKey });
        if (!user) return res.status(404).json([]);
        const todayKey = getKSTDateKey();
        const donations = await Donation.find({ streamerId: user._id, dateKey: todayKey }, { nickname: 1, amount: 1, timestamp: 1 }).sort({ timestamp: 1 });
        
        const map = {};
        donations.forEach(d => {
            let name = d.nickname.trim();
            if (name.endsWith("님")) name = name.slice(0, -1).trim();
            if (!map[name]) map[name] = { totalAmount: 0, count: 0, firstTime: d.timestamp };
            map[name].totalAmount += d.amount;
            map[name].count += 1;
        });

        const list = Object.keys(map).map(name => ({ _id: name, totalAmount: map[name].totalAmount, count: map[name].count, firstTime: map[name].firstTime }));
        list.sort((a, b) => b.totalAmount !== a.totalAmount ? b.totalAmount - a.totalAmount : new Date(a.firstTime) - new Date(b.firstTime));
        res.json(list.slice(0, 5));
    } catch (e) { res.status(500).json([]); }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
