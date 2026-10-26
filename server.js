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
    },
    menuSettings: {
        textColor: { type: String, default: '#ffffff' },
        fontSize: { type: String, default: '24px' },
        fontFamily: { type: String, default: 'Malgun Gothic' },
        effect: { type: String, default: 'none' }, // glow, none
        borderColor: { type: String, default: '#000000' }, // 독립된 테두리 색상
        borderWidth: { type: String, default: '2px' } // 독립된 테두리 두께
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

// 메뉴판 설정 저장 API
app.post('/api/settings/menu/:apiKey', async (req, res) => {
    try {
        const { textColor, fontSize, fontFamily, effect, borderColor, borderWidth } = req.body;
        const user = await User.findOneAndUpdate(
            { apiKey: req.params.apiKey },
            { $set: { 
                'menuSettings.textColor': textColor,
                'menuSettings.fontSize': fontSize,
                'menuSettings.fontFamily': fontFamily,
                'menuSettings.effect': effect,
                'menuSettings.borderColor': borderColor,
                'menuSettings.borderWidth': borderWidth
            }},
            { new: true }
        );
        if (!user) return res.status(404).json({ success: false, error: 'Streamer not found' });
        res.json({ success: true, message: '메뉴판 설정이 저장되었습니다.' });
    } catch (e) {
        res.status(500).json({ success: false, error: 'Server Error' });
    }
});

// 로그인 및 대시보드 UI
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

        const menuSettings = user.menuSettings || {
            textColor: '#ffffff',
            fontSize: '24px',
            fontFamily: 'Malgun Gothic',
            effect: 'none',
            borderColor: '#000000',
            borderWidth: '2px'
        };

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
        .form-group { margin-bottom: 15px; }
        .form-group label { display: block; font-weight: bold; margin-bottom: 5px; font-size: 13px; }
        .form-group input, .form-group select { width: 100%; padding: 8px; box-sizing: border-box; border: 1px solid #ddd; border-radius: 4px; }
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
                <a href="#" class="dropdown-item" onclick="showTab('tab-menu')">📋 메뉴판 오버레이 설정</a>
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
                        <li><button class="menu-btn" onclick="showTab('tab-menu', this)">📋 메뉴판 오버레이</button></li>
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
                            </div>
                            <div class="card-panel">
                                <div class="card-panel-title">실시간 후원 랭킹 오버레이</div>
                                <div class="overlay-box">
                                    <span>https://${req.get('host')}/ranking-overlay/${user.apiKey}</span>
                                    <button class="copy-btn" onclick="copyToClipboard('https://${req.get('host')}/ranking-overlay/${user.apiKey}')">복사</button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div id="tab-logs" class="tab-content">
                        <div class="card-panel">
                            <div class="card-panel-title">모든 후원 내역 아카이브</div>
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
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </div>

                    <!-- 📋 깔끔 투명 메뉴판 설정 탭 -->
                    <div id="tab-menu" class="tab-content">
                        <div class="card-panel">
                            <div class="card-panel-title">📋 투명 깔끔 메뉴판 오버레이 설정</div>
                            <p style="font-size:13px; color:#64748b; margin-bottom:15px;">배경 없이 [리액션명 금액] 형태로 나열되는 OBS 브라우저 소스 주소입니다.</p>
                            
                            <div class="overlay-box">
                                <span>https://${req.get('host')}/menu-overlay/${user.apiKey}</span>
                                <button class="copy-btn" onclick="copyToClipboard('https://${req.get('host')}/menu-overlay/${user.apiKey}')">주소 복사</button>
                            </div>

                            <form id="menuSettingsForm" style="margin-top:20px;">
                                <div class="form-group">
                                    <label>글씨 색상</label>
                                    <input type="color" id="menuTextColor" value="${menuSettings.textColor}" style="height:40px; cursor:pointer;">
                                </div>
                                <div class="form-group">
                                    <label>테두리(외곽선) 색상</label>
                                    <input type="color" id="menuBorderColor" value="${menuSettings.borderColor || '#000000'}" style="height:40px; cursor:pointer;">
                                </div>
                                <div class="form-group">
                                    <label>테두리(외곽선) 두께 (예: 1px, 2px, 3px)</label>
                                    <input type="text" id="menuBorderWidth" value="${menuSettings.borderWidth || '2px'}">
                                </div>
                                <div class="form-group">
                                    <label>글씨 크기</label>
                                    <input type="text" id="menuFontSize" value="${menuSettings.fontSize}">
                                </div>
                                <div class="form-group">
                                    <label>글씨체 (폰트)</label>
                                    <select id="menuFontFamily">
                                        <option value="Malgun Gothic" ${menuSettings.fontFamily === 'Malgun Gothic' ? 'selected' : ''}>맑은 고딕</option>
                                        <option value="Arial, sans-serif" ${menuSettings.fontFamily.includes('Arial') ? 'selected' : ''}>아리얼 (Arial)</option>
                                        <option value="Apple SD Gothic Neo, sans-serif" ${menuSettings.fontFamily.includes('Apple SD Gothic Neo') ? 'selected' : ''}>애플 SD 산돌고딕</option>
                                        <option value="Courier New, monospace" ${menuSettings.fontFamily.includes('Courier New') ? 'selected' : ''}>고정폭 폰트 (Courier)</option>
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label>추가 효과</label>
                                    <select id="menuEffect">
                                        <option value="none" ${menuSettings.effect === 'none' ? 'selected' : ''}>효과 없음 (테두리만 적용)</option>
                                        <option value="glow" ${menuSettings.effect === 'glow' ? 'selected' : ''}>네온 발광 효과</option>
                                    </select>
                                </div>
                                <button type="button" class="btn-green" onclick="saveMenuSettings()">메뉴판 설정 저장하기</button>
                            </form>
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
        async function saveMenuSettings() {
            const data = {
                textColor: document.getElementById('menuTextColor').value,
                borderColor: document.getElementById('menuBorderColor').value,
                borderWidth: document.getElementById('menuBorderWidth').value,
                fontSize: document.getElementById('menuFontSize').value,
                fontFamily: document.getElementById('menuFontFamily').value,
                effect: document.getElementById('menuEffect').value
            };
            try {
                const res = await fetch('/api/settings/menu/${user.apiKey}', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                const result = await res.json();
                if(result.success) alert('메뉴판 설정이 성공적으로 저장되었습니다!');
                else alert('저장 실패');
            } catch(e) {
                console.error(e);
                alert('서버 통신 오류');
            }
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

// 📋 배경 없는 투명 메뉴판 오버레이 엔드포인트 (독립된 테두리 적용)
app.get('/menu-overlay/:apiKey', async (req, res) => {
    try {
        const { apiKey } = req.params;
        const user = await User.findOne({ apiKey });
        if (!user) return res.status(404).send('Streamer not found');

        const reactions = await Reaction.find({ streamerId: user._id }).sort({ amount: 1 });
        const menuSettings = user.menuSettings || {
            textColor: '#ffffff',
            fontSize: '24px',
            fontFamily: 'Malgun Gothic',
            effect: 'none',
            borderColor: '#000000',
            borderWidth: '2px'
        };

        const bw = menuSettings.borderWidth || '2px';
        const bc = menuSettings.borderColor || '#000000';
        
        // 사방으로 테두리 픽셀을 뿌려 깔끔한 스트로크 효과 생성
        let textShadowStyle = `
            -${bw} -${bw} 0 ${bc},
             ${bw} -${bw} 0 ${bc},
            -${bw}  ${bw} 0 ${bc},
             ${bw}  ${bw} 0 ${bc},
             0 ${bw} 0 ${bc},
             0 -${bw} 0 ${bc},
            -${bw} 0 0 ${bc},
             ${bw} 0 0 ${bc}
        `;

        if (menuSettings.effect === 'glow') {
            textShadowStyle += `, 0 0 10px ${menuSettings.textColor}, 0 0 20px ${menuSettings.textColor}`;
        }

        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>SelyPay Clean Menu Overlay</title>
                <style>
                    body {
                        background: transparent !important;
                        margin: 0;
                        padding: 10px;
                        font-family: ${menuSettings.fontFamily};
                    }
                    .menu-container {
                        display: flex;
                        flex-direction: column;
                        gap: 8px;
                        width: fit-content;
                    }
                    .menu-row {
                        color: ${menuSettings.textColor};
                        font-size: ${menuSettings.fontSize};
                        font-weight: 800;
                        text-shadow: ${textShadowStyle};
                        white-space: nowrap;
                    }
                </style>
            </head>
            <body>
                <div class="menu-container">
                    ${reactions.length === 0 ? '<div style="color:#aaa; font-size:16px;">등록된 리액션이 없습니다.</div>' : ''}
                    ${reactions.map(r => `
                        <div class="menu-row">${r.name}&nbsp;${r.amount.toLocaleString()}원</div>
                    `).join('')}
                </div>
            </body>
            </html>
        `);
    } catch (e) {
        res.status(500).send('Menu Overlay Error');
    }
});

// 기타 기본 API들
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
        <head><meta charset="UTF-8"><style>body{background:transparent;margin:0;}</style></head>
        <body>
            <div id="alert-container" style="display:none; color:white; font-size:50px; font-weight:bold; text-shadow:2px 2px 4px #000;">알림 테스트</div>
            <script>
                const reactions = ${JSON.stringify(reactions)};
            </script>
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
    } catch (e) { res.status(500).json([]); }
});

app.get('/api/ranking/:apiKey', async (req, res) => {
    try {
        const user = await User.findOne({ apiKey: req.params.apiKey });
        if (!user) return res.status(404).json([]);
        res.json([]);
    } catch (e) { res.status(500).json([]); }
});

app.get('/api/reactions/:apiKey', async (req, res) => {
    try {
        const user = await User.findOne({ apiKey: req.params.apiKey });
        if (!user) return res.status(404).json([]);
        const reactions = await Reaction.find({ streamerId: user._id }).sort({ amount: 1 });
        res.json(reactions);
    } catch (e) { res.status(500).json([]); }
});

app.post('/api/reactions/:apiKey', upload.fields([{ name: 'image' }, { name: 'audio' }]), async (req, res) => {
    try {
        const user = await User.findOne({ apiKey: req.params.apiKey });
        if (!user) return res.status(404).json({ success: false });
        const { name, amount } = req.body;
        const newReaction = new Reaction({ streamerId: user._id, name: name || "기본 리액션", amount: Number(amount) });
        await newReaction.save();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

const manualPlayStore = {};
app.post('/api/play/:apiKey/:donationId', async (req, res) => { res.json({ success: true }); });
app.get('/api/manual-play/:apiKey', async (req, res) => { res.json([]); });

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
