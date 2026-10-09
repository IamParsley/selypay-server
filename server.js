const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// MongoDB 연결 (필요시 수정)
// mongoose.connect('mongodb://localhost:27017/selypay');

// Supabase 설정
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://당신의프로젝트주소.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '당신의Publishable키';
const STORAGE_BUCKET = process.env.STORAGE_BUCKET || '본인이만든버킷이름';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Multer 메모리 스토리지 설정 (서버 경유 Supabase 업로드용)
const upload = multer({ storage: multer.memoryStorage() });

// 몽고디비 스키마 정의
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

// 한국 시간 헬퍼 함수
function getKSTDateTime() {
    return new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
function getKSTDateKey() {
    const now = new Date();
    const kstDate = new Date(now.getTime() + (9 * 60 * 60 * 1000));
    return kstDate.toISOString().split('T')[0];
}

// API: 알림 설정 불러오기
app.get('/api/settings/alert/:apiKey', async (req, res) => {
    try {
        const user = await User.findOne({ apiKey: req.params.apiKey });
        if (!user) return res.status(404).json({ success: false, error: 'Streamer not found' });
        res.json({ success: true, settings: user.alertSettings || {} });
    } catch (e) {
        res.status(500).json({ success: false, error: 'Server Error' });
    }
});

// API: 알림 설정 저장하기
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

// 3. 홈 루트
app.get('/', (req, res) => {
    res.send(`<div style="font-family:sans-serif; text-align:center; margin-top:50px;"><h1>SelyPay 멀티 테넌트 서버 실행 중 🚀</h1><p><a href="/register">스트리머 회원가입</a> | <a href="/login">로그인</a></p></div>`);
});

// 4. 회원가입 페이지
app.get('/register', (req, res) => {
    res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>스트리머 회원가입</title></head><body style="font-family:sans-serif; background:#f4f7f6; display:flex; justify-content:center; align-items:center; height:100vh; margin:0;"><div style="background:white; padding:30px; border-radius:10px; box-shadow:0 2px 10px rgba(0,0,0,0.1); width:300px;"><h2>스트리머 회원가입</h2><form action="/api/register" method="POST"><div style="margin-bottom:15px;"><label>아이디</label><br><input type="text" name="username" style="width:100%; padding:8px; margin-top:5px;" required></div><div style="margin-bottom:15px;"><label>비밀번호</label><br><input type="password" name="password" style="width:100%; padding:8px; margin-top:5px;" required></div><button type="submit" style="width:100%; padding:10px; background:#ff4757; color:white; border:none; border-radius:5px; font-weight:bold; cursor:pointer;">가입하기</button></form><p style="text-align:center; margin-top:15px;"><a href="/login">이미 계정이 있으신가요? 로그인</a></p></div></body></html>`);
});

app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        const apiKey = 'sely_' + crypto.randomBytes(16).toString('hex');
        const newUser = new User({ username, password, apiKey });
        await newUser.save();
        res.send(`<script>alert('회원가입 성공! 발급된 API Key를 안전하게 보관하세요.'); location.href = '/login';</script>`);
    } catch (e) {
        res.send(`<script>alert('회원가입 실패 (중복된 아이디일 수 있습니다)'); history.back();</script>`);
    }
});

// 5. 로그인 페이지
app.get('/login', (req, res) => {
    res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>스트리머 로그인</title></head><body style="font-family:sans-serif; background:#f4f7f6; display:flex; justify-content:center; align-items:center; height:100vh; margin:0;"><div style="background:white; padding:30px; border-radius:10px; box-shadow:0 2px 10px rgba(0,0,0,0.1); width:300px;"><h2>스트리머 로그인</h2><form action="/api/login" method="POST"><div style="margin-bottom:15px;"><label>아이디</label><br><input type="text" name="username" style="width:100%; padding:8px; margin-top:5px;" required></div><div style="margin-bottom:15px;"><label>비밀번호</label><br><input type="password" name="password" style="width:100%; padding:8px; margin-top:5px;" required></div><button type="submit" style="width:100%; padding:10px; background:#2ed573; color:white; border:none; border-radius:5px; font-weight:bold; cursor:pointer;">로그인</button></form><p style="text-align:center; margin-top:15px;"><a href="/register" style="color:#ff4757; text-decoration:none;">계정이 없으신가요? 회원가입</a></p></div></body></html>`);
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username, password });
        if (!user) {
            return res.send(`<script>alert('아이디 또는 비밀번호가 틀렸습니다.'); history.back();</script>`);
        }
        res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>` + user.username + ` 대시보드</title><style>body { font-family: sans-serif; background: #f4f7f6; padding: 40px; margin: 0; } .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); } .box { background: #eee; padding: 10px; font-family: monospace; word-break: break-all; border-radius: 5px; margin-top: 5px; } .log-box { background: #fafafa; border: 1px solid #ddd; padding: 15px; border-radius: 5px; max-height: 250px; overflow-y: auto; margin-top: 10px; } .log-item { padding: 8px 0; border-bottom: 1px solid #eee; font-size: 14px; } .log-item:last-child { border-bottom: none; } .btn-group { display: flex; gap: 10px; margin-top: 8px; } .btn { flex: 1; padding: 8px 12px; background: #3498db; color: white; text-align: center; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 13px; } .btn:hover { background: #2980b9; }</style></head><body><div class="container"><h2>환영합니다, ` + user.username + `님! 🎉</h2><p><b>고유 API Key (안드로이드 앱에 입력):</b></p><div class="box">` + user.apiKey + `</div><p style="margin-top:20px;"><b>내 알림창 오버레이 주소:</b></p><div class="box">https://` + req.get('host') + `/overlay/` + user.apiKey + `</div><div class="btn-group"><a href="/manage/alert/` + user.apiKey + `" class="btn" target="_blank">⚙ 알림창 세부 설정/관리 사이트 가기</a></div><p style="margin-top:20px;"><b>내 방송용 랭킹판 오버레이 주소:</b></p><div class="box">https://` + req.get('host') + `/ranking-overlay/` + user.apiKey + `</div><div class="btn-group"><a href="/manage/ranking/` + user.apiKey + `" class="btn" target="_blank" style="background:#e67e22;">⚙️ 랭킹판 세부 설정/관리 사이트 가기</a></div><p style="margin-top:30px;"><b> 🏆 계좌후원 랭킹 (KST 자정 기준)</b></p><div class="log-box" id="rankingList"><div class="log-item">랭킹을 불러오는 중...</div></div><p style="margin-top:30px;"><b>📋 최근 후원 내역 (최대 20개)</b></p><div class="log-box" id="donationLogList"><div class="log-item">후원 내역을 불러오는 중...</div></div><p style="margin-top:30px; text-align:right;"><a href="/login">로그아웃</a></p></div><script>async function fetchDonationLogs() { try { const response = await fetch('/api/logs/` + user.apiKey + `'); const logs = await response.json(); const logContainer = document.getElementById('donationLogList'); logContainer.innerHTML = ''; if (!logs || logs.length === 0) { logContainer.innerHTML = '<div class="log-item">아직 후원 내역이 없습니다.</div>'; return; } logs.slice(0, 20).forEach(log => { const div = document.createElement('div'); div.className = 'log-item'; div.innerHTML = '<b>[' + log.datetime + ']</b> ' + log.nickname + '님 (' + log.amount.toLocaleString() + '원): ' + log.message; logContainer.appendChild(div); }); } catch (e) { console.error(e); } } async function fetchRanking() { try { const response = await fetch('/api/ranking/` + user.apiKey + `'); const ranking = await response.json(); const rankContainer = document.getElementById('rankingList'); rankContainer.innerHTML = ''; if (!ranking || ranking.length === 0) { rankContainer.innerHTML = '<div class="log-item">오늘 아직 후원 내역이 없습니다.</div>'; return; } ranking.forEach((item, index) => { const div = document.createElement('div'); div.className = 'log-item'; div.innerHTML = '<b>' + (index + 1) + '위</b> ' + item._id + '님 - ' + item.totalamount.toLocaleString() + '원 (' + item.count + '회)'; rankContainer.appendChild(div); }); } catch (e) { console.error(e); } } fetchDonationLogs(); fetchRanking(); setInterval(fetchDonationLogs, 3000); setInterval(fetchRanking, 5000);</script></body></html>`);
    } catch (e) {
        res.status(500).send('Server Error');
    }
});

