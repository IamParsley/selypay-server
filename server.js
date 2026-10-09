const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const STORAGE_BUCKET = process.env.STORAGE_BUCKET || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const upload = multer({ storage: multer.memoryStorage() });

const userSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    apiKey: { type: String, unique: true, required: true },
    alertSettings: {
        soundType: { type: String, default: 'coinsound.mp3' },
        duration: { type: Number, default: 5 },
        fontSize: { type: String, default: '32px' },
        useImage: { type: Boolean, default: true }
    }
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

const reactionSchema = new mongoose.Schema({
    streamerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, default: 0 },
    imageUrl: { type: String, default: "" },
    audioUrl: { type: String, default: "" }
});

const User = mongoose.model('User', userSchema);
const Donation = mongoose.model('Donation', donationSchema);
const Reaction = mongoose.model('Reaction', reactionSchema);

function getKSTDateTime() {
    return new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
function getKSTDateKey() {
    const now = new Date();
    const kstDate = new Date(now.getTime() + (9 * 60 * 60 * 1000));
    return kstDate.toISOString().split('T')[0];
}

app.get('/api/settings/alert/:apiKey', async (req, res) => {
    try {
        const user = await User.findOne({ apiKey: req.params.apiKey });
        if (!user) return res.status(404).json({ success: false, error: 'Streamer not found' });
        res.json({ success: true, settings: user.alertSettings || {} });
    } catch (e) {
        res.status(500).json({ success: false, error: 'Server Error' });
    }
});

app.post('/api/settings/alert/:apiKey', async (req, res) => {
    try {
        const { soundType, duration, fontSize, useImage } = req.body;
        const user = await User.findOneAndUpdate(
            { apiKey: req.params.apiKey },
            { 
                $set: { 
                    'alertSettings.soundType': soundType, 
                    'alertSettings.duration': Number(duration), 
                    'alertSettings.fontSize': fontSize, 
                    'alertSettings.useImage': useImage === true || useImage === 'true' 
                } 
            },
            { new: true }
        );
        if (!user) return res.status(404).json({ success: false, error: 'Streamer not found' });
        res.json({ success: true, message: '설정이 저장되었습니다.' });
    } catch (e) {
        res.status(500).json({ success: false, error: 'Server Error' });
    }
});

app.get('/', (req, res) => {
    res.send(`<div style="font-family:sans-serif; text-align:center; margin-top:50px;"><h1>SelyPay 서버 실행 중 🚀</h1><p><a href="/register">스트리머 회원가입</a> | <a href="/login">로그인</a></p></div>`);
});

app.get('/register', (req, res) => {
    res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>스트리머 회원가입</title></head><body style="font-family:sans-serif; background:#f4f7f6; display:flex; justify-content:center; align-items:center; height:100vh; margin:0;"><div style="background:white; padding:30px; border-radius:10px; box-shadow:0 2px 10px rgba(0,0,0,0.1); width:300px;"><h2>스트리머 회원가입</h2><form action="/api/register" method="POST"><div style="margin-bottom:15px;"><label>아이디</label><br><input type="text" name="username" style="width:100%; padding:8px; margin-top:5px;" required></div><div style="margin-bottom:15px;"><label>비밀번호</label><br><input type="password" name="password" style="width:100%; padding:8px; margin-top:5px;" required></div><button type="submit" style="width:100%; padding:10px; background:#ff4757; color:white; border:none; border-radius:5px; font-weight:bold; cursor:pointer;">가입하기</button></form><p style="text-align:center; margin-top:15px;"><a href="/login">이미 계정이 있으신가요? 로그인</a></p></div></body></html>`);
});

app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        const apiKey = 'sely_' + crypto.randomBytes(16).toString('hex');
        const newUser = new User({ username, password, apiKey });
        await newUser.save();
        res.send(`<script>alert('회원가입 성공!'); location.href = '/login';</script>`);
    } catch (e) {
        res.send(`<script>alert('회원가입 실패'); history.back();</script>`);
    }
});

app.get('/login', (req, res) => {
    res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>스트리머 로그인</title></head><body style="font-family:sans-serif; background:#f4f7f6; display:flex; justify-content:center; align-items:center; height:100vh; margin:0;"><div style="background:white; padding:30px; border-radius:10px; box-shadow:0 2px 10px rgba(0,0,0,0.1); width:300px;"><h2>스트리머 로그인</h2><form action="/api/login" method="POST"><div style="margin-bottom:15px;"><label>아이디</label><br><input type="text" name="username" style="width:100%; padding:8px; margin-top:5px;" required></div><div style="margin-bottom:15px;"><label>비밀번호</label><br><input type="password" name="password" style="width:100%; padding:8px; margin-top:5px;" required></div><button type="submit" style="width:100%; padding:10px; background:#2ed573; color:white; border:none; border-radius:5px; font-weight:bold; cursor:pointer;">로그인</button></form><p style="text-align:center; margin-top:15px;"><a href="/register" style="color:#ff4757; text-decoration:none;">회원가입</a></p></div></body></html>`);
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username, password });
        if (!user) return res.send(`<script>alert('로그인 실패'); history.back();</script>`);
        
        res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>대시보드</title><style>body{font-family:sans-serif;background:#f4f7f6;padding:40px;margin:0;}.container{max-width:600px;margin:0 auto;background:white;padding:30px;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,0.1);}.box{background:#eee;padding:10px;font-family:monospace;word-break:break-all;border-radius:5px;margin-top:5px;}.log-box{background:#fafafa;border:1px solid #ddd;padding:15px;border-radius:5px;max-height:200px;overflow-y:auto;margin-top:10px;}.log-item{padding:5px 0;border-bottom:1px solid #eee;font-size:13px;}.btn{display:inline-block;margin-top:10px;padding:8px 12px;background:#3498db;color:white;text-decoration:none;border-radius:5px;font-weight:bold;font-size:13px;}</style></head><body><div class="container"><h2>` + user.username + `님 환영합니다!</h2><p><b>API Key:</b></p><div class="box">` + user.apiKey + `</div><p style="margin-top:15px;"><b>오버레이 주소:</b></p><div class="box">https://` + req.get('host') + `/overlay/` + user.apiKey + `</div><a href="/manage/alert/` + user.apiKey + `" class="btn" target="_blank">⚙️ 알림창 설정/관리</a><p style="margin-top:20px;"><b>최근 후원 내역</b></p><div class="log-box" id="logList">불러오는 중...</div><br><a href="/login">로그아웃</a></div><script>async function fetchLogs(){try{const res=await fetch('/api/logs/` + user.apiKey + `');const logs=await res.json();const box=document.getElementById('logList');box.innerHTML='';if(!logs.length){box.innerHTML='내역이 없습니다.';return;}logs.forEach(l=>{box.innerHTML+='<div class="log-item">['+l.datetime+'] '+l.nickname+' ('+l.amount.toLocaleString()+'원): '+l.message+'</div>';});}catch(e){}}fetchLogs();setInterval(fetchLogs, 3000);</script></body></html>`);
    } catch (e) {
        res.status(500).send('Server Error');
    }
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
        
        const donation = new Donation({
            streamerId: user._id, nickname, amount, message,
            datetime: getKSTDateTime(), dateKey: getKSTDateKey()
        });
        await donation.save();
        res.status(200).json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false });
    }
});

