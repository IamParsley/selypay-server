const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const crypto = require('crypto');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');

// 홈 랜딩 및 모달 라우터 불러오기
const homeRouter = require('./home');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname));

const upload = multer({ storage: multer.memoryStorage() });

// 1. MongoDB 연결
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(async () => {
        console.log('✅ MongoDB Atlas 연결 성공!');
        await User.updateMany(
            { "alertSettings.useImage": { $exists: false } },
            { $set: { "alertSettings.useImage": true, "alertSettings.useReaction": true } }
        );
    })
    .catch((err) => console.error('❌ MongoDB 연결 에러:', err));

// 유저 스키마
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    apiKey: { type: String, required: true, unique: true },
    alertSettings: {
        soundType: { type: String, default: 'coinsound.mp3' },
        duration: { type: Number, default: 5 },
        fontSize: { type: String, default: '7.5vh' },
        useImage: { type: Boolean, default: true }
    }
});

// 후원 스키마
const donationSchema = new mongoose.Schema({
    streamerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    nickname: { type: String, default: "익명" },
    amount: { type: Number, default: 0 },
    message: { type: String, default: "" },
    datetime: { type: String, required: true },
    dateKey: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
});

// 리액션 설정 스키마
const reactionSchema = new mongoose.Schema({
    streamerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, default: "기본 리액션" },
    amount: { type: Number, default: 0 },
    imageUrl: { type: String, default: "" },
    audioUrl: { type: String, default: "" }
});

const User = mongoose.model('User', userSchema);
const Donation = mongoose.model('Donation', donationSchema);
const Reaction = mongoose.model('Reaction', reactionSchema);

// 한국 시간 구하는 헬퍼 함수
function getKSTDateTime() {
    return new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function getKSTDateKey() {
    const now = new Date();
    const kstDate = new Date(now.getTime() + (9 * 60 * 60 * 1000));
    return kstDate.toISOString().split('T')[0];
}

// 홈 루트 라우터 연결
app.use('/', homeRouter);

// 회원가입 처리 API
app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        const apiKey = 'sely_' + crypto.randomBytes(16).toString('hex');
        const newUser = new User({ username, password, apiKey });
        await newUser.save();
        res.send(`<script>alert('회원가입 성공! 발급된 계정으로 로그인해주세요.'); location.href = '/';</script>`);
    } catch (e) {
        res.send(`<script>alert('회원가입 실패 (중복된 아이디일 수 있습니다)'); history.back();</script>`);
    }
});

