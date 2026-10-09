const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// 미들웨어 설정
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname));

// 1. MongoDB 연결
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(() => console.log('✅ MongoDB Atlas 연결 성공!'))
.catch((err) => console.error('❌ MongoDB 연결 에러:', err));

// 2. Mongoose 스키마 정의
// 스트리머 계정, 후원 내역, 알림 설정 포함
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    apiKey: { type: String, required: true, unique: true },
    createdAt: { type: Date, default: Date.now },
    alertSettings: {
        soundType: { type: String, default: 'coinsound.mp3' },
        duration: { type: Number, default: 5 },
        fontSize: { type: String, default: '7.5vh' },
        bgColor: { type: String, default: 'transparent' },
        useImage: { type: Boolean, default: true } // 알림 이미지 사용 여부 추가
    }
});

// 기본알림 설정 스키마

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

// 리액션 설정 스키마 및 모델 (금액과 미디어 파일만 관리)
const reactionSchema = new mongoose.Schema({
    streamerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, default: 0 }, // 특정 금액
    imageUrl: { type: String, default: "" },   // Supabase 이미지 URL
    audioUrl: { type: String, default: "" }    // Supabase 오디오 URL
});
const Reaction = mongoose.model('Reaction', reactionSchema);

// 리액션 설정 저장 API
app.post('/api/reactions/:apiKey', async (req, res) => {
    try {
        const user = await User.findOne({ apiKey: req.params.apiKey });
        if (!user) return res.status(404).json({ success: false, error: 'Streamer not found' });

        const { minamount, imageUrl, audioUrl } = req.body;

        const newReaction = new Reaction({
            streamerId: user._id,
            minamount,
            imageUrl,
            audioUrl
        });

        await newReaction.save();
        res.json({ success: true, message: '리액션이 성공적으로 저장되었습니다.' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
});

// 리액션 목록 조회 API
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

// 한국 시간 구하는 헬퍼 함수
function getKSTDateTime() {
    return new Date().toLocaleString('ko-KR', { 
        timeZone: 'Asia/Seoul', 
        month: '2-digit', 
        day: '2-digit', 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit' 
    });
}

function getKSTDateKey() {
    const now = new Date();
    const kstDate = new Date(now.getTime() + (9 * 60 * 60 * 1000));
    return kstDate.toISOString().split('T')[0];
}

// 🔔 알림 설정 불러오기 API
app.get('/api/settings/alert/:apiKey', async (req, res) => {
    try {
        const user = await User.findOne({ apiKey: req.params.apiKey });
        if (!user) return res.status(404).json({ success: false, error: 'Streamer not found' });
        res.json({ success: true, settings: user.alertSettings || {} });
    } catch (e) {
        res.status(500).json({ success: false, error: 'Server Error' });
    }
});

// 🔔 알림 설정 저장하기 API
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
    res.send(`
        <div style="font-family:sans-serif; text-align:center; margin-top:50px;">
            <h1>SelyPay 멀티 테넌트 서버 실행 중 🚀</h1>
            <p><a href="/register">스트리머 회원가입</a> | <a href="/login">로그인</a></p>
        </div>
    `);
});

// 4. 회원가입 페이지
app.get('/register', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8"><title>스트리머 회원가입</title></head>
        <body style="font-family:sans-serif; background:#f4f7f6; display:flex; justify-content:center; align-items:center; height:100vh; margin:0;">
            <div style="background:white; padding:30px; border-radius:10px; box-shadow:0 2px 10px rgba(0,0,0,0.1); width:300px;">
                <h2>스트리머 회원가입</h2>
                <form action="/api/register" method="POST">
                    <div style="margin-bottom:15px;">
                        <label>아이디</label><br>
                        <input type="text" name="username" style="width:100%; padding:8px; margin-top:5px;" required>
                    </div>
                    <div style="margin-bottom:15px;">
                        <label>비밀번호</label><br>
                        <input type="password" name="password" style="width:100%; padding:8px; margin-top:5px;" required>
                    </div>
                    <button type="submit" style="width:100%; padding:10px; background:#ff4757; color:white; border:none; border-radius:5px; font-weight:bold; cursor:pointer;">가입하기</button>
                </form>
                <p style="text-align:center; margin-top:15px;"><a href="/login">이미 계정이 있으신가요? 로그인</a></p>
            </div>
        </body>
        </html>
    `);
});

app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        const apiKey = 'sely_' + crypto.randomBytes(16).toString('hex');

        const newUser = new User({ username, password, apiKey });
        await newUser.save();

        res.send(`
            <script>
                alert('회원가입 성공! 발급된 API Key를 안전하게 보관하세요.');
                location.href = '/login';
            </script>
        `);
    } catch (e) {
        res.send(`<script>alert('회원가입 실패 (중복된 아이디일 수 있습니다)'); history.back();</script>`);
    }
});

// 5. 로그인 페이지
app.get('/login', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8"><title>스트리머 로그인</title></head>
        <body style="font-family:sans-serif; background:#f4f7f6; display:flex; justify-content:center; align-items:center; height:100vh; margin:0;">
            <div style="background:white; padding:30px; border-radius:10px; box-shadow:0 2px 10px rgba(0,0,0,0.1); width:300px;">
                <h2>스트리머 로그인</h2>
                <form action="/api/login" method="POST">
                    <div style="margin-bottom:15px;">
                        <label>아이디</label><br>
                        <input type="text" name="username" style="width:100%; padding:8px; margin-top:5px;" required>
                    </div>
                    <div style="margin-bottom:15px;">
                        <label>비밀번호</label><br>
                        <input type="password" name="password" style="width:100%; padding:8px; margin-top:5px;" required>
                    </div>
                    <button type="submit" style="width:100%; padding:10px; background:#2ed573; color:white; border:none; border-radius:5px; font-weight:bold; cursor:pointer;">로그인</button>
                </form>
                <p style="text-align:center; margin-top:15px;"><a href="/register" style="color:#ff4757; text-decoration:none;">계정이 없으신가요? 회원가입</a></p>
            </div>
        </body>
        </html>
    `);
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
                <title>` + user.username + ` 대시보드</title>
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
                    <h2>환영합니다, ` + user.username + `님! 🎉</h2>
                    
                    <p><b>고유 API Key (안드로이드 앱에 입력):</b></p>
                    <div class="box">` + user.apiKey + `</div>
                    
                    <p style="margin-top:20px;"><b>내 알림창 오버레이 주소:</b></p>
                    <div class="box">https://` + req.get('host') + `/overlay/` + user.apiKey + `</div>
                    <div class="btn-group">
                        <a href="/manage/alert/` + user.apiKey + `" class="btn" target="_blank">⚙ 알림창 세부 설정/관리 사이트 가기</a>
                    </div>

                    <p style="margin-top:20px;"><b>내 방송용 랭킹판 오버레이 주소:</b></p>
                    <div class="box">https://` + req.get('host') + `/ranking-overlay/` + user.apiKey + `</div>
                    <div class="btn-group">
                        <a href="/manage/ranking/` + user.apiKey + `" class="btn" target="_blank" style="background:#e67e22;">⚙️ 랭킹판 세부 설정/관리 사이트 가기</a>
                    </div>

                    <p style="margin-top:30px;"><b> 🏆 계좌후원 랭킹 (KST 자정 기준)</b></p>
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
                            const response = await fetch('/api/logs/` + user.apiKey + `');
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
                                div.innerHTML = '<b>[' + log.datetime + ']</b> ' + log.nickname + '님 (' + log.amount.toLocaleString() + '원): ' + log.message;
                                logContainer.appendChild(div);
                            });
                        } catch (e) { console.error(e); }
                    }

                    async function fetchRanking() {
                        try {
                            const response = await fetch('/api/ranking/` + user.apiKey + `');
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
                                div.innerHTML = '<b>' + (index + 1) + '위</b> ' + item._id + '님 - ' + item.totalamount.toLocaleString() + '원 (' + item.count + '회)';
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

// 7. 스트리머별 OBS 알림 오버레이 화면
app.get('/overlay/:apiKey', async (req, res) => {
    const { apiKey } = req.params;
    const user = await User.findOne({ apiKey });
    if (!user) return res.status(404).send('Streamer not found');

    const settings = user.alertSettings || {};
    const useImage = settings.useImage !== false; // 기본값 true

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
                    width: 100vw; height: 100vh; display: none;
                    flex-direction: column; justify-content: center; align-items: center;
                    text-align: center; box-sizing: border-box; padding: 2vh 3vw;
                    background: transparent !important;
                }
                #alert-image { 
                    max-height: 35vh; width: auto; max-width: 80%;
                    object-fit: contain; display: ${useImage ? 'block' : 'none'}; margin-bottom: 1.5vh;
                }
                #alert-line1 {
                    color: #ffffff; font-size: ${settings.fontSize || '7.5vh'}; font-weight: 800; 
                    text-shadow: -3px -3px 0 #000, 3px -3px 0 #000, -3px 3px 0 #000, 3px 3px 0 #000, 4px 4px 8px rgba(0, 0, 0, 0.9);
                    width: 90vw; word-break: keep-all; overflow-wrap: break-word; line-height: 1.2; margin-bottom: 1vh;
                }
                #alert-line2 {
                    color: #ffffff; font-size: 6.5vh; font-weight: 800; 
                    text-shadow: -3px -3px 0 #000, 3px -3px 0 #000, -3px 3px 0 #000, 3px 3px 0 #000, 4px 4px 8px rgba(0, 0, 0, 0.9);
                    width: 90vw; word-break: break-word; line-height: 1.2;
                }
            </style>
        </head>
        <body>
            <div id="alert-container">
                <img id="alert-image" src="/alerticon.gif" alt="Alert GIF">
                <div id="alert-line1"></div>
                <div id="alert-line2"></div>
            </div>

            <audio id="alert-sound" src="/${settings.soundType || 'coinsound.mp3'}"></audio>

            <script>
                let lastCheckedTime = "";
                
                async function checkNewDonation() {
                    try {
                        const response = await fetch('/api/logs/' + '${apiKey}');
                        const logs = await response.json();
                        if (logs.length > 0) {
                            const latest = logs[0];
                            if (latest.datetime !== lastCheckedTime) {
                                lastCheckedTime = latest.datetime;
                                showAlert(latest.message);
                            }
                        }
                    } catch (e) { console.error(e); }
                }

                function showAlert(message) {
                    const container = document.getElementById('alert-container');
                    const line1 = document.getElementById('alert-line1');
                    const line2 = document.getElementById('alert-line2');
                    const sound = document.getElementById('alert-sound');
                            
                    let firstText = message;
                    let secondText = "";
                    
                    const newlineIdx = message.indexOf('\\\\n');
                    if (newlineIdx !== -1) {
                        firstText = message.substring(0, newlineIdx);
                        secondText = message.substring(newlineIdx + 2);
                    }

                    line1.innerText = firstText;
                    line2.innerText = secondText;

                    container.style.display = 'flex';
                    sound.currentTime = 0;
                    sound.play().catch(e => console.log("사운드 재생 실패:", e));

                    setTimeout(() => { 
                        container.style.display = 'none'; 
                    }, ${ (settings.duration || 5) * 1000 });
                }

                setInterval(checkNewDonation, 1000);
            </script>
        </body>
        </html>
    `);
});

// 7-1. 알림창 전용 세부 관리 및 설정 페이지 (파일 업로드 기능 포함)
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
            <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
            <style>
                body { font-family: sans-serif; background: #f4f7f6; padding: 40px; margin: 0; }
                .container { max-width: 650px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                .box { background: #eee; padding: 10px; font-family: monospace; word-break: break-all; border-radius: 5px; margin-top: 5px; }
                .form-group { margin-bottom: 20px; }
                .form-group label { display: block; font-weight: bold; margin-bottom: 5px; }
                .form-group input { width: 100%; padding: 8px; box-sizing: border-box; border: 1px solid #ddd; border-radius: 4px; }
                .btn { display: inline-block; padding: 10px 15px; background: #3498db; color: white; text-decoration: none; border: none; border-radius: 5px; font-weight: bold; cursor: pointer; }
                .btn:hover { background: #2980b9; }
                .btn-secondary { background: #7f8c8d; }
                .reaction-item { background: #fafafa; border: 1px solid #ddd; padding: 12px; border-radius: 5px; margin-bottom: 10px; font-size: 14px; }
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
                    <button type="submit" class="btn">기본 설정 저장하기</button>
                </form>

                <hr style="margin: 25px 0; border:0; border-top:1px solid #ddd;">

                <h3>🎨 금액별 커스텀 리액션 등록 (이미지/오디오)</h3>
                <form id="reactionForm">
                    <div class="form-group">
                        <label>특정 후원 금액 (원)</label>
                        <input type="number" id="amount" placeholder="예: 9999" required>
                    </div>
                    <div class="form-group">
                        <label>이미지 파일 선택 (PNG, JPG, GIF)</label>
                        <input type="file" id="imageFile" accept="image/*">
                    </div>
                    <div class="form-group">
                        <label>오디오 파일 선택 (MP3, WAV 등)</label>
                        <input type="file" id="audioFile" accept="audio/*">
                    </div>
                    <button type="button" id="uploadBtn" class="btn" style="background:#2ed573;">리액션 업로드 및 등록</button>
                </form>

                <h4 style="margin-top:30px;">📋 등록된 리액션 목록</h4>
                <div id="reactionList"><div style="color:#666;">불러오는 중...</div></div>

                <br>
                <a href="javascript:history.back();" class="btn btn-secondary">대시보드로 돌아가기</a>
            </div>

            <script>
                // 본인의 Supabase 정보 입력
                const SUPABASE_URL = 'https://당신의프로젝트주소.supabase.co';
                const SUPABASE_ANON_KEY = '당신의Publishable키';
                const STORAGE_BUCKET = '본인이만든버킷이름';

                const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

                async function loadReactions() {
                    try {
                        const res = await fetch('/api/reactions/' + apiKey);
                        const data = await res.json();
                        const container = document.getElementById('reactionList');
                        container.innerHTML = '';
                        if (!data || data.length === 0) {
                            container.innerHTML = '<div style="color:#666;">등록된 리액션이 없습니다.</div>';
                            return;
                        }
                        data.forEach(r => {
                            const div = document.createElement('div');
                            div.className = 'reaction-item';
                            div.innerHTML = '<b>' + r.amount.toLocaleString() + '원 이상 조건</b>' + 
                                '<br><small style="color:#888;">이미지: ' + (r.imageUrl ? 'O' : 'X') + ' / 오디오: ' + (r.audioUrl ? 'O' : 'X') + '</small>';
                            container.appendChild(div);
                        });
                    } catch (e) { console.error(e); }
                }

                   document.getElementById('uploadBtn').addEventListener('click', async () => {
                    const amount = document.getElementById('amount').value;
                    const imageInput = document.getElementById('imageFile').files[0];
                    const audioInput = document.getElementById('audioFile').files[0];

                    if (!amount) {
                        alert('특정 금액을 입력해주세요.');
                        return;
                    }

                    document.getElementById('uploadBtn').innerText = '업로드 중... (잠시만 기다려주세요)';
                    document.getElementById('uploadBtn').disabled = true;

                    try {
                        let imageUrl = "";
                        let audioUrl = "";
                        
                        //  이미지 파일 업로드 (Blob으로 감싸서 한글 파일명 헤더 에러 원천 차단)
                        if (imageInput) {
                            const fileExt = imageInput.name.split('.').pop();
                            const imgName = 'img_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7) + '.' + fileExt;
                            
                            const uploadRes = await fetch(`${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${imgName}`, {
                                method: 'POST',
                                headers: {
                                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                                    'apikey': SUPABASE_ANON_KEY,
                                    'Content-Type': imageInput.type || 'application/octet-stream',
                                    'x-upsert': 'false'
                                },
                                body: imageInput
                            });
                        
                            if (!uploadRes.ok) {
                                const errJson = await uploadRes.json();
                                throw new Error(errJson.message || '이미지 업로드 실패');
                            }
                        
                            const { data: imgPublic } = supabaseClient.storage
                                .from(STORAGE_BUCKET)
                                .getPublicUrl(imgName);
                            imageUrl = imgPublic.publicUrl;
                        }

                        //  오디오 파일 직접 업로드 (Fetch API 사용)
                        if (audioInput) {
                            const fileExt = audioInput.name.split('.').pop();
                            const audioName = 'audio_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7) + '.' + fileExt;
                            
                            const uploadRes = await fetch(`${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${audioName}`, {
                                method: 'POST',
                                headers: {
                                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                                    'apikey': SUPABASE_ANON_KEY,
                                    'Content-Type': audioInput.type || 'application/octet-stream',
                                    'x-upsert': 'false'
                                },
                                body: audioInput
                            });
                        
                            if (!uploadRes.ok) {
                                const errJson = await uploadRes.json();
                                throw new Error(errJson.message || '오디오 업로드 실패');
                            }
                        
                            const { data: audioPublic } = supabaseClient.storage
                                .from(STORAGE_BUCKET)
                                .getPublicUrl(audioName);
                            audioUrl = audioPublic.publicUrl;
                        }

                        // 3. 서버 DB에 리액션 저장 요청
                        const res = await fetch('/api/reactions/' + '${apiKey}', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ amount, imageUrl, audioUrl })
                        });
                        const result = await res.json();

                        if (result.success) {
                            alert('리액션이 성공적으로 등록되었습니다!');
                            document.getElementById('reactionForm').reset();
                            loadReactions();
                        } else {
                            alert('등록 실패: ' + result.error);
                        }
                    } catch (err) {
                        console.error(err);
                        alert('업로드 중 오류가 발생했습니다: ' + (err.message || err));
                    } finally {
                        document.getElementById('uploadBtn').innerText = '리액션 업로드 및 등록';
                        document.getElementById('uploadBtn').disabled = false;
                    }
                });

                loadReactions();
            </script>
        </body>
        </html>
    `);
});

