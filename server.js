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
app.use(express.static(__dirname)); // 현재 폴더의 이미지 파일(login_background.png, login_board.png, login_cat.png 등)을 웹에서 바로 읽을 수 있게 설정

const upload = multer({ storage: multer.memoryStorage() });

// 1. MongoDB 연결
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('✅ MongoDB Atlas 연결 성공!'))
    .catch((err) => console.error('❌ MongoDB 연결 에러:', err));

// 2. 유저 스키마 정의
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

// 3. 후원 스키마 정의
const donationSchema = new mongoose.Schema({
    streamerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    nickname: { type: String, default: "익명" },
    amount: { type: Number, default: 0 },
    message: { type: String, default: "" },
    datetime: { type: String, required: true },
    dateKey: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
});

// 4. 리액션 설정 스키마 정의
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

// 5. 한국 시간 구하는 헬퍼 함수
function getKSTDateTime() {
    return new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function getKSTDateKey() {
    const now = new Date();
    const kstDate = new Date(now.getTime() + (9 * 60 * 60 * 1000));
    return kstDate.toISOString().split('T')[0];
}

// 6. 🔔 알림 설정 불러오기 API
app.get('/api/settings/alert/:apiKey', async (req, res) => {
    try {
        const user = await User.findOne({ apiKey: req.params.apiKey });
        if (!user) return res.status(404).json({ success: false, error: 'Streamer not found' });
        res.json({ success: true, settings: user.alertSettings || {} });
    } catch (e) {
        res.status(500).json({ success: false, error: 'Server Error' });
    }
});

// 7. 🔔 알림 설정 저장하기 API
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

// 8. 홈 루트
app.get('/', (req, res) => {
    res.send(`
        <div style="font-family:sans-serif; text-align:center; margin-top:50px;">
            <h1>SelyPay 멀티 테넌트 서버 실행 중 🚀</h1>
            <p><a href="/register">스트리머 회원가입</a> | <a href="/login">로그인</a></p>
        </div>
    `);
});

// 9. 회원가입 페이지
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

// ==========================================
// 10. 🌲 3가지 분리된 이미지 레이어(배경, 팻말, 고양이) 적용 로그인 페이지
// ==========================================
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
                    /* 배경 숲 이미지 */
                    background: url('/login_background.png') no-repeat center center/cover;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif;
                    overflow: hidden;
                }

                /* 1) 로그인 전체 컨테이너 (750px 정사각형) */
                .login-container {
                    position: relative;
                    width: 750px;
                    height: 750px;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                }

                /* 2) 새 나무 팻말 박스 이미지 (login_board.png) */
                .login-board {
                    position: absolute;
                    width: 750px;
                    height: 750px;
                    background: url('/login_board.png') no-repeat center center/contain;
                    z-index: 2;
                }

                /* 3) 🐱 고양이 레이어 (상단 테두리에 큼직하게 매달림) */
                .hanging-cat {
                    position: absolute;
                    top: 0px;
                    left: 50%;
                    transform: translateX(-50%);
                    width: 420px;
                    height: 280px;
                    background: url('/login_cat.png') no-repeat center center/contain;
                    z-index: 5;
                    pointer-events: none;
                    filter: drop-shadow(0 12px 16px rgba(0,0,0,0.7));
                }

                /* 4) 🎯 입력 폼 영역 (새 이미지 속 빈 목판 칸들과 하단 '로그인' 버튼에 정확히 일치시킴) */
                .login-form-overlay {
                    position: absolute;
                    top: 600px; /* 새 이미지의 입력 칸 위치에 맞춤 */
                    left: 50%;
                    transform: translateX(-50%);
                    width: 400px; /* 입력 칸 가로 폭 */
                    z-index: 10;
                    text-align: center;
                }

                .input-group {
                    margin-bottom: 15px; /* 아이디와 비밀번호 입력칸 사이 간격 */
                }

                .input-group input {
                    width: 100%;
                    height: 50px;
                    padding: 0 18px;
                    background: rgba(10, 20, 15, 0.4); /* 목판 느낌을 살린 반투명 배경 */
                    border: 2px solid transparent; /* 테두리는 깔끔하게 숨김 */
                    border-radius: 10px;
                    color: #ffd32a; /* 입력하는 글씨 색상 (골드톤) */
                    font-size: 17px;
                    font-weight: bold;
                    outline: none;
                    transition: all 0.3s ease;
                }

                .input-group input:focus {
                    border-color: #2ed573;
                    box-shadow: 0 0 14px rgba(46, 213, 115, 0.7);
                    background: rgba(10, 20, 15, 0.75);
                }

                .input-group input::placeholder {
                    color: rgba(255, 255, 255, 0.45);
                }

                /* 5) 🟢 이미지 속 '로그인' 글씨 버튼 위에 겹쳐지는 투명 버튼 (클릭 시 붉게 빛남) */
                .login-btn {
                    width: 100%;
                    height: 54px;
                    background: transparent;
                    border: none;
                    cursor: pointer;
                    margin-top: 5px;
                    outline: none;
                    border-radius: 12px;
                    transition: all 0.1s ease;
                }

                .login-btn:active {
                    background: rgba(255, 71, 87, 0.4);
                    box-shadow: 0 0 25px rgba(255, 71, 87, 0.9), inset 0 0 12px rgba(255, 71, 87, 0.6);
                    transform: scale(0.98);
                }

                /* 6) 하단 링크 영역 (노란색/골드톤 + 검은 외곽선으로 가독성 극대화) */
                .links {
                    margin-top: 22px;
                    text-align: center;
                    font-size: 15px;
                    font-weight: 900;
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                }

                .links span {
                    color: #ffd32a; /* 따뜻한 노랑/골드톤 */
                    text-shadow: 
                        -2px -2px 0 #000,  2px -2px 0 #000, 
                        -2px  2px 0 #000,  2px  2px 0 #000,
                        0 3px 6px rgba(0,0,0,0.9);
                }

                .links a {
                    color: #ffd32a; /* 따뜻한 노랑/골드톤 */
                    text-decoration: none;
                    text-shadow: 
                        -2px -2px 0 #000,  2px -2px 0 #000, 
                        -2px  2px 0 #000,  2px  2px 0 #000,
                        0 3px 6px rgba(0,0,0,0.9);
                    transition: color 0.2s, transform 0.2s;
                }

                .links a:hover {
                    color: #2ed573; /* 마우스 올리면 초록빛으로 반짝 */
                }
            </style>
        </head>
        <body>
            <div class="login-container">
                <!-- 고양이 레이어 -->
                <div class="hanging-cat"></div>

                <!-- 나무 팻말 레이어 (login_board.png) -->
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

                        <!-- 이미지 속 '로그인' 버튼 위치와 정확히 일치하는 투명 버튼 -->
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

// 11. 안드로이드 앱 알림 수신 엔드포인트
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

// 12. 스트리머별 OBS 알림 오버레이 화면
app.get('/overlay/:apiKey', async (req, res) => {
    const { apiKey } = req.params;
    const user = await User.findOne({ apiKey });
    if (!user) return res.status(404).send('Streamer not found');
    // 오버레이 관련 로직...
});

// 13. 알림창 세부 관리 및 설정 페이지
app.get('/manage/alert/:apiKey', async (req, res) => {
    const { apiKey } = req.params;
    const user = await User.findOne({ apiKey });
    if (!user) return res.status(404).send('Streamer not found');
    // 관리 페이지 로직...
});

// 14. 방송용 실시간 랭킹 OBS 오버레이 화면
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

// 15. 랭킹판 세부 관리 및 설정 페이지
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

// 16. 스트리머별 후원 로그 가져오기 API
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

// 17. 스트리머별 오늘의 후원 랭킹 API
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

// 18. 리액션 목록 불러오기 API
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

// 19. 리액션 수정 API (PUT)
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

// 20. 서버 구동
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