// 6. 안드로이드 앱에서 알림을 받아오는 POST 엔드포인트
app.post('/api/notification', async (req, res) => {
    const { apiKey, message } = req.body;
    if (!apiKey || !message) {
        return res.status(400).json({ success: false, error: 'API Key or Message is missing' });
    }
    try {
        const user = await User.findOne({ apiKey });
        if (!user) {
            return res.status(401).json({ success: false, error: 'Invalid API Key' });
        }
        let amount = 0;
        const amountMatch = message.match(/([0-9,]+)\s*원/);
        if (amountMatch) {
            const parsed = parseInt(amountMatch[1].replace(/,/g, ''), 10);
            if (!isNaN(parsed)) amount = parsed;
        }
        let nickname = "익명";
        if (message.includes("님")) {
            nickname = message.split("님")[0].trim();
        }
        const donationData = new Donation({
            streamerId: user._id,
            nickname,
            amount, 
            message, 
            datetime: getKSTDateTime(),
            dateKey: getKSTDateKey()
        });
        await donationData.save();
        console.log(`[${user.username}] 후원 수신 성공:`, donationData);
        res.status(200).json({ success: true, data: donationData });
    } catch (e) {
        console.error(e);
        res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
});

// 7. 스트리머별 OBS 알림 오버레이 화면 (정확한 금액 매칭 및 사운드 길이 자동 조절 적용)
app.get('/overlay/:apiKey', async (req, res) => {
    const { apiKey } = req.params;
    const user = await User.findOne({ apiKey });
    if (!user) return res.status(404).send('Streamer not found');

    const settings = user.alertSettings || {};
    const useImage = settings.useImage !== false;
    const reactions = await Reaction.find({ streamerId: user._id });

    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>SelyPay Overlay</title>
            <style>
                html, body {
                    width: 100%; height: 100%; margin: 0; padding: 0;
                    background-color: transparent !important;
                    font-family: 'Malgun Gothic', '맑은 고딕', sans-serif;
                    overflow: hidden;
                }
                #alert-container {
                    width: fit-content; height: auto; display: none;
                    flex-direction: column; justify-content: center; align-items: center;
                    text-align: center; box-sizing: border-box; padding: 10px 20px;
                    background: transparent !important;
                    margin: 0 auto;
                }
                #alert-image { 
                    max-height: 35vh; width: auto; max-width: 60vw;
                    object-fit: contain; display: ${useImage ? 'block' : 'none'}; margin-bottom: 1vh;
                }
                #alert-line1 {
                    color: #ffffff; font-size: ${settings.fontSize || '32px'}; font-weight: 800; 
                    text-shadow: -3px -3px 0 #000, 3px -3px 0 #000, -3px 3px 0 #000, 3px 3px 0 #000, 4px 4px 8px rgba(0, 0, 0, 0.9);
                    width: auto; max-width: 80vw; word-break: keep-all; overflow-wrap: break-word; line-height: 1.2; margin-bottom: 0.5vh;
                }
                #alert-line2 {
                    color: #ffffff; font-size: ${settings.fontSize || '32px'}; font-weight: 800; 
                    text-shadow: -3px -3px 0 #000, 3px -3px 0 #000, -3px 3px 0 #000, 3px 3px 0 #000, 4px 4px 8px rgba(0, 0, 0, 0.9);
                    width: auto; max-width: 80vw; word-break: break-word; line-height: 1.2;
                }
            </style>
        </head>
        <body>
            <div id="alert-container">
                <img id="alert-image" src="/alerticon.gif" alt="Alert GIF">
                <div id="alert-line1"></div>
                <div id="alert-line2"></div>
            </div>

            <audio id="alert-sound"></audio>

            <script>
                const reactions = ${JSON.stringify(reactions)};
                const defaultSound = "/${settings.soundType || 'coinsound.mp3'}";
                const defaultImage = "/alerticon.gif";
                const useImageSetting = ${useImage};

                let lastCheckedTime = "";
                
                async function checkNewDonation() {
                    try {
                        const response = await fetch('/api/logs/' + '${apiKey}');
                        const logs = await response.json();
                        if (logs.length > 0) {
                            const latest = logs[0];
                            if (latest.datetime !== lastCheckedTime) {
                                lastCheckedTime = latest.datetime;
                                showAlert(latest);
                            }
                        }
                    } catch (e) { console.error(e); }
                }

                function showAlert(donation) {
                    const container = document.getElementById('alert-container');
                    const imgElement = document.getElementById('alert-image');
                    const line1 = document.getElementById('alert-line1');
                    const line2 = document.getElementById('alert-line2');
                    
                    const message = donation.message;
                    const amount = donation.amount || 0;
                            
                    let firstText = message;
                    let secondText = "";
                    
                    const newlineIdx = message.indexOf('\\\\n');
                    if (newlineIdx !== -1) {
                        firstText = message.substring(0, newlineIdx);
                        secondText = message.substring(newlineIdx + 2);
                    }

                    line1.innerText = firstText;
                    line2.innerText = secondText;

                    // 정확히 일치하는 리액션 찾기
                    const matchedReaction = reactions.find(r => r.amount === amount);

                    if (useImageSetting) {
                        if (matchedReaction && matchedReaction.imageUrl) {
                            imgElement.src = matchedReaction.imageUrl;
                            imgElement.style.display = 'block';
                        } else {
                            imgElement.src = defaultImage;
                            imgElement.style.display = 'block';
                        }
                    } else {
                        imgElement.style.display = 'none';
                    }

                    const audioSrc = (matchedReaction && matchedReaction.audioUrl) ? matchedReaction.audioUrl : defaultSound;
                    const sound = new Audio(audioSrc);

                    container.
                