app.get('/overlay/:apiKey', async (req, res) => {
    const { apiKey } = req.params;
    const user = await User.findOne({ apiKey });
    if (!user) return res.status(404).send('Not found');

    const settings = user.alertSettings || {};
    const useImage = settings.useImage !== false;
    const reactions = await Reaction.find({ streamerId: user._id });

    res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
        html,body{width:100%;height:100%;margin:0;padding:0;background:transparent!important;overflow:hidden;font-family:'Malgun Gothic',sans-serif;}
        #alert-container{width:fit-content;height:auto;display:none;flex-direction:column;align-items:center;text-align:center;padding:10px 20px;background:transparent!important;margin:0 auto;}
        #alert-image{max-height:35vh;width:auto;max-width:60vw;object-fit:contain;display:${useImage ? 'block' : 'none'};margin-bottom:1vh;}
        #alert-line1,#alert-line2{color:#fff;font-size:${settings.fontSize || '32px'};font-weight:800;text-shadow:-3px -3px 0 #000,3px -3px 0 #000,-3px 3px 0 #000,3px 3px 0 #000,4px 4px 8px rgba(0,0,0,0.9);width:auto;max-width:80vw;word-break:break-all;line-height:1.2;margin-bottom:0.5vh;}
    </style></head><body>
    <div id="alert-container"><img id="alert-image" src="/alerticon.gif"><div id="alert-line1"></div><div id="alert-line2"></div></div>
    <audio id="alert-sound"></audio>
    <script>
        const reactions = ${JSON.stringify(reactions)};
        const defaultSound = "/${settings.soundType || 'coinsound.mp3'}";
        const defaultImage = "/alerticon.gif";
        const useImageSetting = ${useImage};
        let lastTime = "";
        async function check(){
            try{
                const res = await fetch('/api/logs/${apiKey}');
                const logs = await res.json();
                if(logs.length > 0 && logs[0].datetime !== lastTime){
                    lastTime = logs[0].datetime;
                    showAlert(logs[0]);
                }
            }catch(e){}
        }
        function showAlert(d){
            const c = document.getElementById('alert-container');
            const img = document.getElementById('alert-image');
            const l1 = document.getElementById('alert-line1');
            const l2 = document.getElementById('alert-line2');
            const msg = d.message;
            const amt = d.amount || 0;
            let t1 = msg, t2 = "";
            const idx = msg.indexOf('\\\\n');
            if(idx !== -1){ t1 = msg.substring(0, idx); t2 = msg.substring(idx+2); }
            l1.innerText = t1; l2.innerText = t2;
            const match = reactions.find(r => r.amount === amt);
            if(useImageSetting){
                img.src = (match && match.imageUrl) ? match.imageUrl : defaultImage;
                img.style.display = 'block';
            }else{ img.style.display = 'none'; }
            const sound = new Audio((match && match.audioUrl) ? match.audioUrl : defaultSound);
            c.style.display = 'flex';
            sound.currentTime = 0;
            sound.play().catch(e=>{});
            let timeout = ${(settings.duration || 5) * 1000};
            sound.onloadedmetadata = function(){
                if(sound.duration && !isNaN(sound.duration)) timeout = sound.duration * 1000;
                clearTimeout(window.timer);
                window.timer = setTimeout(()=>{ c.style.display = 'none'; }, timeout);
            };
            window.timer = setTimeout(()=>{ c.style.display = 'none'; }, timeout);
        }
        setInterval(check, 1000);
    </script></body></html>`);
});

app.get('/manage/alert/:apiKey', async (req, res) => {
    const { apiKey } = req.params;
    const user = await User.findOne({ apiKey });
    if (!user) return res.status(404).send('Not found');
    const settings = user.alertSettings || {};

    res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>관리</title><style>
        body{font-family:sans-serif;background:#f4f7f6;padding:40px;margin:0;}
        .container{max-width:650px;margin:0 auto;background:white;padding:30px;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,0.1);}
        .box{background:#eee;padding:10px;font-family:monospace;word-break:break-all;border-radius:5px;margin-top:5px;}
        .form-group{margin-bottom:20px;}.form-group label{display:block;font-weight:bold;margin-bottom:5px;}
        .form-group input{width:100%;padding:8px;box-sizing:border-box;border:1px solid #ddd;border-radius:4px;}
        .btn{display:inline-block;padding:10px 15px;background:#3498db;color:white;border:none;border-radius:5px;font-weight:bold;cursor:pointer;}
        .preview{width:100%;height:180px;background:#111;border-radius:8px;display:flex;flex-direction:column;justify-content:center;align-items:center;position:relative;overflow:hidden;box-sizing:border-box;padding:15px;margin-bottom:20px;}
        .reaction-item{background:#fafafa;border:1px solid #ddd;padding:12px;border-radius:5px;margin-bottom:10px;font-size:14px;}
    </style></head><body><div class="container">
    <h2>🔔 알림창 및 리액션 관리</h2>
    <div class="box">https://${req.get('host')}/overlay/${user.apiKey}</div>
    <hr style="margin:20px 0;">
    <h3>⚙️ 기본 설정 및 미리보기</h3>
    <div class="preview"><img id="p-img" src="/alerticon.gif" style="max-height:50px;margin-bottom:8px;"><div id="p-l1" style="color:#fff;font-weight:800;text-shadow:-2px -2px 0 #000,2px -2px 0 #000;">테스트후원알림님 1,000원</div><div id="p-l2" style="color:#fff;font-weight:800;text-shadow:-2px -2px 0 #000,2px -2px 0 #000;">후원 감사합니다</div></div>
    <form id="settingForm">
        <div class="form-group"><label>지속 시간 (초)</label><input type="number" id="duration" value="${settings.duration || 5}"></div>
        <div class="form-group"><label>폰트 크기</label><input type="text" id="fontSize" value="${settings.fontSize || '32px'}"></div>
        <div class="form-group"><label><input type="checkbox" id="useImage" ${settings.useImage !== false ? 'checked' : ''}> 기본 이미지 사용</label></div>
        <button type="submit" class="btn">설정 저장</button>
    </form>
    <hr style="margin:20px 0;">
    <h3>🎨 커스텀 리액션 등록</h3>
    <form id="reactionForm">
        <div class="form-group"><label>후원 금액 (원)</label><input type="number" id="rAmount" required></div>
        <div class="form-group"><label>이미지 파일</label><input type="file" id="rImage" accept="image/*"></div>
        <div class="form-group"><label>오디오 파일</label><input type="file" id="rAudio" accept="audio/*"></div>
        <button type="button" id="rBtn" class="btn" style="background:#2ed573;">등록하기</button>
    </form>
    <h4 style="margin-top:30px;">📋 리액션 목록</h4><div id="rList">불러오는 중...</div>
    <br><a href="javascript:history.back();" class="btn" style="background:#7f8c8d;">돌아가기</a>
    </div><script>
    function updateP(){
        const fs = document.getElementById('fontSize').value;
        const ui = document.getElementById('useImage').checked;
        const l1 = document.getElementById('p-l1'), l2 = document.getElementById('p-l2'), img = document.getElementById('p-img');
        l1.style.fontSize = isNaN(fs)? fs : fs+'px';
        l2.style.fontSize = isNaN(fs)? fs : fs+'px';
        img.style.display = ui? 'block':'none';
    }
    document.getElementById('fontSize').addEventListener('input', updateP);
    document.getElementById('useImage').addEventListener('change', updateP);
    updateP();

    document.getElementById('settingForm').addEventListener('submit', async(e)=>{
        e.preventDefault();
        const res = await fetch('/api/settings/alert/${apiKey}', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({duration: document.getElementById('duration').value, fontSize: document.getElementById('fontSize').value, useImage: document.getElementById('useImage').checked})
        });
        const r = await res.json();
        alert(r.success? '저장되었습니다!':'실패');
    });

    async function loadR(){
        const res = await fetch('/api/reactions/${apiKey}');
        const data = await res.json();
        const box = document.getElementById('rList');
        box.innerHTML = data.length ? '' : '등록된 리액션이 없습니다.';
        data.forEach(r => {
            box.innerHTML += '<div class="reaction-item"><b>'+r.amount.toLocaleString()+'원 (동일 금액)</b><br><small>이미지: '+(r.imageUrl?'O':'X')+' / 오디오: '+(r.audioUrl?'O':'X')+'</small></div>';
        });
    }

    document.getElementById('rBtn').addEventListener('click', async()=>{
        const amount = document.getElementById('rAmount').value;
        const img = document.getElementById('rImage').files[0];
        const aud = document.getElementById('rAudio').files[0];
        if(!amount) return alert('금액을 입력하세요.');
        const fd = new FormData();
        fd.append('amount', amount);
        if(img) fd.append('image', img);
        if(aud) fd.append('audio', aud);
        const btn = document.getElementById('rBtn');
        btn.innerText = '업로드 중...'; btn.disabled = true;
        try{
            const res = await fetch('/api/reactions/${apiKey}', {method:'POST', body:fd});
            const r = await res.json();
            if(r.success){ alert('등록 완료!'); document.getElementById('reactionForm').reset(); loadR(); }
            else alert('실패: '+r.error);
        }catch(e){alert('오류 발생');}
        finally{ btn.innerText = '등록하기'; btn.disabled = false; }
    });
    loadR();
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

app.post('/api/reactions/:apiKey', upload.fields([{ name: 'image' }, { name: 'audio' }]), async (req, res) => {
    try {
        const user = await User.findOne({ apiKey: req.params.apiKey });
        if (!user) return res.status(404).json({ success: false, error: 'Not found' });
        const { amount } = req.body;
        if (!amount) return res.status(400).json({ success: false, error: 'Amount required' });

        let imageUrl = "", audioUrl = "";
        if (req.files && req.files['image']) {
            const file = req.files['image'][0];
            const name = `reactions/${user._id}_${Date.now()}_${file.originalname}`;
            const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(name, file.buffer, { contentType: file.mimetype, upsert: true });
            if (error) throw error;
            imageUrl = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(name).data.publicUrl;
        }
        if (req.files && req.files['audio']) {
            const file = req.files['audio'][0];
            const name = `reactions/${user._id}_${Date.now()}_${file.originalname}`;
            const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(name, file.buffer, { contentType: file.mimetype, upsert: true });
            if (error) throw error;
            audioUrl = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(name).data.publicUrl;
        }

        const updateData = {};
        if (imageUrl) updateData.imageUrl = imageUrl;
        if (audioUrl) updateData.audioUrl = audioUrl;

        await Reaction.findOneAndUpdate(
            { streamerId: user._id, amount: Number(amount) },
            { $set: updateData },
            { upsert: true, new: true }
        );
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.get('/api/reactions/:apiKey', async (req, res) => {
    try {
        const user = await User.findOne({ apiKey: req.params.apiKey });
        if (!user) return res.status(404).json([]);
        const reactions = await Reaction.find({ streamerId: user._id }).sort({ amount: 1 });
        res.json(reactions);
    } catch (e) { res.status(500).json([]); }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
