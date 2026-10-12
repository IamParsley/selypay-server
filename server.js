const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const crypto = require('crypto');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname));

const upload = multer({ storage: multer.memoryStorage() });

// 1. MongoDB 연결
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(() => console.log('✅ MongoDB Atlas 연결 성공!'))
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
            { $set: { 
                'alertSettings.soundType': soundType, 
                'alertSettings.duration': Number(duration), 
                'alertSettings.fontSize': fontSize, 
                'alertSettings.useImage': useImage === true || useImage === 'true' 
            }},
            { new: true }
        );
        if (!user) return res.status(404).json({ success: false, error: 'Streamer not found' });
        res.json({ success: true, message: '설정이 저장되었습니다.' });
    } catch (e) {
        res.status(500).json({ success: false, error: 'Server Error' });
    }
});

// 홈 루트
app.get('/', (req, res) => {
    res.send(`
        <div style="font-family:sans-serif; text-align:center; margin-top:50px;">
            <h1>SelyPay 멀티 테넌트 서버 실행 중 🚀</h1>
            <p><a href="/register">스트리머 회원가입</a> | <a href="/login">로그인</a></p>
        </div>
    `);
});

// 회원가입 페이지
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

// 로그인 페이지
app.get('/login', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="ko">
        <head>
            <meta charset="UTF-8">
            <title>슬네이션 - 스트리머 로그인</title>
            <style>
                * { box-sizing: border-box; }
                body {
                    margin: 0;
                    padding: 0;
                    height: 100vh;
                    background: url('/login_background.png') no-repeat center center/cover;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif;
                    overflow: hidden;
                }

                /* 1. 로그인 전체 컨테이너 */
                .login-container {
                    position: relative;
                    width: 600px;
                    height: 600px;
                }

                /* 2. 나무 팻말 박스 이미지 */
                .login-board {
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 600px;
                    height: 600px;
                    background: url('/login_board.png') no-repeat center center/contain;
                    z-index: 2;
                }

                /* 3. 🐱 고양이 레이어 */
                .hanging-cat {
                    position: absolute;
                    top: -130px;
                    left: 50%;
                    transform: translateX(-50%);
                    width: 336px;
                    height: 224px;
                    background: url('/login_cat.png') no-repeat center center/contain;
                    z-index: 5;
                    pointer-events: none;
                    filter: drop-shadow(0 10px 14px rgba(0,0,0,0.7));
                }

                /* 4. 🎯 입력 폼 영역 */
                .login-form-overlay {
                    position: absolute;
                    top: 290px;
                    left: 144px;
                    width: 312px;
                    z-index: 10;
                    text-align: center;
                }

                .input-group {
                    margin-bottom: 10px;
                }

                .input-group input {
                    width: 100%;
                    height: 38px;
                    padding: 0 14px;
                    background: rgba(10, 20, 15, 0.4);
                    border: 2px solid transparent;
                    border-radius: 8px;
                    color: #ffd32a;
                    font-size: 13px;
                    font-weight: bold;
                    outline: none;
                    transition: all 0.3s ease;
                }

                .input-group input:focus {
                    border-color: #2ed573;
                    box-shadow: 0 0 12px rgba(46, 213, 115, 0.7);
                    background: rgba(10, 20, 15, 0.75);
                }

                .input-group input::placeholder {
                    color: rgba(255, 255, 255, 0.45);
                }

               /* 5. 🟢 로그인 버튼 (1번 사진 기본 장착) */
                .login-btn {
                    width: 380px;
                    margin-left: -34px;
                    height: 60px;
                    background: url('/button_inactive.png') no-repeat center center/contain;
                    background-size: 100% 100%;
                    border: none;
                    cursor: pointer;
                    margin-top: 20px;
                    outline: none;
                    /* 색상과 그림자가 부드럽고 자연스럽게 전환되도록 설정 */
                    transition: filter 0.2s ease, box-shadow 0.2s ease, transform 0.1s ease;
                }

                /* 🖱️ 마우스를 올릴 때(Hover): 초록색 사진 자체가 은은하게 달아오르는 느낌 */
                .login-btn:hover {
                    filter: brightness(1.1) saturate(1.2);
                }

                /* 🔴 마우스로 누를 때(Active): 사진 자체가 시뻘건 핏빛/불꽃 색상으로 확 변하면서 발광 */
                .login-btn:active {
                    /* 초록색 사진 픽셀을 붉은색 계열로 강하게 전환하고 채도와 명도를 조절 */
                    filter: brightness(1.7) saturate(1.2);
                    transform: scale(0.98); /* 살짝 눌리는 느낌 */
                }

                /* 6. 하단 링크 영역 */
                .links {
                    margin-top: 5px;
                    text-align: center;
                    font-size: 11px;
                    font-weight: 900;
                    display: flex;
                    flex-direction: column;
                    gap: 3px;
                }

                .links span {
                    color: #ffd32a;
                    text-shadow: 
                        -1.5px -1.5px 0 #000,  1.5px -1.5px 0 #000, 
                        -1.5px  1.5px 0 #000,  1.5px  1.5px 0 #000,
                        0 2px 4px rgba(0,0,0,0.9);
                }

                .links a {
                    color: #ffd32a;
                    text-decoration: none;
                    text-shadow: 
                        -1.5px -1.5px 0 #000,  1.5px -1.5px 0 #000, 
                        -1.5px  1.5px 0 #000,  1.5px  1.5px 0 #000,
                        0 2px 4px rgba(0,0,0,0.9);
                    transition: color 0.2s, transform 0.2s;
                }

                .links a:hover {
                    color: #2ed573;
                }
            </style>
        </head>
        <body>
            <div class="login-container">
                <!-- 고양이 레이어 -->
                <div class="hanging-cat"></div>

                <!-- 나무 팻말 레이어 -->
                <div class="login-board"></div>

                <!-- 입력 폼 오버레이 레이어 -->
                <div class="login-form-overlay">
                    <form action="/api/login" method="POST">
                        <div class="input-group">
                            <input type="text" id="username" name="username" placeholder="아이디" required>
                        </div>

                        <div class="input-group">
                            <input type="password" id="password" name="password" placeholder="비밀번호" required>
                        </div>

                        <button type="submit" class="login-btn" title="로그인"></button>
                    </form>

                    <div class="links">
                        <a href="/forgot-password">비밀번호를 잊으셨나요?</a>
                        <div><span>계정이 없으신가요?</span> <a href="/register">회원가입</a></div>
                    </div>
                </div>
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
                            div.style.display = 'flex';
                            div.style.justifyContent = 'space-between';
                            div.style.alignItems = 'center';
            
                            // 후원 텍스트 영역
                            const textSpan = document.createElement('span');
                            textSpan.innerHTML = '<b>[' + log.datetime + ']</b> ' + log.nickname + '님 (' + log.amount.toLocaleString() + '원): ' + log.message;
            
                            // 🟢 재생 버튼 생성
                            const playBtn = document.createElement('button');
                            playBtn.innerText = '재생';
                            playBtn.className = 'btn';
                            playBtn.style.padding = '4px 8px';
                            playBtn.style.fontSize = '12px';
                            playBtn.style.flex = 'none';
                            playBtn.style.marginLeft = '10px';
                            
                            // 재생 버튼 클릭 시 이벤트
                            playBtn.onclick = async () => {
                                try {
                                    const res = await fetch('/api/play/` + user.apiKey + `/' + log._id, { method: 'POST' });
                                    const data = await res.json();
                                    if (data.success) {
                                        alert('알림창 대기열에 추가되었습니다!');
                                    } else {
                                        alert('재생 요청 실패');
                                    }
                                } catch (err) {
                                    console.error(err);
                                    alert('서버 통신 오류');
                                }
                            };
            
                            div.appendChild(textSpan);
                            div.appendChild(playBtn);
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

// 안드로이드 앱 알림 수신 엔드포인트
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
        res.status(200).json({ success: true, data: donationData });
    } catch (e) {
        console.error(e);
        res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
});

