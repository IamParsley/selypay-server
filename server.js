const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const crypto = require('crypto');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname));

const upload = multer({ storage: multer.memoryStorage() });

mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('✅ MongoDB Atlas 연결 성공!'))
    .catch((err) => console.error('❌ MongoDB 연결 에러', err));

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    apiKey: { type: String, required: true, unique: true },
    createdAt: { type: Date, default: Date.now },
    alertSettings: {
        soundType: { type: String, default: 'coinsound.mp3' },
        duration: { type: Number, default: 5 },
        fontSize: { type: String, default: '32px' },
        bgColor: { type: String, default: 'transparent' },
        useImage: { type: Boolean, default: true }
    }
});

const donationSchema = new mongoose.Schema({
    streamerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    nickname: { type: String, default: '익명' },
    amount: { type: Number, default: 0 },
    message: { type: String, default: '' },
    datetime: { type: String, required: true },
    dateKey: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Donation = mongoose.model('Donation', donationSchema);

const reactionSchema = new mongoose.Schema({
    streamerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, default: 0 },
    imageUrl: { type: String, default: '' },
    audioUrl: { type: String, default: '' }
});
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
    res.send('<div style="font-family:sans-serif; text-align:center; margin-top:50px;"><h1>SelyPay 멀티 테넌트 서버 실행 중 🚀</h1><p><a href="/register">스트리머 회원가입</a> | <a href="/login">로그인</a></p></div>');
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
        res.send(`<script>alert('회원가입 성공! 발급된 API Key를 안전하게 보관하세요.'); location.href = '/login';</script>`);
    } catch (e) {
        res.send(`<script>alert('회원가입 실패 (중복된 아이디일 수 있습니다)'); history.back();</script>`);
    }
});

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

        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>${user.username} 대시보드</title>
                <style>
                    body { font-family: sans-serif; background: #f4f7f6; padding: 40px; margin: 0; }
                    .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                    .box { background: #eee; padding: 10px; font-family: monospace; word-break: break-all; border-radius: 5px; margin-top: 5px; }
                    .log-box { background: #fafafa; border: 1px solid #ddd; padding: 15px; border-radius: 5px; max-height: 250px; overflow-y: auto; margin-top: 10px; }
                    .log-item { padding: 8px 0; border-bottom: 1px solid #eee; font-size: 14px; }
                    .log-item:last-child { border-bottom: none; }
                    .btn-group { display: flex; gap: 10px; margin-top: 8px; }
                    .btn { flex: 1; padding: 8px 12px; background: #3498db; color: white; text-align: center; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 13px; }
                    .btn:hover { background: #2980b9; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h2>환영합니다, ${user.username}님! 🎉</h2>
                    
                    <p><b>고유 API Key (안드로이드 앱에 입력)</b></p>
                    <div class="box">${user.apiKey}</div>
                    
                    <p style="margin-top:20px;"><b>내 알림창 오버레이 주소</b></p>
                    <div class="box">https://${req.get('host')}/overlay/${user.apiKey}</div>
                    <div class="btn-group">
                        <a href="/manage/alert/${user.apiKey}" class="btn" target="_blank">⚙ 알림창 세부 설정/관리 사이트 가기</a>
                    </div>

                    <p style="margin-top:20px;"><b>내 방송용 랭킹판 오버레이 주소</b></p>
                    <div class="box">https://${req.get('host')}/ranking-overlay/${user.apiKey}</div>
                    <div class="btn-group">
                        <a href="/manageranking/${user.apiKey}" class="btn" target="_blank" style="background:#e67e22;">⚙️ 랭킹판 세부 설정/관리 사이트 가기</a>
                    </div>

                    <p style="margin-top:30px;"><b>🏆 계좌후원 랭킹 (KST 자정 기준)</b></p>
                    <div class="log-box" id="rankingList">
                        <div class="log-item">랭킹을 불러오는 중...</div>
                    </div>
                    
                    <p style="margin-top:30px;"><b>📋 최근 후원 내역 (최대 20개)</b></p>
                    <div class="log-box" id="donationLogList">
                        <div class="log-item">후원 내역을 불러오는 중...</div>
                    </div>

                    <p style="margin-top:30px; text-align:right;"><a href="/login">로그아웃</a></p>
                </div>

                <script>
                    async function fetchDonationLogs() {
                        try {
                            const response = await fetch('/api/logs/${user.apiKey}');
                            const logs = await response.json();
                            const logContainer = document.getElementById('donationLogList');
                            logContainer.innerHTML = '';
                            if (!logs || logs.length === 0) {
                                logContainer.innerHTML = '<div class="log-item">아직 후원 내역이 없습니다.</div>';
                                return;
                            }
                            logs.slice(0, 20).forEach(log => {
                                const div = document.createElement('div');
                                div.className = 'log-item';
                                div.innerHTML = '<b>[' + log.datetime + ']</b> ' + log.nickname + '님 (' + log.amount.toLocaleString() + '원) ' + log.message;
                                logContainer.appendChild(div);
                            });
                        } catch (e) { console.error(e); }
                    }

                    async function fetchRanking() {
                        try {
                            const response = await fetch('/api/ranking/${user.apiKey}');
                            const ranking = await response.json();
                            const rankContainer = document.getElementById('rankingList');
                            rankContainer.innerHTML = '';
                            if (!ranking || ranking.length === 0) {
                                rankContainer.innerHTML = '<div class="log-item">오늘 아직 후원 내역이 없습니다.</div>';
                                return;
                            }
                            ranking.forEach((item, index) => {
                                const div = document.createElement('div');
                                div.className = 'log-item';
                                div.innerHTML = '<b>' + (index + 1) + '위</b> ' + item._id + '님 - ' + item.totalAmount.toLocaleString() + '원 (' + item.count + '회)';
                                rankContainer.appendChild(div);
                            });
                        } catch (e) { console.error(e); }
                    }

                    fetchDonationLogs();
                    fetchRanking();
                    setInterval(fetchDonationLogs, 3000);
                    setInterval(fetchRanking, 5000);
                </script>
            </body>
            </html>
        `);
    } catch (e) {
        res.status(500).send('Server Error');
    }
});

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

        let nickname = '익명';
        if (message.includes('님')) {
            nickname = message.split('님')[0].trim();
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
        console.log(`[${user.username}] 후원 수신 성공`, donationData);
        res.status(200).json({ success: true, data: donationData });
    } catch (e) {
        console.error(e);
        res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
});

// 7. 스트리머별 OBS 알림 오버레이 화면
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
                    width: 100%;
                    height: 100%;
                    margin: 0;
                    padding: 0;
                    background-color: transparent !important;
                    font-family: 'Pretendard', 'Malgun Gothic', '맑은 고딕', sans-serif;
                    overflow: hidden;
                }
                #alert-container {
                    width: fit-content; 
                    max-width: 85vw;
                    height: auto; 
                    display: none;
                    flex-direction: column; 
                    justify-content: center; 
                    align-items: center;
                    text-align: center; 
                    box-sizing: border-box; 
                    padding: 10px 20px;
                    background: transparent !important;
                    margin: 0 auto;
                    animation: fadeInScale 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
                }
                @keyframes fadeInScale {
                    0% { opacity: 0; transform: scale(0.8) translateY(20px); }
                    100% { opacity: 1; transform: scale(1) translateY(0); }
                }
                #alert-image { 
                    max-height: 35vh; 
                    width: auto; 
                    max-width: 60vw;
                    object-fit: contain; 
                    display: ${useImage ? 'block' : 'none'}; 
                    margin-bottom: 1.5vh;
                    filter: drop-shadow(0 4px 10px rgba(0, 0, 0, 0.8));
                }
                #alert-line1 {
                    color: #ffffff; 
                    font-size: ${settings.fontSize || '32px'}; 
                    font-weight: 800; 
                    text-shadow: -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000;
                    width: auto; 
                    max-width: 80vw; 
                    word-break: keep-all; 
                    overflow-wrap: break-word;
                    line-height: 1.3; 
                    margin-bottom: 8px;
                }
                #alert-line2 {
                    color: #b5e48c; 
                    font-size: calc(${settings.fontSize || '32px'} * 0.9); 
                    font-weight: 800; 
                    text-shadow: -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000;
                    width: auto; 
                    max-width: 80vw; 
                    word-break: keep-all; 
                    overflow-wrap: break-word;
                    line-height: 1.3;
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
                const defaultSound = '${settings.soundType || 'coinsound.mp3'}';
                const defaultImage = '/alerticon.gif';
                const useImageSetting = ${useImage};

                let lastCheckedTime = '';
                
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
                    
                    const nickname = donation.nickname || '익명';
                    const amount = donation.amount || 0;
                    const message = donation.message || '';
                            
                    line1.innerText = nickname + '님 ' + amount.toLocaleString() + '원 후원감사합니다';
                    line2.innerText = message;

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
                    sound.play().catch(e => console.log('사운드 재생 실패', e));

                    let hideTimeout = 5000;
                    sound.onloadedmetadata = function() {
                        if (sound.duration && !isNaN(sound.duration)) {
                            hideTimeout = sound.duration * 1000;
                        }
                        clearTimeout(window.alertTimer);
                        window.alertTimer = setTimeout(() => { 
                            container.style.display = 'none'; 
                        }, hideTimeout);
                    };

                    window.alertTimer = setTimeout(() => { 
                        container.style.display = 'none'; 
                    }, hideTimeout);
                }
                
                setInterval(checkNewDonation, 1000);
            </script>
        </body>
        </html>
    `);
});

// 7-1. 알림창 전용 세부 관리 및 설정 페이지 (미리보기 및 테스트 시뮬레이터 포함)
app.get('/manage/alert/:apiKey', async (req, res) => {
    const { apiKey } = req.params;
    const user = await User.findOne({ apiKey });
    if (!user) return res.status(404).send('Streamer not found');

    const settings = user.alertSettings || {};

    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>알림창 관리 - ${user.username}</title>
            <style>
                body { font-family: sans-serif; background: #f4f7f6; padding: 40px; margin: 0; }
                .container { max-width: 650px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                .box { background: #eee; padding: 10px; font-family: monospace; word-break: break-all; border-radius: 5px; margin-top: 5px; }
                .btn { display: inline-block; margin-top: 15px; padding: 10px 15px; background: #3498db; color: white; text-decoration: none; border-radius: 5px; font-weight: bold; border: none; cursor: pointer; }
                .btn:hover { background: #2980b9; }
                
                .preview-section { background: #111; border-radius: 8px; padding: 25px; text-align: center; margin-bottom: 25px; position: relative; overflow: hidden; display: flex; flex-direction: column; justify-content: center; align-items: center; min-height: 180px; }
                .preview-title { color: #aaa; font-size: 12px; position: absolute; top: 10px; left: 15px; }
                #preview-image { max-height: 80px; width: auto; object-fit: contain; margin-bottom: 10px; filter: drop-shadow(0 4px 10px rgba(0, 0, 0, 0.8)); }
                
                #preview-line1 { 
                    color: #ffffff; 
                    font-weight: 800; 
                    text-shadow: -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000; 
                    line-height: 1.3; 
                    margin-bottom: 8px; 
                    word-break: keep-all; 
                    overflow-wrap: break-word;
                }
                #preview-line2 { 
                    color: #b5e48c; 
                    font-weight: 800; 
                    text-shadow: -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000; 
                    line-height: 1.3; 
                    word-break: keep-all; 
                    overflow-wrap: break-word;
                }
                .form-group { margin-bottom: 15px; }
                .form-group label { display: block; font-weight: bold; margin-bottom: 5px; font-size: 14px; }
                .form-group input[type="text"], .form-group input[type="number"] { width: 100%; padding: 8px; box-sizing: border-box; border: 1px solid #ccc; border-radius: 4px; }
            </style>
        </head>
        <body>
            <div class="container">
                <h2>🎨 알림창 설정 및 관리</h2>
                
                <p><b>OBS 브라우저 소스 오버레이 주소</b></p>
                <div class="box">https://${req.get('host')}/overlay/${user.apiKey}</div>

                <hr style="margin: 25px 0; border:0; border-top:1px solid #ddd;">

                <!-- 💡 실시간 미리보기 화면 -->
                <h3 style="margin-top: 0;">👀 알림창 실시간 미리보기</h3>
                <div class="preview-section">
                    <div class="preview-title">PREVIEW</div>
                    <img id="preview-image" src="/alerticon.gif" alt="Preview Image">
                    <div id="preview-line1">테스트후원알림님 1,000원 후원감사합니다</div>
                    <div id="preview-line2">후원 감사합니다!</div>
                </div>

                <!-- 💡 테스트 후원 직접 입력 및 시뮬레이터 -->
                <div style="background: #fff3cd; border: 1px solid #ffeeba; padding: 15px; border-radius: 8px; margin-bottom: 25px;">
                    <h4 style="margin-top: 0; color: #856404; margin-bottom: 10px;">🧪 테스트 후원 직접 입력</h4>
                    <div style="display: flex; gap: 10px; margin-bottom: 10px;">
                        <div style="flex: 1;">
                            <label style="font-size: 12px;">닉네임</label>
                            <input type="text" id="testNickname" value="테스트후원알림">
                        </div>
                        <div style="flex: 1;">
                            <label style="font-size: 12px;">금액 (원)</label>
                            <input type="number" id="testAmount" value="1000">
                        </div>
                    </div>
                    <div style="margin-bottom: 10px;">
                        <label style="font-size: 12px;">후원 메시지</label>
                        <input type="text" id="testMessage" value="후원 감사합니다!">
                    </div>
                    <button type="button" id="sendTestBtn" class="btn" style="background: #e67e22; width: 100%; margin-top: 5px;">🚀 테스트 후원 보내기 (사운드 재생)</button>
                </div>

                <!-- ⚙️ 기본 알림창 세부 설정 폼 -->
                <h3>⚙️ 기본 알림창 세부 설정</h3>
                <form id="alertSettingsForm">
                    <div class="form-group">
                        <label>알림 지속 시간 (초)</label>
                        <input type="number" name="duration" id="duration" min="1" max="15" value="${settings.duration || 5}">
                    </div>
                    <div class="form-group">
                        <label>메시지 폰트 크기 (CSS 단위, 예: 32px 또는 5vh)</label>
                        <input type="text" name="fontSize" id="fontSize" value="${settings.fontSize || '32px'}">
                    </div>
                    <div class="form-group">
                        <label>
                            <input type="checkbox" name="useImage" id="useImage" ${settings.useImage !== false ? 'checked' : ''} style="width:auto;"> 기본 알림 이미지 사용 여부
                        </label>
                    </div>
                    <button type="submit" class="btn">기본 설정 저장하기</button>
                </form>

                <div style="margin-top: 20px;">
                    <a href="/login" class="btn" style="background: #7f8c8d;">대시보드로 돌아가기</a>
                </div>
            </div>

            <script>
                function updatePreview() {
                    const fontSizeInput = document.getElementById('fontSize').value;
                    const useImageCheckbox = document.getElementById('useImage').checked;

                    const line1 = document.getElementById('preview-line1');
                    const line2 = document.getElementById('preview-line2');
                    const img = document.getElementById('preview-image');

                    const nickname = document.getElementById('testNickname').value || '익명';
                    const amount = Number(document.getElementById('testAmount').value || 0).toLocaleString();
                    const message = document.getElementById('testMessage').value;

                    line1.innerText = nickname + '님 ' + amount + '원 후원감사합니다';
                    line2.innerText = message;

                    line1.style.fontSize = fontSizeInput;
                    line2.style.fontSize = 'calc(' + fontSizeInput + ' * 0.9)';
                    img.style.display = useImageCheckbox ? 'block' : 'none';
                }

                document.getElementById('fontSize').addEventListener('input', updatePreview);
                document.getElementById('useImage').addEventListener('change', updatePreview);
                document.getElementById('testNickname').addEventListener('input', updatePreview);
                document.getElementById('testAmount').addEventListener('input', updatePreview);
                document.getElementById('testMessage').addEventListener('input', updatePreview);
                
                updatePreview();

                document.getElementById('sendTestBtn').addEventListener('click', () => {
                    const previewSection = document.querySelector('.preview-section');
                    previewSection.style.transform = 'scale(1.02)';
                    setTimeout(() => { previewSection.style.transform = 'scale(1)'; }, 150);

                    try {
                        const testSound = new Audio('/coinsound.mp3');
                        testSound.currentTime = 0;
                        testSound.play().catch(e => console.log('사운드 재생 제한', e));
                    } catch (e) {
                        console.error(e);
                    }
                });

                document.getElementById('alertSettingsForm').addEventListener('submit', async (e) => {
                    e.preventDefault();
                    const duration = document.getElementById('duration').value;
                    const fontSize = document.getElementById('fontSize').value;
                    const useImage = document.getElementById('useImage').checked;

                    try {
                        const response = await fetch('/api/settings/alert/${user.apiKey}', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ duration, fontSize, useImage })
                        });
                        const result = await response.json();
                        if (result.success) {
                            alert('설정이 성공적으로 저장되었습니다!');
                        } else {
                            alert('설정 저장 실패: ' + (result.error || '알 수 없는 오류'));
                        }
                    } catch (err) {
                        console.error(err);
                        alert('서버 통신 중 오류가 발생했습니다.');
                    }
                });
            </script>
        </body>
        </html>
    `);
});

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
                            div.innerHTML = '<span class="name">' + (index + 1) + '. ' + item._id + '</span><span class="amount">' + item.totalAmount.toLocaleString() + '원</span>';
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

app.get('/manageranking/:apiKey', async (req, res) => {
    const { apiKey } = req.params;
    const user = await User.findOne({ apiKey });
    if (!user) return res.status(404).send('Streamer not found');

    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>랭킹판 관리 - ${user.username}</title>
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
                
                <p><b>랭킹 OBS 오버레이 주소</b></p>
                <div class="box">https://${req.get('host')}/ranking-overlay/${user.apiKey}</div>

                <hr style="margin: 25px 0; border:0; border-top:1px solid #ddd;">
                
                <h3>⚙️ 세부 설정 (준비 중)</h3>
                <p style="color: #666; font-size: 14px;">여기에 랭킹 표시 명수 조절, 배경 투명도, 글자 색상 테마 변경 등의 세부 설정을 추가할 예정입니다.</p>

                <a href="javascript:history.back();" class="btn" style="background:#7f8c8d;">대시보드로 돌아가기</a>
            </div>
        </body>
        </html>
    `);
});

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
        const ranking = await Donation.aggregate([
            { $match: { streamerId: user._id, dateKey: todayKey } },
            { $group: { _id: '$nickname', totalAmount: {$sum: '$amount' }, count: {$sum: 1 } } },
            { $sort: { totalAmount: -1 } },             {$limit: 10 }
        ]);
        res.json(ranking);
    } catch (e) {
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

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
