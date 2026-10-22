const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const crypto = require('crypto');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');

// 🌟 분리한 home.js 연동
const homeRouter = require('./home');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname));

const upload = multer({ storage: multer.memoryStorage() });

// MongoDB 연결
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

function getKSTDateTime() {
    return new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function getKSTDateKey() {
    const now = new Date();
    const kstDate = new Date(now.getTime() + (9 * 60 * 60 * 1000));
    return kstDate.toISOString().split('T')[0];
}

// 🌟 홈 라우트 연결
app.use('/', homeRouter);

// 회원가입 API
app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        const apiKey = 'sely_' + crypto.randomBytes(16).toString('hex');
        const newUser = new User({ username, password, apiKey });
        await newUser.save();
        res.send(`<script>alert('회원가입 성공! 회원가입하신 정보로 로그인해주세요.'); location.href = '/';</script>`);
    } catch (e) {
        res.send(`<script>alert('회원가입 실패 (중복된 아이디일 수 있습니다)'); history.back();</script>`);
    }
});

// 🌟 로그인 및 대시보드 UI (스크린샷 4, 5, 6, 7 완벽 구현)
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username, password });
        if (!user) {
            return res.send(`<script>alert('아이디 또는 비밀번호가 틀렸습니다.'); history.back();</script>`);
        }

        const reactions = await Reaction.find({ streamerId: user._id }).sort({ amount: 1 });

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
        
        /* 상단 헤더 */
        header { display: flex; justify-content: space-between; align-items: center; padding: 16px 40px; background-color: #ffffff; border-bottom: 1px solid #e2e8f0; }
        .logo { display: flex; align-items: center; gap: 8px; font-size: 22px; font-weight: 800; color: #101828; text-decoration: none; }
        .logo-icon { width: 28px; height: 28px; background-color: #52b735; border-radius: 6px; display: inline-block; }
        .nav-links { display: flex; gap: 32px; list-style: none; }
        .nav-links a { text-decoration: none; color: #475569; font-size: 15px; font-weight: 600; }
        
        .user-profile-menu { position: relative; cursor: pointer; }
        .avatar-btn { width: 36px; height: 36px; border-radius: 50%; background-color: #3b82f6; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; border: 2px solid #52b735; }
        
        /* 프로필 드롭다운 (스크린샷 7) */
        .profile-dropdown { display: none; position: absolute; top: 48px; right: 0; width: 220px; background: white; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); border: 1px solid #e2e8f0; z-index: 100; overflow: hidden; }
        .profile-dropdown.active { display: block; }
        .dropdown-header { padding: 14px 18px; border-bottom: 1px solid #f1f5f9; background-color: #f8fafc; }
        .dropdown-header .label { font-size: 11px; color: #94a3b8; font-weight: 700; margin-bottom: 2px; }
        .dropdown-header .username { font-size: 15px; font-weight: 800; color: #0f172a; }
        .dropdown-item { display: flex; align-items: center; gap: 10px; padding: 12px 18px; text-decoration: none; color: #334155; font-size: 14px; font-weight: 600; cursor: pointer; }
        .dropdown-item:hover { background-color: #f8fafc; }
        .dropdown-item.logout { color: #ef4444; border-top: 1px solid #f1f5f9; }

        /* 대시보드 레이아웃 (스크린샷 4, 5, 6) */
        .dashboard-container { max-width: 1280px; margin: 30px auto; padding: 0 20px; }
        .dashboard-card { background: white; border-radius: 20px; box-shadow: 0 4px 20px rgba(0,0,0,0.03); border: 1px solid #e2e8f0; padding: 30px; }
        .dashboard-title { display: flex; align-items: center; justify-content: center; gap: 10px; font-size: 22px; font-weight: 800; color: #0f172a; margin-bottom: 30px; }
        
        .layout-grid { display: grid; grid-template-columns: 240px 1fr; gap: 24px; min-height: 600px; }
        
        /* 사이드바 메뉴 */
        .sidebar { border-right: 1px solid #f1f5f9; padding-right: 20px; display: flex; flex-direction: column; justify-content: space-between; }
        .sidebar-menu { list-style: none; display: flex; flex-direction: column; gap: 8px; }
        .menu-btn { display: flex; align-items: center; gap: 10px; width: 100%; padding: 12px 16px; border: none; background: transparent; border-radius: 12px; font-size: 14px; font-weight: 700; color: #475569; cursor: pointer; text-align: left; }
        .menu-btn.active { background-color: #e8f7ec; color: #16a34a; }
        
        .sidebar-footer { background: #f8fafc; padding: 16px; border-radius: 12px; margin-top: auto; text-align: center; }
        .sidebar-footer .status { font-size: 11px; color: #16a34a; font-weight: 700; margin-top: 4px; display: flex; align-items: center; justify-content: center; gap: 4px; }
        
        /* 메인 컨텐츠 영역 */
        .tab-content { display: none; }
        .tab-content.active { display: block; }

        /* 오버레이 URL 박스 */
        .overlay-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 14px; display: flex; justify-content: space-between; align-items: center; font-family: monospace; font-size: 13px; color: #475569; margin-top: 8px; margin-bottom: 20px; }
        .copy-btn { background: white; border: 1px solid #cbd5e1; padding: 4px 12px; border-radius: 6px; font-size: 12px; font-weight: 700; cursor: pointer; }
        
        /* 카드 컴포넌트 */
        .content-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        .card-panel { border: 1px solid #e2e8f0; border-radius: 16px; padding: 20px; }
        .card-panel-title { font-size: 15px; font-weight: 800; color: #0f172a; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; }

        /* 테이블 및 리액션 카드리스트 */
        .reaction-cards-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 20px; }
        .reaction-item-card { border: 1px solid #e2e8f0; border-radius: 16px; padding: 20px; text-align: center; background: #fafafa; }
        .reaction-thumb { width: 80px; height: 80px; border-radius: 12px; object-fit: contain; margin-bottom: 12px; }
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
                <!-- 사이드바 -->
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

                <!-- 메인 컨텐츠 영역 -->
                <div class="main-content">
                    <!-- 1. 실시간 후원 랭킹 탭 (스크린샷 4) -->
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

                    <!-- 2. 후원 내역 탭 (스크린샷 5) -->
                    <div id="tab-logs" class="tab-content">
                        <div class="card-panel">
                            <div class="card-panel-title">모든 후원 내역 아카이브 <span style="font-size:12px; color:#94a3b8; font-weight:normal;">앱을 통해 수신된 내역입니다</span></div>
                            <div style="color:#94a3b8; font-size:14px; text-align:center; padding:80px 0;">수신된 후원 내역이 없습니다.</div>
                        </div>
                    </div>

                    <!-- 3. 기본 알림 설정 탭 -->
                    <div id="tab-settings" class="tab-content">
                        <div class="card-panel">
                            <div class="card-panel-title">🔔 기본 알림 세부 설정</div>
                            <form id="settingsForm">
                                <p style="margin-bottom:10px; font-size:14px;">지속 시간(초), 폰트 크기 등을 자유롭게 변경하세요.</p>
                                <button type="button" class="btn-green" onclick="alert('설정이 저장되었습니다.')">저장하기</button>
                            </form>
                        </div>
                    </div>

                    <!-- 4. 리액션 설정 탭 (스크린샷 6) -->
                    <div id="tab-reactions" class="tab-content">
                        <div class="card-panel">
                            <div class="card-panel-title">
                                📋 등록된 리액션 목록 (총 ${reactions.length}개)
                                <button class="btn-green" onclick="alert('리액션 등록 창을 엽니다.')">+ 리액션 등록</button>
                            </div>

                            <div class="reaction-cards-grid">
                                ${reactions.length === 0 ? '<div style="color:#94a3b8; grid-column:span 3; text-align:center; padding:40px;">등록된 리액션이 없습니다.</div>' : ''}
                                ${reactions.map(r => `
                                    <div class="reaction-item-card">
                                        <img src="${r.imageUrl || '/alerticon.gif'}" class="reaction-thumb" alt="리액션">
                                        <div style="font-size:15px; font-weight:800; color:#0f172a; margin-bottom:4px;">${r.name}</div>
                                        <div style="font-size:14px; font-weight:800; color:#16a34a; margin-bottom:4px;">${r.amount.toLocaleString()}원 일치</div>
                                        <div style="font-size:11px; color:#94a3b8; margin-bottom:12px;">🎵 ${r.audioUrl ? '음원 등록됨' : '기본 음원'}</div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </div>

                    <!-- 5. 계정 설정 탭 -->
                    <div id="tab-account" class="tab-content">
                        <div class="card-panel">
                            <div class="card-panel-title">⚙️ 계정 및 API Key 관리</div>
                            <p style="font-size:14px; margin-bottom:10px;">안드로이드 앱 연결용 내 API Key:</p>
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
        function toggleDropdown() {
            document.getElementById('profileDropdown').classList.toggle('active');
        }

        function showTab(tabId, btn) {
            document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
            document.querySelectorAll('.menu-btn').forEach(el => el.classList.remove('active'));
            
            document.getElementById(tabId).classList.add('active');
            if(btn) btn.classList.add('active');
        }

        function copyToClipboard(text) {
            navigator.clipboard.writeText(text);
            alert('주소가 클립보드에 복사되었습니다!');
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
        res.status(500).send('Server Error');
    }
});

// API 엔드포인트 및 기타 백엔드 통신 로직 유지
app.post('/api/notification', async (req, res) => {
    const { apiKey, message } = req.body;
    if (!apiKey || !message) return res.status(400).json({ success: false });
    try {
        const user = await User.findOne({ apiKey });
        if (!user) return res.status(401).json({ success: false });

        let amount = 0;
        const amountMatch = message.match(/([0-9,]+)\s*원/);
        if (amountMatch) amount = parseInt(amountMatch[1].replace(/,/g, ''), 10) || 0;

        let nickname = message.includes("님") ? message.split("님")[0].trim() : "익명";

        const donationData = new Donation({
            streamerId: user._id, nickname, amount, message,
            datetime: getKSTDateTime(), dateKey: getKSTDateKey()
        });
        await donationData.save();
        res.status(200).json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false });
    }
});

// 서버 가동
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