// 스트리머별 OBS 알림 오버레이 화면
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
                #alert-container {
                    width: 100vw; height: 100vh; display: none;
                    flex-direction: column; justify-content: flex-start; align-items: center;
                    text-align: center; box-sizing: border-box; padding: 2vh 3vw;
                    background: transparent !important;
                }
                #alert-image { 
                    width: 70vw; height: auto; max-width: 80%;  max-height: 50vh; 
                    object-fit: contain; display: ${useImage ? 'block' : 'none'}; margin-bottom: 5vh;
                }
                #alert-line1 {
                    color: #ffffff; font-size: 8vh; font-weight: 800; 
                    text-shadow: -3px -3px 0 #000, 3px -3px 0 #000, -3px 3px 0 #000, 3px 3px 0 #000, 4px 4px 8px rgba(0, 0, 0, 0.9);
                    width: 90vw; word-break: keep-all; overflow-wrap: break-word; line-height: 1.2; margin-bottom: 3vh;
                }
                #alert-line2 {
                    color: #ffffff; font-size: 6.5vh; font-weight: 800; 
                    text-shadow: -3px -3px 0 #000, 3px -3px 0 #000, -3px 3px 0 #000, 3px 3px 0 #000, 4px 4px 8px rgba(0, 0, 0, 0.9);
                    width: 90vw; word-break: break-word; line-height: 1.2;
                }
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            </style>
        </head>
        <body>
            <div id="alert-container">
                <img id="alert-image" src="" alt="리액션 이미지">
                <div class="text-box" id="alert-line1"></div>
                <div class="text-box" id="alert-line2"></div>
            </div>

            <script>
            const reactions = ${JSON.stringify(reactions)};
            const defaultSound = "/${settings.soundType || 'coinsound.mp3'}";
            const defaultImage = "/alerticon.gif";
            const useImageSetting = ${useImage};

            let lastCheckedTime = "";
            
            // 🌟 대기열 및 재생 상태 관리 변수
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

            // 🟢 [추가됨] 대시보드에서 재생 버튼을 눌렀을 때 호출되는 수동 재생 체크 함수
            async function checkManualPlay() {
                try {
                    const response = await fetch('/api/manual-play/' + '${apiKey}');
                    const items = await response.json();
                    if (items && items.length > 0) {
                        items.forEach(item => {
                            alertQueue.push(item); // 대기열 맨 뒤로 추가
                        });
                        processQueue(); // 대기열 처리 시작
                    }
                } catch (e) {
                    console.error(e);
                }
            }

            // 🌟 대기열 순차 처리 함수
            function processQueue() {
                if (isPlaying || alertQueue.length === 0) return;

                isPlaying = true;
                const donation = alertQueue.shift();
                showAlert(donation);
            }

            function showAlert(donation) {
                // ... (이하 showAlert 함수 내용 기존과 동일하게 유지) ...
                
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
            setInterval(checkManualPlay, 1000); // 🟢 [추가됨] 1초마다 수동 재생 요청 체크 루프 실행
        </script>
```[cite: 1]
        </body>
        </html>
    `);
});

