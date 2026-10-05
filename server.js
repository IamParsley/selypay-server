const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const crypto = require('crypto');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// 미들웨어 설정
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname));

// 업로드 폴더가 없으면 생성
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

// Multer 파일 저장 설정
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

// 1. MongoDB 연결
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(() => console.log('✅ MongoDB Atlas 연결 성공!'))
.catch((err) => console.error('❌ MongoDB 연결 에러:', err));

// 2. Mongoose 스키마 정의
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    apiKey: { type: String, required: true, unique: true },
    createdAt: { type: Date, default: Date.now },
    reactions: [{
        amount: { type: Number, required: true },
        imageUrl: { type: String, required: true },
        soundUrl: { type: String, default: '/coinsound.mp3' }
    }],
    alertSettings: {
        soundType: { type: String, default: '/coinsound.mp3' },
        duration: { type: Number, default: 5 },
        fontSize: { type: String, default: '7.5vh' }
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

const User = mongoose.model('User', userSchema);
const Donation = mongoose.model('Donation', donationSchema);

// 한국 시간 헬퍼 함수
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

// 업로드된 파일 접근용 static 미들웨어
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 🎁 리액션 설정 조회 API
app.get('/api/reactions/:apiKey', async (req, res) => {
    try {
        const user = await User.findOne({ apiKey: req.params.apiKey });
        if (!user) return res.status(404).json({ success: false, error: 'Streamer not found' });
        res.json({ success: true, reactions: user.reactions || [] });
    } catch (e) {
        res.status(500).json({ success: false, error: 'Server Error' });
    }
});

// 🎁 리액션 규칙 추가 API
app.post('/api/reactions/:apiKey', upload.fields([
    { name: 'imageFile', maxCount: 1 },
    { name: 'soundFile', maxCount: 1 }
]), async (req, res) => {
    try {
        const { amount, imageUrlText, soundUrlText } = req.body;
        const files = req.files;

        if (!amount) {
            return res.status(400).json({ success: false, error: '금액은 필수입니다.' });
        }

        let imageUrl = '';
        if (files && files['imageFile']) {
            imageUrl = '/uploads/' + files['imageFile'][0].filename;
        } else if (imageUrlText) {
            imageUrl = imageUrlText.trim();
        }

        if (!imageUrl) {
            return res.status(400).json({ success: false, error: '이미지 파일 또는 이미지 링크 중 하나는 반드시 입력해야 합니다.' });
        }

        let soundUrl = '/coinsound.mp3';
        if (files && files['soundFile']) {
            soundUrl = '/uploads/' + files['soundFile'][0].filename;
        } else if (soundUrlText && soundUrlText.trim() !== '') {
            soundUrl = soundUrlText.trim();
        }

        const user = await User.findOneAndUpdate(
            { apiKey: req.params.apiKey },
            { $push: { reactions: { amount: Number(amount), imageUrl, soundUrl } } },
            { new: true }
        );
        if (!user) return res.status(404).json({ success: false, error: 'Streamer not found' });
        res.json({ success: true, reactions: user.reactions });
    } catch (e) {
        console.error(e);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
});

// 🎁 리액션 규칙 삭제 API
app.delete('/api/reactions/:apiKey/:reactionId', async (req, res) => {
    try {
        const { apiKey, reactionId } = req.params;
        const user = await User.findOneAndUpdate(
            { apiKey },
            { $pull: { reactions: { _id: reactionId } } },
            { new: true }
        );
        if (!user) return res.status(404).json({ success: false, error: 'Streamer not found' });
        res.json({ success: true, reactions: user.reactions });
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
                        <a href="/manage/alert/` + user.apiKey + `" class="btn" target="_blank">⚙ 후원 리액션 관리 사이트 가기</a>
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
                            const response = await fetch('/api/logs/' + '${user.apiKey}');
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
                            const response = await fetch('/api/ranking/' + '${user.apiKey}');
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

// 7. 스트리머별 OBS 알림 오버레이 화면 (노래 길이만큼 알림창 유지 기능 적용)
app.get('/overlay/:apiKey', async (req, res) => {
    const { apiKey } = req.params;
    const user = await User.findOne({ apiKey });
    if (!user) return res.status(404).send('Streamer not found');

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
                    object-fit: contain; display: block; margin-bottom: 1.5vh;
                }
                #alert-line1 {
                    color: #ffffff; font-size: 7.5vh; font-weight: 800; 
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

            <audio id="alert-sound" crossorigin="anonymous"></audio>

            <script>
                let lastCheckedTime = "";
                let hideTimeout = null;
                
                async function checkNewDonation() {
                    try {
                        const response = await fetch('/api/logs/' + '${apiKey}');
                        const logs = await response.json();
                        if (logs.length > 0) {
                            const latest = logs[0];
                            if (latest.datetime !== lastCheckedTime) {
                                lastCheckedTime = latest.datetime;
                                triggerAlert(latest);
                            }
                        }
                    } catch (e) { console.error(e); }
                }

                async function triggerAlert(donation) {
                    let imageUrl = "/alerticon.gif";
                    let soundUrl = "/coinsound.mp3";

                    try {
                        const res = await fetch('/api/reactions/' + '${apiKey}');
                        const data = await res.json();
                        if (data.success && data.reactions && data.reactions.length > 0) {
                            const sortedReactions = data.reactions.sort((a, b) => b.amount - a.amount);
                            const matched = sortedReactions.find(r => donation.amount >= r.amount);
                            if (matched) {
                                imageUrl = matched.imageUrl;
                                soundUrl = matched.soundUrl;
                            }
                        }
                    } catch (e) {
                        console.error("리액션 규칙 로드 실패:", e);
                    }

                    showAlert(donation.message, imageUrl, soundUrl);
                }

                function showAlert(message, imageUrl, soundUrl) {
                    const container = document.getElementById('alert-container');
                    const img = document.getElementById('alert-image');
                    const line1 = document.getElementById('alert-line1');
                    const line2 = document.getElementById('alert-line2');
                    const sound = document.getElementById('alert-sound');
                            
                    // 기존 타이머나 재생 중인 사운드 초기화
                    if (hideTimeout) clearTimeout(hideTimeout);
                    sound.pause();

                    img.src = imageUrl;
                    sound.src = soundUrl;
                    sound.load(); // 외부 URL 사운드 로딩 재적용

                    let firstText = message;
                    let secondText = "";
                    
                    const newlineIdx = message.indexOf('\\n');
                    if (newlineIdx !== -1) {
                        firstText = message.substring(0, newlineIdx);
                        secondText = message.substring(newlineIdx + 2);
                    }

                    line1.innerText = firstText;
                    line2.innerText = secondText;

                    container.style.display = 'flex';
                    sound.currentTime = 0;

                    let played = false;
                    const playPromise = sound.play();
                    if (playPromise !== undefined) {
                        playPromise.then(() => {
                            played = true;
                        }).catch(e => {
                            console.log("사운드 자동 재생 차단 또는 링크 로드 실패:", e);
                        });
                    }

                    // 사운드 길이에 맞춰 알림창 유지 (사운드가 정상 로드되면 duration 활용, 아니면 기본 5초)
                    const checkDurationAndHide = () => {
                        let durationMs = 5000; // 기본 5초
                        if (!isNaN(sound.duration) && sound.duration > 0) {
                            durationMs = sound.duration * 1000;
                        }
                        
                        hideTimeout = setTimeout(() => {
                            container.style.display = 'none';
                        }, durationMs);
                    };

                    // 메타데이터가 로드되면 정확한 길이 계산
                    sound.onloadedmetadata = () => {
                        checkDurationAndHide();
                    };

                    // 만약 이미 메타데이터가 로드되어 있는 경우를 대비한 예외 처리
                    setTimeout(() => {
                        if (container.style.display === 'flex' && (!hideTimeout || isNaN(sound.duration))) {
                            checkDurationAndHide();
                        }
                    }, 500);
                }

                setInterval(checkNewDonation, 1000);
            </script>
        </body>
        </html>
    `);
});

// 7-1. 후원 리액션 관리 페이지
app.get('/manage/alert/:apiKey', async (req, res) => {
    const { apiKey } = req.params;
    const user = await User.findOne({ apiKey });
    if (!user) return res.status(404).send('Streamer not found');

    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>후원 리액션 관리 - ` + user.username + `</title>
            <style>
                body { font-family: sans-serif; background: #f4f7f6; padding: 40px; margin: 0; }
                .container { max-width: 700px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                .box { background: #eee; padding: 10px; font-family: monospace; word-break: break-all; border-radius: 5px; margin-top: 5px; }
                .form-group { margin-bottom: 15px; }
                .form-group label { display: block; font-weight: bold; margin-bottom: 5px; }
                .form-group input { width: 100%; padding: 8px; box-sizing: border-box; border: 1px solid #ddd; border-radius: 4px; }
                .tab-buttons { display: flex; gap: 10px; margin-bottom: 8px; }
                .tab-btn { padding: 5px 10px; background: #ddd; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: bold; }
                .tab-btn.active { background: #3498db; color: white; }
                .tab-content { display: none; }
                .tab-content.active { display: block; }
                .btn { display: inline-block; padding: 8px 12px; background: #3498db; color: white; text-decoration: none; border: none; border-radius: 5px; font-weight: bold; cursor: pointer; }
                .btn-danger { background: #e74c3c; }
                .btn:hover { opacity: 0.9; }
                .reaction-item { display: flex; justify-content: space-between; align-items: center; padding: 10px; background: #f9f9f9; border: 1px solid #ddd; border-radius: 5px; margin-bottom: 8px; }
            </style>
        </head>
        <body>
            <div class="container">
                <h2>🎁 후원 리액션 관리 (금액별 이미지/노래 설정)</h2>
                <p>OBS 브라우저 소스 주소:</p>
                <div class="box">https://` + req.get('host') + `/overlay/` + user.apiKey + `</div>

                <hr style="margin: 25px 0; border:0; border-top:1px solid #ddd;">
                
                <h3>➕ 새로운 금액별 리액션 추가</h3>
                <form id="reactionForm">
                    <div class="form-group">
                        <label>조건 금액 (원)</label>
                        <input type="number" id="amount" placeholder="예: 10000" required>
                    </div>

                    <div class="form-group">
                        <label>출력할 이미지</label>
                        <div class="tab-buttons">
                            <button type="button" class="tab-btn active" onclick="switchTab('image', 'file')">내 컴퓨터 파일 선택</button>
                            <button type="button" class="tab-btn" onclick="switchTab('image', 'link')">인터넷 주소(URL) 입력</button>
                        </div>
                        <div id="image-file-tab" class="tab-content active">
                            <input type="file" id="imageFile" accept="image/*">
                        </div>
                        <div id="image-link-tab" class="tab-content">
                            <input type="text" id="imageUrlText" placeholder="https://example.com/image.gif">
                        </div>
                    </div>

                    <div class="form-group">
                        <label>재생할 사운드/노래 (선택사항)</label>
                        <div class="tab-buttons">
                            <button type="button" class="tab-btn active" onclick="switchTab('sound', 'file')">내 컴퓨터 파일 선택</button>
                            <button type="button" class="tab-btn" onclick="switchTab('sound', 'link')">인터넷 주소(URL) 입력</button>
                        </div>
                        <div id="sound-file-tab" class="tab-content active">
                            <input type="file" id="soundFile" accept="audio/*">
                        </div>
                        <div id="sound-link-tab" class="tab-content">
                            <input type="text" id="soundUrlText" placeholder="https://example.com/sound.mp3">
                        </div>
                    </div>

                    <button type="submit" class="btn">리액션 규칙 추가하기</button>
                </form>

                <hr style="margin: 25px 0; border:0; border-top:1px solid #ddd;">

                <h3>📋 등록된 리액션 목록</h3>
                <div id="reactionList">불러오는 중...</div>

                <br>
                <a href="javascript:history.back();" class="btn" style="background:#7f8c8d;">대시보드로 돌아가기</a>
            </div>

            <script>
                function switchTab(type, mode) {
                    const fileTab = document.getElementById(type + '-file-tab');
                    const linkTab = document.getElementById(type + '-link-tab');
                    const buttons = fileTab.parentElement.querySelectorAll('.tab-btn');
                    
                    buttons.forEach(btn => btn.classList.remove('active'));
                    
                    if (mode === 'file') {
                        fileTab.classList.add('active');
                        linkTab.classList.remove('active');
                        buttons[0].classList.add('active');
                        document.getElementById(type + 'UrlText').value = ''; 
                    } else {
                        linkTab.classList.add('active');
                        fileTab.classList.remove('active');
                        buttons[1].classList.add('active');
                        document.getElementById(type + 'File