// 로그인 및 대시보드 UI[cite: 7, 8, 9]
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username, password });
        if (!user) {
            return res.send(`<script>alert('아이디 또는 비밀번호가 틀렸습니다.'); history.back();</script>`);
        }

        let reactions = [];
        try {
            reactions = await Reaction.find({ streamerId: user._id }).sort({ amount: 1 });
        } catch (err) {
            console.error("리액션 조회 에러:", err);
        }

        res.send(`
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Slenation Dashboard - ${user.username}</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background-color: #f0f4f8; color: #1e293b; min-height: 100vh; }
        header { display: flex; justify-content: space-between; align-items: center; padding: 16px 40px; background-color: #ffffff; border-bottom: 1px solid #e2e8f0; }
        .logo { display: flex; align-items: center; gap: 8px; font-size: 22px; font-weight: 800; color: #101828; text-decoration: none; }
        .logo-icon { width: 28px; height: 28px; background-color: #52b735; border-radius: 6px; display: inline-block; }
        .nav-links { display: flex; gap: 32px; list-style: none; }
        .nav-links a { text-decoration: none; color: #475569; font-size: 15px; font-weight: 600; }
        .user-profile-menu { position: relative; cursor: pointer; }
        .avatar-btn { width: 36px; height: 36px; border-radius: 50%; background-color: #3b82f6; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; border: 2px solid #52b735; }
        .profile-dropdown { display: none; position: absolute; top: 48px; right: 0; width: 220px; background: white; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); border: 1px solid #e2e8f0; z-index: 100; overflow: hidden; }
        .profile-dropdown.active { display: block; }
        .dropdown-header { padding: 14px 18px; border-bottom: 1px solid #f1f5f9; background-color: #f8fafc; }
        .dropdown-header .label { font-size: 11px; color: #94a3b8; font-weight: 700; margin-bottom: 2px; }
        .dropdown-header .username { font-size: 15px; font-weight: 800; color: #0f172a; }
        .dropdown-item { display: flex; align-items: center; gap: 10px; padding: 12px 18px; text-decoration: none; color: #334155; font-size: 14px; font-weight: 600; cursor: pointer; }
        .dropdown-item:hover { background-color: #f8fafc; }
        .dropdown-item.logout { color: #ef4444; border-top: 1px solid #f1f5f9; }
        .dashboard-container { max-width: 1280px; margin: 30px auto; padding: 0 20px; }
        .dashboard-card { background: white; border-radius: 20px; box-shadow: 0 4px 20px rgba(0,0,0,0.03); border: 1px solid #e2e8f0; padding: 30px; }
        .dashboard-title { display: flex; align-items: center; justify-content: center; gap: 10px; font-size: 22px; font-weight: 800; color: #0f172a; margin-bottom: 30px; }
        .layout-grid { display: grid; grid-template-columns: 240px 1fr; gap: 24px; min-height: 600px; }
        .sidebar { border-right: 1px solid #f1f5f9; padding-right: 20px; display: flex; flex-direction: column; justify-content: space-between; }
        .sidebar-menu { list-style: none; display: flex; flex-direction: column; gap: 8px; }
        .menu-btn { display: flex; align-items: center; gap: 10px; width: 100%; padding: 12px 16px; border: none; background: transparent; border-radius: 12px; font-size: 14px; font-weight: 700; color: #475569; cursor: pointer; text-align: left; }
        .menu-btn.active { background-color: #e8f7ec; color: #16a34a; }
        .sidebar-footer { background: #f8fafc; padding: 16px; border-radius: 12px; margin-top: auto; text-align: center; }
        .sidebar-footer .status { font-size: 11px; color: #16a34a; font-weight: 700; margin-top: 4px; display: flex; align-items: center; justify-content: center; gap: 4px; }
        .tab-content { display: none; }
        .tab-content.active { display: block; }
        .overlay-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 14px; display: flex; justify-content: space-between; align-items: center; font-family: monospace; font-size: 13px; color: #475569; margin-top: 8px; margin-bottom: 20px; }
        .copy-btn { background: white; border: 1px solid #cbd5e1; padding: 4px 12px; border-radius: 6px; font-size: 12px; font-weight: 700; cursor: pointer; }
        .content-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        .card-panel { border: 1px solid #e2e8f0; border-radius: 16px; padding: 20px; }
        .card-panel-title { font-size: 15px; font-weight: 800; color: #0f172a; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; }
        .reaction-cards-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 20px; }
        .reaction-item-card { border: 1px solid #e2e8f0; border-radius: 16px; padding: 20px; text-align: center; background: #fafafa; }
        .reaction-thumb { width: 80px; height: 80px; border-radius: 12px; object-fit: contain; margin-bottom: 12px; background: #eee; }
        .btn-green { background-color: #52b735; color: white; border: none; padding: 8px 16px; border-radius: 8px; font-weight: 700; cursor: pointer; }
    </style>
</head>
<body>
    <header>
        <a href="/" class="logo"><span class="logo-icon"></span>Slenation</a>
        <ul class="nav-links">
            <li><a href="#about">서비스 소개</a></li>
            <li><a href="#guide">사용 방법</a></li>
            <li><a href="#patch">패치 노트</a></li>
            <li><a href="#support">고객센터</a></li>
        </ul>
        <div class="user-profile-menu" onclick="toggleDropdown()">
            <div class="avatar-btn">🤖</div>
            <div class="profile-dropdown" id="profileDropdown">
                <div class="dropdown-header">
                    <div class="label">접속 계정</div>
                    <div class="username">${user.username}</div>
                </div>
                <a href="#" class="dropdown-item" onclick="showTab('tab-account')">👤 계정 관리</a>
                <a href="#" class="dropdown-item" onclick="showTab('tab-settings')">⚙️ 설정</a>
                <a href="/" class="dropdown-item logout">🚪 로그아웃</a>
            </div>
        </div>
    </header>

    <div class="dashboard-container">
        <div class="dashboard-card">
            <div class="dashboard-title"><span class="logo-icon" style="width:22px; height:22px;"></span> Slenation Dashboard</div>
            
            <div class="layout-grid">
                <div class="sidebar">
                    <ul class="sidebar-menu">
                        <li><button class="menu-btn active" onclick="showTab('tab-ranking', this)">📊 실시간 후원 랭킹</button></li>
                        <li><button class="menu-btn" onclick="showTab('tab-logs', this)">💰 후원 내역</button></li>
                        <li><button class="menu-btn" onclick="showTab('tab-settings', this)">🔔 기본 알림 설정</button></li>
                        <li><button class="menu-btn" onclick="showTab('tab-reactions', this)">🐱 리액션 설정</button></li>
                        <li><button class="menu-btn" onclick="showTab('tab-account', this)">⚙️ 계정 설정</button></li>
                    </ul>
                    <div class="sidebar-footer">
                        <strong style="font-size:14px; color:#0f172a;">Slenation <span style="font-size:11px; color:#94a3b8;">v1.0</span></strong>
                        <div class="status">● 정상 이용 중 (앱 연동 수신)</div>
                    </div>
                </div>

                <div class="main-content">
                    <div id="tab-ranking" class="tab-content active">
                        <div class="content-grid">
                            <div class="card-panel">
                                <div class="card-panel-title">실시간 후원 내역 오버레이</div>
                                <div class="overlay-box">
                                    <span>https://${req.get('host')}/overlay/${user.apiKey}</span>
                                    <button class="copy-btn" onclick="copyToClipboard('https://${req.get('host')}/overlay/${user.apiKey}')">복사</button>
                                </div>
                                <div style="color:#94a3b8; font-size:13px; text-align:center; padding:40px 0;">실시간 입금 수신 피드 (앱 연동 대기)</div>
                            </div>
                            <div class="card-panel">
                                <div class="card-panel-title">실시간 후원 랭킹 오버레이</div>
                                <div class="overlay-box">
                                    <span>https://${req.get('host')}/ranking-overlay/${user.apiKey}</span>
                                    <button class="copy-btn" onclick="copyToClipboard('https://${req.get('host')}/ranking-overlay/${user.apiKey}')">복사</button>
                                </div>
                                <div style="color:#94a3b8; font-size:13px; text-align:center; padding:40px 0;">랭킹 데이터가 없습니다.</div>
                            </div>
                        </div>
                    </div>

                    <div id="tab-logs" class="tab-content">
                        <div class="card-panel">
                            <div class="card-panel-title">모든 후원 내역 아카이브 <span style="font-size:12px; color:#94a3b8; font-weight:normal;">앱을 통해 수신된 내역입니다</span></div>
                            <div style="color:#94a3b8; font-size:14px; text-align:center; padding:80px 0;">수신된 후원 내역이 없습니다.</div>
                        </div>
                    </div>

                    <div id="tab-settings" class="tab-content">
                        <div class="card-panel">
                            <div class="card-panel-title">🔔 기본 알림 세부 설정</div>
                            <button type="button" class="btn-green" onclick="alert('설정이 저장되었습니다.')">저장하기</button>
                        </div>
                    </div>

                    <div id="tab-reactions" class="tab-content">
                        <div class="card-panel">
                            <div class="card-panel-title">
                                📋 등록된 리액션 목록 (총 ${reactions.length}개)
                                <a href="/manage/alert/${user.apiKey}" class="btn-green" target="_blank" style="text-decoration:none; font-size:13px;">+ 리액션 관리 페이지</a>
                            </div>
                            <div class="reaction-cards-grid">
                                ${reactions.length === 0 ? '<div style="color:#94a3b8; grid-column:span 3; text-align:center; padding:40px;">등록된 리액션이 없습니다.</div>' : ''}
                                ${reactions.map(r => `
                                    <div class="reaction-item-card">
                                        <img src="${r.imageUrl && r.imageUrl.startsWith('http') ? r.imageUrl : '/alerticon.gif'}" class="reaction-thumb" alt="리액션" onerror="this.src='/alerticon.gif'">
                                        <div style="font-size:15px; font-weight:800; color:#0f172a; margin-bottom:4px;">${r.name}</div>
                                        <div style="font-size:14px; font-weight:800; color:#16a34a; margin-bottom:4px;">${r.amount.toLocaleString()}원 일치</div>
                                        <div style="font-size:11px; color:#94a3b8; margin-bottom:12px;">🎵 ${r.audioUrl ? '음원 등록됨' : '기본 음원'}</div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </div>

                    <div id="tab-account" class="tab-content">
                        <div class="card-panel">
                            <div class="card-panel-title">⚙️ 계정 및 API Key 관리</div>
                            <div class="overlay-box">
                                <span>${user.apiKey}</span>
                                <button class="copy-btn" onclick="copyToClipboard('${user.apiKey}')">키 복사</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script>
        function toggleDropdown() { document.getElementById('profileDropdown').classList.toggle('active'); }
        function showTab(tabId, btn) {
            document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
            document.querySelectorAll('.menu-btn').forEach(el => el.classList.remove('active'));
            document.getElementById(tabId).classList.add('active');
            if(btn) btn.classList.add('active');
        }
        function copyToClipboard(text) {
            navigator.clipboard.writeText(text);
            alert('클립보드에 복사되었습니다!');
        }
        window.onclick = function(e) {
            if (!e.target.closest('.user-profile-menu')) {
                document.getElementById('profileDropdown').classList.remove('active');
            }
        }
    </script>
</body>
</html>
        `);
    } catch (e) {
        console.error("로그인 에러 발생:", e);
        res.status(500).send('Server Error: ' + e.message);
    }
});

// 안드로이드 앱 알림 수신 엔드포인트
app.post('/api/notification', async (req, res) => {
    const { apiKey, message } = req.body;
    if (!apiKey || !message) return res.status(400).json({ success: false, error: 'API Key or Message is missing' });
    try {
        const user = await User.findOne({ apiKey });
        if (!user) return res.status(401).json({ success: false, error: 'Invalid API Key' });

        let amount = 0;
        const amountMatch = message.match(/([0-9,]+)\s*원/);
        if (amountMatch) {
            const parsed = parseInt(amountMatch[1].replace(/,/g, ''), 10);
            if (!isNaN(parsed)) amount = parsed;
        }

        let nickname = "익명";
        if (message.includes("님")) nickname = message.split("님")[0].trim();

        const donationData = new Donation({
            streamerId: user._id,
            nickname,
            amount, 
            message, 
            datetime: getKSTDateTime(),
            dateKey: getKSTDateKey()
        });

        await donationData.save();
        res.status(200).json({ success: true, data: donationData });
    } catch (e) {
        console.error(e);
        res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
});

// 스트리머별 OBS 알림 오버레이 화면[cite: 11]
app.get('/overlay/:apiKey', async (req, res) => {
    const { apiKey } = req.params;
    const user = await User.findOne({ apiKey });
    if (!user) return res.status(404).send('Streamer not found');

    const settings = user.alertSettings || {};
    const reactions = await Reaction.find({ streamerId: user._id }).sort({ amount: 1 });
    const useImage = settings.useImage !== undefined ? settings.useImage : true;

    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>SelyPay Alert Overlay</title>
            <style>
                body { background: transparent; margin: 0; overflow: hidden; font-family: 'Malgun Gothic', sans-serif; }
                #alert-container { width: 100vw; height: 100vh; display: none; flex-direction: column; justify-content: flex-start; align-items: center; text-align: center; box-sizing: border-box; padding: 2vh 3vw; background: transparent !important; }
                #alert-image { width: 70vw; height: auto; max-width: 80%; max-height: 50vh; object-fit: contain; display: ${useImage ? 'block' : 'none'}; margin-bottom: 5vh; }
                #alert-line1 { color: #ffffff; font-size: 8vh; font-weight: 800; text-shadow: -3px -3px 0 #000, 3px -3px 0 #000, -3px 3px 0 #000, 3px 3px 0 #000, 4px 4px 8px rgba(0, 0, 0, 0.9); width: 90vw; word-break: keep-all; overflow-wrap: break-word; line-height: 1.2; margin-bottom: 3vh; }
                #alert-line2 { color: #ffffff; font-size: 6.5vh; font-weight: 800; text-shadow: -3px -3px 0 #000, 3px -3px 0 #000, -3px 3px 0 #000, 3px 3px 0 #000, 4px 4px 8px rgba(0, 0, 0, 0.9); width: 90vw; word-break: break-word; line-height: 1.2; }
            </style>
        </head>
        <body>
            <div id="alert-container">
                <img id="alert-image" src="" alt="리액션 이미지" onerror="this.src='/alerticon.gif'">
                <div class="text-box" id="alert-line1"></div>
                <div class="text-box" id="alert-line2"></div>
            </div>
            <script>
            const reactions = ${JSON.stringify(reactions)};
            const defaultSound = "/${settings.soundType || 'coinsound.mp3'}";
            const defaultImage = "/alerticon.gif";
            const useImageSetting = ${useImage};
            let lastCheckedTime = "";
            const alertQueue = [];
            let isPlaying = false;

            async function checkNewDonation() {
                try {
                    const response = await fetch('/api/logs/' + '${apiKey}');
                    const logs = await response.json();
                    if (logs.length > 0) {
                        const latest = logs[0];
                        if (latest.datetime !== lastCheckedTime) {
                            lastCheckedTime = latest.datetime;
                            alertQueue.push(latest);
                            processQueue();
                        }
                    }
                } catch (e) { console.error(e); }
            }

            async function checkManualPlay() {
                try {
                    const response = await fetch('/api/manual-play/' + '${apiKey}');
                    const items = await response.json();
                    if (items && items.length > 0) {
                        items.forEach(item => { alertQueue.push(item); });
                        processQueue();
                    }
                } catch (e) { console.error(e); }
            }

            function processQueue() {
                if (isPlaying || alertQueue.length === 0) return;
                isPlaying = true;
                const donation = alertQueue.shift();
                showAlert(donation);
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
                const newlineIdx = message.indexOf('\\n');
                if (newlineIdx !== -1) {
                    firstText = message.substring(0, newlineIdx);
                    secondText = message.substring(newlineIdx + 1);
                }
                line1.innerText = firstText;
                line2.innerText = secondText;
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
                container.style.display = 'flex';
                sound.currentTime = 0;
                sound.play().catch(e => console.log("사운드 재생 실패:", e));

                sound.onended = () => {
                    setTimeout(() => {
                        container.style.display = 'none';
                        isPlaying = false;
                        processQueue();
                    }, 3500);
                };
                sound.onerror = () => {
                    setTimeout(() => {
                        container.style.display = 'none';
                        isPlaying = false;
                        processQueue();
                    }, 3500);
                };
            }
            setInterval(checkNewDonation, 1000);
            setInterval(checkManualPlay, 1000);
            </script>
        </body>
        </html>
    `);
});