// 알림창 세부 관리 및 설정 페이지 (정렬 드롭다운 및 수정 모달 포함)
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
                
                .reaction-grid {
                    display: grid;
                    grid-template-columns: repeat(4, 1fr);
                    gap: 15px;
                    margin-top: 15px;
                }
                .reaction-card {
                    background: #fafafa;
                    border: 1px solid #ddd;
                    border-radius: 8px;
                    padding: 12px;
                    text-align: center;
                    box-sizing: border-box;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: space-between;
                }
                .reaction-card img {
                    width: 70px;
                    height: 70px;
                    object-fit: contain;
                    border-radius: 4px;
                    background: #eee;
                    margin-bottom: 8px;
                }
                .reaction-info {
                    font-size: 13px;
                    width: 100%;
                    word-break: break-all;
                    margin-bottom: 8px;
                }

                .modal {
                    display: none; position: fixed; z-index: 1000; left: 0; top: 0; width: 100%; height: 100%;
                    background-color: rgba(0,0,0,0.5); justify-content: center; align-items: center;
                }
                .modal-content {
                    background: white; padding: 25px; border-radius: 10px; width: 400px; max-width: 90%;
                    box-shadow: 0 4px 15px rgba(0,0,0,0.2); position: relative;
                }
                .close-btn {
                    position: absolute; right: 15px; top: 15px; font-size: 20px; font-weight: bold; cursor: pointer; color: #888;
                }
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
                    <div class="form-group">
                        <label>리액션 이름</label>
                        <input type="text" id="name" placeholder="예: 폭탄 리액션" required>
                    </div>
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

            <!-- 리액션 수정 모달 팝업 -->
            <div id="editModal" class="modal">
                <div class="modal-content">
                    <span class="close-btn" onclick="closeEditModal()">&times;</span>
                    <h3>✏️ 리액션 수정</h3>
                    <input type="hidden" id="edit-id">
                    <div class="form-group">
                        <label>리액션 이름</label>
                        <input type="text" id="edit-name" required>
                    </div>
                    <div class="form-group">
                        <label>후원 금액 (원)</label>
                        <input type="number" id="edit-amount" required>
                    </div>
                    <div class="form-group">
                        <label>새 이미지 파일 변경 (선택)</label>
                        <input type="file" id="edit-imageFile" accept="image/*">
                    </div>
                    <div class="form-group">
                        <label>새 오디오 파일 변경 (선택)</label>
                        <input type="file" id="edit-audioFile" accept="audio/*">
                    </div>
                    <button type="button" class="btn btn-warning" style="width:100%; padding:10px; font-size:14px;" onclick="submitEditReaction()">수정 사항 저장하기</button>
                </div>
            </div>

            <script>
                const currentApiKey = "` + apiKey + `";
                let allReactions = []; // 전체 리액션 데이터를 저장할 전역 변수

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

                    if (sortType === 'highPrice') {
                        sortedReactions.sort((a, b) => b.amount - a.amount);
                    } else if (sortType === 'lowPrice') {
                        sortedReactions.sort((a, b) => a.amount - b.amount);
                    } else if (sortType === 'latest') {
                        sortedReactions.sort((a, b) => b._id.localeCompare(a._id));
                    }

                    sortedReactions.forEach(r => {
                        const card = document.createElement('div');
                        card.className = 'reaction-card';
                        
                        const imgSrc = r.imageUrl ? r.imageUrl : '/alerticon.gif';
                        const audioStatus = r.audioUrl ? '등록됨' : '없음';

                        card.innerHTML = \`
                            <div style="width: 100%;">
                                <img src="\${imgSrc}" alt="리액션 사진">
                                <div class="reaction-info">
                                    <b style="font-size:14px; display:block; margin-bottom:4px;">\${r.name || '기본 리액션'}</b>
                                    <span style="color:#e67e22; font-weight:bold; display:block; margin-bottom:4px;">\${r.amount.toLocaleString()}원</span>
                                    <span style="color:#888; font-size:11px; display:block;">음악파일: \${audioStatus}</span>
                                </div>
                            </div>
                            <button type="button" class="btn btn-warning" style="width:100%;" onclick="openEditModal('\${r._id}', '\${r.name || ''}', \${r.amount})">수정</button>
                        \`;
                        container.appendChild(card);
                    });
                }

                // 신규 리액션 등록
                document.getElementById('uploadBtn').addEventListener('click', async () => {
                    const name = document.getElementById('name').value;
                    const amount = document.getElementById('amount').value;
                    const imageInput = document.getElementById('imageFile').files[0];
                    const audioInput = document.getElementById('audioFile').files[0];

                    if (!name || !amount) {
                        alert('리액션 이름과 금액을 입력해주세요.');
                        return;
                    }

                    const formData = new FormData();
                    formData.append('name', name);
                    formData.append('amount', amount);
                    if (imageInput) formData.append('image', imageInput);
                    if (audioInput) formData.append('audio', audioInput);

                    document.getElementById('uploadBtn').innerText = '업로드 중...';
                    document.getElementById('uploadBtn').disabled = true;

                    try {
                        const res = await fetch('/api/reactions/' + currentApiKey, {
                            method: 'POST',
                            body: formData
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
                        alert('업로드 중 오류가 발생했습니다.');
                    } finally {
                        document.getElementById('uploadBtn').innerText = '리액션 업로드 및 등록';
                        document.getElementById('uploadBtn').disabled = false;
                    }
                });

                // 모달 팝업 열기
                function openEditModal(id, name, amount) {
                    document.getElementById('edit-id').value = id;
                    document.getElementById('edit-name').value = name;
                    document.getElementById('edit-amount').value = amount;
                    document.getElementById('edit-imageFile').value = '';
                    document.getElementById('edit-audioFile').value = '';
                    document.getElementById('editModal').style.display = 'flex';
                }

                // 모달 팝업 닫기
                function closeEditModal() {
                    document.getElementById('editModal').style.display = 'none';
                }

                // 리액션 수정 요청 전송
                async function submitEditReaction() {
                    const id = document.getElementById('edit-id').value;
                    const name = document.getElementById('edit-name').value;
                    const amount = document.getElementById('edit-amount').value;
                    const imageInput = document.getElementById('edit-imageFile').files[0];
                    const audioInput = document.getElementById('edit-audioFile').files[0];

                    if (!name || !amount) {
                        alert('이름과 금액을 입력해주세요.');
                        return;
                    }

                    const formData = new FormData();
                    formData.append('name', name);
                    formData.append('amount', amount);
                    if (imageInput) formData.append('image', imageInput);
                    if (audioInput) formData.append('audio', audioInput);

                    try {
                        const res = await fetch('/api/reactions/' + currentApiKey + '/' + id, {
                            method: 'PUT',
                            body: formData
                        });
                        const result = await res.json();

                        if (result.success) {
                            alert('리액션이 성공적으로 수정되었습니다!');
                            closeEditModal();
                            loadReactions();
                        } else {
                            alert('수정 실패: ' + result.error);
                        }
                    } catch (err) {
                        console.error(err);
                        alert('수정 중 오류가 발생했습니다.');
                    }
                }

                loadReactions();
            </script>
        </body>
        </html>
    `);
});