// 8. 방송용 실시간 랭킹 OBS 오버레이 화면
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
                .ranking-board {
                    background: rgba(0, 0, 0, 0.75); color: white; padding: 20px;
                    border-radius: 10px; width: fit-content; min-width: 250px; box-shadow: 0 4px 15px rgba(0,0,0,0.5);
                }
                h3 { margin: 0 0 15px 0; font-size: 18px; text-align: center; color: #f1c40f; }
                .rank-item {
                    display: flex; justify-content: space-between; padding: 8px 0;
                    border-bottom: 1px solid rgba(255,255,255,0.2); font-size: 15px;
                }
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

// 8-1. 랭킹판 전용 세부 관리 및 설정 페이지
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
                <p style="color: #666; font-size: 14px;">여기에 랭킹 표시 명수 조절(Top 3 또는 Top 5), 배경 투명도, 글자 색상 테마 변경 등의 세부 설정을 추가할 예정입니다.</p>

                <a href="javascript:history.back();" class="btn" style="background:#7f8c8d;">대시보드로 돌아가기</a>
            </div>
        </body>
        </html>
    `);
});

// 9. API 코드 모음

// 스트리머별 후원 로그 가져오기 API
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

// 스트리머별 오늘의 후원 랭킹 API
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
            let cleanName = d.nickname.trim();
            if (cleanName.endsWith("님")) {
                cleanName = cleanName.slice(0, -1).trim();
            }

            if (!rankingMap[cleanName]) {
                rankingMap[cleanName] = {
                    totalamount: 0,
                    count: 0,
                    firstDonationTime: d.timestamp
                };
            }
            rankingMap[cleanName].totalamount += d.amount;
            rankingMap[cleanName].count += 1;
        });

        const rankingList = Object.keys(rankingMap).map(name => {
            return {
                _id: name,
                totalamount: rankingMap[name].totalamount,
                count: rankingMap[name].count,
                firstDonationTime: rankingMap[name].firstDonationTime
            };
        });

        rankingList.sort((a, b) => {
            if (b.totalamount !== a.totalamount) {
                return b.totalamount - a.totalamount;
            }
            return new Date(a.firstDonationTime) - new Date(b.firstDonationTime);
        });

        res.json(rankingList.slice(0, 5));
    } catch (e) {
        console.error(e);
        res.status(500).json([]);
    }
});

// 🛠️ 리액션 설정 저장 API (Supabase에서 받은 URL들을 저장)
app.post('/api/reactions/:apiKey', async (req, res) => {
    try {
        const user = await User.findOne({ apiKey: req.params.apiKey });
        if (!user) return res.status(404).json({ success: false, error: 'Streamer not found' });

        const { amount, imageUrl, audioUrl } = req.body;

        const newReaction = new Reaction({
            streamerId: user._id,
            amount: Number(amount),
            imageUrl,
            audioUrl
        });

        await newReaction.save();
        res.json({ success: true, message: '리액션이 성공적으로 저장되었습니다.' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
});

// 🛠️ 리액션 목록 불러오기 API
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

// 서버 구동
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