// 알림창 세부 관리 및 설정 페이지[cite: 11]
app.get('/manage/alert/:apiKey', async (req, res) => {
    const { apiKey } = req.params;
    const user = await User.findOne({ apiKey });
    if (!user) return res.status(404).send('Streamer not found');
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>알림창 관리 - ` + user.username + `</title>
            <style>
                body { font-family: sans-serif; background: #f4f7f6; padding: 40px; margin: 0; }
                .container { max-width: 900px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                .box { background: #eee; padding: 10px; font-family: monospace; word-break: break-all; border-radius: 5px; margin-top: 5px; }
                .form-group { margin-bottom: 15px; }
                .form-group label { display: block; font-weight: bold; margin-bottom: 5px; font-size: 13px; }
                .form-group input { width: 100%; padding: 8px; box-sizing: border-box; border: 1px solid #ddd; border-radius: 4px; }
                .btn { display: inline-block; padding: 8px 12px; background: #3498db; color: white; text-decoration: none; border: none; border-radius: 5px; font-weight: bold; cursor: pointer; font-size: 12px; }
                .btn:hover { background: #2980b9; }
                .btn-secondary { background: #7f8c8d; }
                .btn-success { background: #2ed573; font-size: 14px; padding: 10px 15px; }
                .btn-warning { background: #f39c12; margin-top: 6px; }
                .reaction-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-top: 15px; }
                .reaction-card { background: #fafafa; border: 1px solid #ddd; border-radius: 8px; padding: 12px; text-align: center; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; justify-content: space-between; }
                .reaction-card img { width: 70px; height: 70px; object-fit: contain; border-radius: 4px; background: #eee; margin-bottom: 8px; }
                .reaction-info { font-size: 13px; width: 100%; word-break: break-all; margin-bottom: 8px; }
                .modal { display: none; position: fixed; z-index: 1000; left: 0; top: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.5); justify-content: center; align-items: center; }
                .modal-content { background: white; padding: 25px; border-radius: 10px; width: 400px; max-width: 90%; box-shadow: 0 4px 15px rgba(0,0,0,0.2); position: relative; }
                .close-btn { position: absolute; right: 15px; top: 15px; font-size: 20px; font-weight: bold; cursor: pointer; color: #888; }
                .close-btn:hover { color: #000; }
            </style>
        </head>
        <body>
            <div class="container">
                <h2>🔔 알림창 및 후원 리액션 관리</h2>
                <p>OBS 브라우저 소스 주소:</p>
                <div class="box">https://` + req.get('host') + `/overlay/` + user.apiKey + `</div>
                <hr style="margin: 25px 0; border:0; border-top:1px solid #ddd;">
                <h3>⚙️ 기본 알림창 세부 설정</h3>
                <form id="alertSettingsForm">
                    <div class="form-group">
                        <label>알림 지속 시간 (초)</label>
                        <input type="number" name="duration" id="duration" min="1" max="15" value="5">
                    </div>
                    <div class="form-group">
                        <label>메시지 폰트 크기</label>
                        <input type="text" name="fontSize" id="fontSize" value="7.5vh">
                    </div>
                    <button type="submit" class="btn" style="font-size:14px; padding:10px 15px;">기본 설정 저장하기</button>
                </form>
                <hr style="margin: 25px 0; border:0; border-top:1px solid #ddd;">
                <h3>🎨 신규 커스텀 리액션 등록</h3>
                <form id="reactionForm">
                    <div class="form-group"><label>리액션 이름</label><input type="text" id="name" placeholder="예: 폭탄 리액션" required></div>
                    <div class="form-group"><label>특정 후원 금액 (원)</label><input type="number" id="amount" placeholder="예: 9999" required></div>
                    <div class="form-group"><label>이미지 파일 선택 (PNG, JPG, GIF)</label><input type="file" id="imageFile" accept="image/*"></div>
                    <div class="form-group"><label>오디오 파일 선택 (MP3, WAV 등)</label><input type="file" id="audioFile" accept="audio/*"></div>
                    <button type="button" id="uploadBtn" class="btn btn-success">리액션 업로드 및 등록</button>
                </form>
                <hr style="margin: 25px 0; border:0; border-top:1px solid #ddd;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 30px;">
                    <h3 style="margin: 0;">📋 등록된 리액션 목록</h3>
                    <div>
                        <select id="sortSelect" onchange="renderReactions()" style="padding: 6px; border-radius: 4px; border: 1px solid #ddd;">
                            <option value="latest">최신순</option>
                            <option value="highPrice">높은가격순</option>
                            <option value="lowPrice">낮은가격순</option>
                        </select>
                    </div>
                </div>
                <div id="reactionList" class="reaction-grid"><div style="color:#666; grid-column: span 4;">불러오는 중...</div></div>
                <br><br>
                <a href="javascript:history.back();" class="btn btn-secondary" style="font-size:14px; padding:10px 15px;">대시보드로 돌아가기</a>
            </div>
            <div id="editModal" class="modal">
                <div class="modal-content">
                    <span class="close-btn" onclick="closeEditModal()">&times;</span>
                    <h3>✏️ 리액션 수정</h3>
                    <input type="hidden" id="edit-id">
                    <div class="form-group"><label>리액션 이름</label><input type="text" id="edit-name" required></div>
                    <div class="form-group"><label>후원 금액 (원)</label><input type="number" id="edit-amount" required></div>
                    <div class="form-group"><label>새 이미지 파일 변경 (선택)</label><input type="file" id="edit-imageFile" accept="image/*"></div>
                    <div class="form-group"><label>새 오디오 파일 변경 (선택)</label><input type="file" id="edit-audioFile" accept="audio/*"></div>
                    <button type="button" class="btn btn-warning" style="width:100%; padding:10px; font-size:14px;" onclick="submitEditReaction()">수정 사항 저장하기</button>
                </div>
            </div>
            <script>
                const currentApiKey = "` + apiKey + `";
                let allReactions = [];
                async function loadReactions() {
                    try {
                        const res = await fetch('/api/reactions/' + currentApiKey);
                        allReactions = await res.json();
                        renderReactions();
                    } catch (e) { console.error(e); }
                }
                function renderReactions() {
                    const container = document.getElementById('reactionList');
                    container.innerHTML = '';
                    if (!allReactions || allReactions.length === 0) {
                        container.innerHTML = '<div style="color:#666; grid-column: span 4; text-align:center;">등록된 리액션이 없습니다.</div>';
                        return;
                    }
                    const sortType = document.getElementById('sortSelect').value;
                    const sortedReactions = [...allReactions];
                    if (sortType === 'highPrice') sortedReactions.sort((a, b) => b.amount - a.amount);
                    else if (sortType === 'lowPrice') sortedReactions.sort((a, b) => a.amount - b.amount);
                    else if (sortType === 'latest') sortedReactions.sort((a, b) => b._id.localeCompare(a._id));

                    sortedReactions.forEach(r => {
                        const card = document.createElement('div');
                        card.className = 'reaction-card';
                        const imgSrc = r.imageUrl && r.imageUrl.startsWith('http') ? r.imageUrl : '/alerticon.gif';
                        const audioStatus = r.audioUrl ? '등록됨' : '없음';
                        card.innerHTML = \`<div style="width: 100%;">
                            <img src="\${imgSrc}" alt="리액션 사진" onerror="this.src='/alerticon.gif'">
                            <div class="reaction-info">
                                <b style="font-size:14px; display:block; margin-bottom:4px;">\${r.name || '기본 리액션'}</b>
                                <span style="color:#e67e22; font-weight:bold; display:block; margin-bottom:4px;">\${r.amount.toLocaleString()}원</span>
                                <span style="color:#888; font-size:11px; display:block;">음악파일: \${audioStatus}</span>
                            </div>
                        </div>
                        <button type="button" class="btn btn-warning" style="width:100%;" onclick="openEditModal('\${r._id}', '\${r.name || ''}', \${r.amount})">수정</button>\`;
                        container.appendChild(card);
                    });
                }
                document.getElementById('uploadBtn').addEventListener('click', async () => {
                    const name = document.getElementById('name').value;
                    const amount = document.getElementById('amount').value;
                    const imageInput = document.getElementById('imageFile').files[0];
                    const audioInput = document.getElementById('audioFile').files[0];
                    if (!name || !amount) { alert('리액션 이름과 금액을 입력해주세요.'); return; }
                    const formData = new FormData();
                    formData.append('name', name);
                    formData.append('amount', amount);
                    if (imageInput) formData.append('image', imageInput);
                    if (audioInput) formData.append('audio', audioInput);
                    document.getElementById('uploadBtn').innerText = '업로드 중...';
                    document.getElementById('uploadBtn').disabled = true;
                    try {
                        const res = await fetch('/api/reactions/' + currentApiKey, { method: 'POST', body: formData });
                        const result = await res.json();
                        if (result.success) { alert('리액션이 성공적으로 등록되었습니다!'); document.getElementById('reactionForm').reset(); loadReactions(); }
                        else { alert('등록 실패: ' + result.error); }
                    } catch (err) { console.error(err); alert('업로드 중 오류가 발생했습니다.'); }
                    finally { document.getElementById('uploadBtn').innerText = '리액션 업로드 및 등록'; document.getElementById('uploadBtn').disabled = false; }
                });
                function openEditModal(id, name, amount) {
                    document.getElementById('edit-id').value = id;
                    document.getElementById('edit-name').value = name;
                    document.getElementById('edit-amount').value = amount;
                    document.getElementById('edit-imageFile').value = '';
                    document.getElementById('edit-audioFile').value = '';
                    document.getElementById('editModal').style.display = 'flex';
                }
                function closeEditModal() { document.getElementById('editModal').style.display = 'none'; }
                async function submitEditReaction() {
                    const id = document.getElementById('edit-id').value;
                    const name = document.getElementById('edit-name').value;
                    const amount = document.getElementById('edit-amount').value;
                    const imageInput = document.getElementById('edit-imageFile').files[0];
                    const audioInput = document.getElementById('edit-audioFile').files[0];
                    if (!name || !amount) { alert('이름과 금액을 입력해주세요.'); return; }
                    const formData = new FormData();
                    formData.append('name', name);
                    formData.append('amount', amount);
                    if (imageInput) formData.append('image', imageInput);
                    if (audioInput) formData.append('audio', audioInput);
                    try {
                        const res = await fetch('/api/reactions/' + currentApiKey + '/' + id, { method: 'PUT', body: formData });
                        const result = await res.json();
                        if (result.success) { alert('리액션이 성공적으로 수정되었습니다!'); closeEditModal(); loadReactions(); }
                        else { alert('수정 실패: ' + result.error); }
                    } catch (err) { console.error(err); alert('수정 중 오류가 발생했습니다.'); }
                }
                loadReactions();
            </script>
        </body>
        </html>
    `);
});

// 방송용 실시간 랭킹 OBS 오버레이 화면[cite: 11]
app.get('/ranking-overlay/:apiKey', async (req, res) => {
    const { apiKey } = req.params;
    const user = await User.findOne({ apiKey });
    if (!user) return res.status(404).send('Streamer not found');
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>SelyPay Ranking Overlay</title>
            <style>
                body { background-color: transparent; margin: 0; font-family: 'Malgun Gothic', sans-serif; }
                .ranking-board { background: rgba(0, 0, 0, 0.75); color: white; padding: 20px; border-radius: 10px; width: fit-content; min-width: 250px; box-shadow: 0 4px 15px rgba(0,0,0,0.5); }
                h3 { margin: 0 0 15px 0; font-size: 18px; text-align: center; color: #f1c40f; }
                .rank-item { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.2); font-size: 15px; }
                .rank-item:last-child { border-bottom: none; }
                .name { font-weight: bold; }
                .amount { color: #ffffff; font-weight: bold; }
            </style>
        </head>
        <body>
            <div class="ranking-board">
                <h3>🏆 오늘의 후원 랭킹</h3>
                <div id="ranking-content">불러오는 중...</div>
            </div>
            <script>
                async function fetchOverlayRanking() {
                    try {
                        const response = await fetch('/api/ranking/' + '${apiKey}');
                        const ranking = await response.json();
                        const container = document.getElementById('ranking-content');
                        container.innerHTML = '';
                        if (!ranking || ranking.length === 0) {
                            container.innerHTML = '<div style="text-align:center; padding:10px; color:#aaa;">오늘 후원 내역이 없습니다.</div>';
                            return;
                        }
                        ranking.forEach((item, index) => {
                            const div = document.createElement('div');
                            div.className = 'rank-item';
                            div.innerHTML = '<span class="name">' + (index + 1) + '. ' + item._id + '</span><span class="amount">' + item.totalamount.toLocaleString() + '원</span>';
                            container.appendChild(div);
                        });
                    } catch (e) { console.error(e); }
                }
                fetchOverlayRanking();
                setInterval(fetchOverlayRanking, 5000);
            </script>
        </body>
        </html>
    `);
});

// 랭킹판 세부 관리 및 설정 페이지[cite: 11]
app.get('/manage/ranking/:apiKey', async (req, res) => {
    const { apiKey } = req.params;
    const user = await User.findOne({ apiKey });
    if (!user) return res.status(404).send('Streamer not found');
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>랭킹판 관리 - ` + user.username + `</title>
            <style>
                body { font-family: sans-serif; background: #f4f7f6; padding: 40px; margin: 0; }
                .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                .box { background: #eee; padding: 10px; font-family: monospace; word-break: break-all; border-radius: 5px; margin-top: 5px; }
                .btn { display: inline-block; margin-top: 15px; padding: 10px 15px; background: #3498db; color: white; text-decoration: none; border-radius: 5px; font-weight: bold; }
            </style>
        </head>
        <body>
            <div class="container">
                <h2>🏆 방송용 랭킹판 설정 및 관리</h2>
                <p>OBS 브라우저 소스에 아래 주소를 입력하여 사용하세요.</p>
                <p><b>랭킹 OBS 오버레이 주소:</b></p>
                <div class="box">https://` + req.get('host') + `/ranking-overlay/` + user.apiKey + `</div>
                <hr style="margin: 25px 0; border:0; border-top:1px solid #ddd;">
                <h3>⚙️ 세부 설정 (준비 중)</h3>
                <p style="color: #666; font-size: 14px;">여기에 랭킹 표시 명수 조절, 배경 투명도 등의 세부 설정을 추가할 예정입니다.</p>
                <a href="javascript:history.back();" class="btn" style="background:#7f8c8d;">대시보드로 돌아가기</a>
            </div>
        </body>
        </html>
    `);
});

// 기타 API 라우트들[cite: 11]
app.get('/api/logs/:apiKey', async (req, res) => {
    try {
        const user = await User.findOne({ apiKey: req.params.apiKey });
        if (!user) return res.status(404).json([]);
        const logs = await Donation.find({ streamerId: user._id }).sort({ timestamp: -1 }).limit(50);
        res.json(logs);
    } catch (e) {
        res.status(500).json([]);
    }
});

app.get('/api/ranking/:apiKey', async (req, res) => {
    try {
        const user = await User.findOne({ apiKey: req.params.apiKey });
        if (!user) return res.status(404).json([]);
        const todayKey = getKSTDateKey();
        const todayDonations = await Donation.find(
            { streamerId: user._id, dateKey: todayKey },
            { nickname: 1, amount: 1, timestamp: 1 }
        ).sort({ timestamp: 1 });

        const rankingMap = {};
        todayDonations.forEach(d => {
            if (d.nickname === '테스트후원알림') return;
            let cleanName = d.nickname.trim();
            if (cleanName.endsWith("님")) cleanName = cleanName.slice(0, -1).trim();
            if (!rankingMap[cleanName]) {
                rankingMap[cleanName] = { totalamount: 0, count: 0, firstDonationTime: d.timestamp };
            }
            rankingMap[cleanName].totalamount += d.amount;
            rankingMap[cleanName].count += 1;
        });

        const rankingList = Object.keys(rankingMap).map(name => ({
            _id: name,
            totalamount: rankingMap[name].totalamount,
            count: rankingMap[name].count,
            firstDonationTime: rankingMap[name].firstDonationTime
        }));

        rankingList.sort((a, b) => {
            if (b.totalamount !== a.totalamount) return b.totalamount - a.totalamount;
            return new Date(a.firstDonationTime) - new Date(b.firstDonationTime);
        });

        res.json(rankingList.slice(0, 5));
    } catch (e) {
        console.error(e);
        res.status(500).json([]);
    }
});

app.get('/api/reactions/:apiKey', async (req, res) => {
    try {
        const user = await User.findOne({ apiKey: req.params.apiKey });
        if (!user) return res.status(404).json([]);
        const reactions = await Reaction.find({ streamerId: user._id }).sort({ amount: 1 });
        res.json(reactions);
    } catch (e) {
        res.status(500).json([]);
    }
});

app.post('/api/reactions/:apiKey', upload.fields([{ name: 'image' }, { name: 'audio' }]), async (req, res) => {
    try {
        const user = await User.findOne({ apiKey: req.params.apiKey });
        if (!user) return res.status(404).json({ success: false, error: 'Streamer not found' });
        const { name, amount } = req.body;
        let imageUrl = "";
        let audioUrl = "";

        const SUPABASE_URL = process.env.SUPABASE_URL || 'https://당신의프로젝트주소.supabase.co';
        const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '당신의Publishable키';
        const STORAGE_BUCKET = process.env.STORAGE_BUCKET || 'reactions';
        const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

        if (req.files && req.files['image']) {
            const file = req.files['image'][0];
            const fileExt = file.originalname.split('.').pop();
            const imgName = 'img_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7) + '.' + fileExt;
            const { error: imgError } = await supabaseClient.storage.from(STORAGE_BUCKET).upload(imgName, file.buffer, { contentType: file.mimetype, upsert: false });
            if (imgError) throw imgError;
            const { data: imgPublic } = supabaseClient.storage.from(STORAGE_BUCKET).getPublicUrl(imgName);
            imageUrl = imgPublic.publicUrl;
        }

        if (req.files && req.files['audio']) {
            const file = req.files['audio'][0];
            const fileExt = file.originalname.split('.').pop();
            const audioName = 'audio_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7) + '.' + fileExt;
            const { error: audioError } = await supabaseClient.storage.from(STORAGE_BUCKET).upload(audioName, file.buffer, { contentType: file.mimetype, upsert: false });
            if (audioError) throw audioError;
            const { data: audioPublic } = supabaseClient.storage.from(STORAGE_BUCKET).getPublicUrl(audioName);
            audioUrl = audioPublic.publicUrl;
        }

        const newReaction = new Reaction({ streamerId: user._id, name: name || "기본 리액션", amount: Number(amount), imageUrl, audioUrl });
        await newReaction.save();
        res.json({ success: true, message: '리액션이 성공적으로 등록되었습니다!' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ success: false, error: e.message || 'Server Error' });
    }
});

app.put('/api/reactions/:apiKey/:reactionId', upload.fields([{ name: 'image' }, { name: 'audio' }]), async (req, res) => {
    try {
        const user = await User.findOne({ apiKey: req.params.apiKey });
        if (!user) return res.status(404).json({ success: false, error: 'Streamer not found' });
        const reaction = await Reaction.findOne({ _id: req.params.reactionId, streamerId: user._id });
        if (!reaction) return res.status(404).json({ success: false, error: 'Reaction not found' });

        const { name, amount } = req.body;
        if (name) reaction.name = name;
        if (amount) reaction.amount = Number(amount);

        const SUPABASE_URL = process.env.SUPABASE_URL || 'https://당신의프로젝트주소.supabase.co';
        const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '당신의Publishable키';
        const STORAGE_BUCKET = process.env.STORAGE_BUCKET || 'reactions';
        const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

        if (req.files && req.files['image']) {
            const file = req.files['image'][0];
            const fileExt = file.originalname.split('.').pop();
            const imgName = 'img_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7) + '.' + fileExt;
            const { error: imgError } = await supabaseClient.storage.from(STORAGE_BUCKET).upload(imgName, file.buffer, { contentType: file.mimetype, upsert: false });
            if (imgError) throw imgError;
            const { data: imgPublic } = supabaseClient.storage.from(STORAGE_BUCKET).getPublicUrl(imgName);
            reaction.imageUrl = imgPublic.publicUrl;
        }

        if (req.files && req.files['audio']) {
            const file = req.files['audio'][0];
            const fileExt = file.originalname.split('.').pop();
            const audioName = 'audio_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7) + '.' + fileExt;
            const { error: audioError } = await supabaseClient.storage.from(STORAGE_BUCKET).upload(audioName, file.buffer, { contentType: file.mimetype, upsert: false });
            if (audioError) throw audioError;
            const { data: audioPublic } = supabaseClient.storage.from(STORAGE_BUCKET).getPublicUrl(audioName);
            reaction.audioUrl = audioPublic.publicUrl;
        }

        await reaction.save();
        res.json({ success: true, message: '리액션이 성공적으로 수정되었습니다!' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ success: false, error: e.message || 'Server Error' });
    }
});

const manualPlayStore = {};
app.post('/api/play/:apiKey/:donationId', async (req, res) => {
    try {
        const user = await User.findOne({ apiKey: req.params.apiKey });
        if (!user) return res.status(404).json({ success: false, error: 'Streamer not found' });
        const donation = await Donation.findOne({ _id: req.params.donationId, streamerId: user._id });
        if (!donation) return res.status(404).json({ success: false, error: 'Donation not found' });

        if (!manualPlayStore[user.apiKey]) manualPlayStore[user.apiKey] = [];
        manualPlayStore[user.apiKey].push(donation.toObject());
        res.json({ success: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
});

app.get('/api/manual-play/:apiKey', async (req, res) => {
    const apiKey = req.params.apiKey;
    if (manualPlayStore[apiKey] && manualPlayStore[apiKey].length > 0) {
        const items = [...manualPlayStore[apiKey]];
        manualPlayStore[apiKey] = [];
        res.json(items);
    } else {
        res.json([]);
    }
});

// 서버 구동
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