// 방송용 실시간 랭킹 OBS 오버레이 화면
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

// 랭킹판 세부 관리 및 설정 페이지
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
            // 🟢 '테스트후원알림' 닉네임은 랭킹 집계에서 제외
            if (d.nickname === '테스트후원알림') return;

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

// 리액션 목록 불러오기 API
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

// 리액션 등록 API
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

            const { error: imgError } = await supabaseClient.storage
                .from(STORAGE_BUCKET)
                .upload(imgName, file.buffer, { contentType: file.mimetype, upsert: false });

            if (imgError) throw imgError;
            const { data: imgPublic } = supabaseClient.storage.from(STORAGE_BUCKET).getPublicUrl(imgName);
            imageUrl = imgPublic.publicUrl;
        }

        if (req.files && req.files['audio']) {
            const file = req.files['audio'][0];
            const fileExt = file.originalname.split('.').pop();
            const audioName = 'audio_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7) + '.' + fileExt;

            const { error: audioError } = await supabaseClient.storage
                .from(STORAGE_BUCKET)
                .upload(audioName, file.buffer, { contentType: file.mimetype, upsert: false });

            if (audioError) throw audioError;
            const { data: audioPublic } = supabaseClient.storage.from(STORAGE_BUCKET).getPublicUrl(audioName);
            audioUrl = audioPublic.publicUrl;
        }

        const newReaction = new Reaction({
            streamerId: user._id,
            name: name || "기본 리액션",
            amount: Number(amount),
            imageUrl,
            audioUrl
        });

        await newReaction.save();
        res.json({ success: true, message: '리액션이 성공적으로 등록되었습니다!' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ success: false, error: e.message || 'Server Error' });
    }
});

