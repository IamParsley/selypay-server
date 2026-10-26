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
        effect: { type: String, default: 'shadow' },
        borderColor: { type: String, default: '#000000' },
        borderWidth: { type: String, default: '2px' },
        scrollMode: { type: String, default: 'page' },
        scrollInterval: { type: Number, default: 3 }
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
        res.send(`<script>alert('회원가입 성공! 발급된 계정으로 로그인해주세요.'); location.href = '/login';</script>`);
    } catch (e) {
        res.send(`<script>alert('회원가입 실패 (중복된 아이디일 수 있습니다)'); history.back();</script>`);
    }
});

// 메뉴판 설정 저장 API
app.post('/api/settings/menu/:apiKey', async (req, res) => {
    try {
        const { textColor, fontSize, fontFamily, effect, borderColor, borderWidth, scrollMode, scrollInterval } = req.body;
        const user = await User.findOneAndUpdate(
            { apiKey: req.params.apiKey },
            { $set: { 
                'menuSettings.textColor': textColor,
                'menuSettings.fontSize': fontSize,
                'menuSettings.fontFamily': fontFamily,
                'menuSettings.effect': effect,
                'menuSettings.borderColor': borderColor,
                'menuSettings.borderWidth': borderWidth,
                'menuSettings.scrollMode': scrollMode,
                'menuSettings.scrollInterval': Number(scrollInterval) || 3
            }},
            { new: true }
        );
        if (!user) return res.status(404).json({ success: false, error: 'Streamer not found' });
        res.json({ success: true, message: '메뉴판 설정이 저장되었습니다.' });
    } catch (e) {
        res.status(500).json({ success: false, error: 'Server Error' });
    }
});

// 로그인 및 대시보드 UI (리액션 추가/관리 팝업 모달 탑재)
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
            effect: 'shadow',
            borderColor: '#000000',
            borderWidth: '2px',
            scrollMode: 'page',
            scrollInterval: 3
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
        .card-panel { border: 1px solid #e2e8f0; border-radius: 16px; padding: 20px; margin-bottom: 20px; }
        .card-panel-title { font-size: 15px; font-weight: 800; color: #0f172a; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; }
        .reaction-cards-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 20px; }
        .reaction-item-card { border: 1px solid #e2e8f0; border-radius: 16px; padding: 20px; text-align: center; background: #fafafa; }
        .reaction-thumb { width: 80px; height: 80px; border-radius: 12px; object-fit: contain; margin-bottom: 12px; background: #eee; }
        .btn-green { background-color: #52b735; color: white; border: none; padding: 8px 16px; border-radius: 8px; font-weight: 700; cursor: pointer; }
        .form-group { margin-bottom: 15px; }
        .form-group label { display: block; font-weight: bold; margin-bottom: 5px; font-size: 13px; }
        .form-group input, .form-group select { width: 100%; padding: 8px; box-sizing: border-box; border: 1px solid #ddd; border-radius: 4px; }
        
        /* 팝업 모달 스타일 */
        .modal { display: none; position: fixed; z-index: 1000; left: 0; top: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.5); justify-content: center; align-items: center; }
        .modal-content { background: white; padding: 30px; border-radius: 16px; width: 500px; max-width: 90%; max-height: 90vh; overflow-y: auto; box-shadow: 0 10px 30px rgba(0,0,0,0.2); position: relative; }
        .close-btn { position: absolute; right: 20px; top: 20px; font-size: 24px; font-weight: bold; cursor: pointer; color: #888; }
        .close-btn:hover { color: #000; }
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
                <a href="#" class="dropdown-item" onclick="openReactionModal()">🐱 리액션 추가 및 관리</a>
                <a href="#" class="dropdown-item" onclick="showTab('tab-menu')">📋 메뉴판 오버레이 설정</a>
                <a href="/login" class="dropdown-item logout">🚪 로그아웃</a>
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
                    <!-- 1. 랭킹 탭 -->
                    <div id="tab-ranking" class="tab-content active">
                        <div class="content-grid">
                            <div class="card-panel">
                                <div class="card-panel-title">실시간 후원 알림 오버레이</div>
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

                    <!-- 2. 후원 내역 탭 -->
                    <div id="tab-logs" class="tab-content">
                        <div class="card-panel">
                            <div class="card-panel-title">모든 후원 내역 아카이브</div>
                            <div style="color:#94a3b8; font-size:14px; text-align:center; padding:80px 0;">수신된 후원 내역이 없습니다.</div>
                        </div>
                    </div>

                    <!-- 3. 리액션 설정 탭 -->
                    <div id="tab-reactions" class="tab-content">
                        <div class="card-panel">
                            <div class="card-panel-title">
                                📋 등록된 리액션 목록 (총 ${reactions.length}개)
                                <button type="button" class="btn-green" onclick="openReactionModal()" style="font-size:13px;">+ 새 리액션 추가 / 관리하기</button>
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

                    <!-- 4. 메뉴판 오버레이 설정 탭 -->
                    <div id="tab-menu" class="tab-content">
                        <div class="card-panel">
                            <div class="card-panel-title">📋 투명 깔끔 메뉴판 오버레이 설정</div>
                            <p style="font-size:13px; color:#64748b; margin-bottom:15px;">전환 방식(페이지 전환 또는 스크롤 순환)과 노출 시간을 설정할 수 있습니다.</p>
                            
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
                                        <option value="Arial, sans-serif" ${menuSettings.fontFamily.includes('Arial') ? 'selected' : ''}>아리얼