// 기존 리액션 수정 API (PUT)
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

            const { error: imgError } = await supabaseClient.storage
                .from(STORAGE_BUCKET)
                .upload(imgName, file.buffer, { contentType: file.mimetype, upsert: false });

            if (imgError) throw imgError;
            const { data: imgPublic } = supabaseClient.storage.from(STORAGE_BUCKET).getPublicUrl(imgName);
            reaction.imageUrl = imgPublic.publicUrl;
        }

        if (req.files && req.files['audio']) {
            const file = req.files['audio'][0];
            const fileExt = file.originalname.split('.').pop();
            const audioName = 'audio_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7) + '.' + fileExt;

            const { error: audioError } = await supabaseClient.storage
                .from(STORAGE_BUCKET)
                .upload(audioName, file.buffer, { contentType: file.mimetype, upsert: false });

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

// 🔄 후원 수동 재생 메모리 큐 시스템 (DB 건드리지 않음)
const manualPlayStore = {};

app.post('/api/play/:apiKey/:donationId', async (req, res) => {
    try {
        const user = await User.findOne({ apiKey: req.params.apiKey });
        if (!user) return res.status(404).json({ success: false, error: 'Streamer not found' });

        const donation = await Donation.findOne({ _id: req.params.donationId, streamerId: user._id });
        if (!donation) return res.status(404).json({ success: false, error: 'Donation not found' });

        if (!manualPlayStore[user.apiKey]) {
            manualPlayStore[user.apiKey] = [];
        }
        
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
