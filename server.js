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
        duration: { type: Number, default: 10 },
        fontSize: { type: String, default: '8vh' },
        fontFamily: { type: String, default: 'Jalnan2, sans-serif' },
        fontColor: { type: String, default: '#ffffff' },
        borderColor: { type: String, default: '#000000' },
        borderWidth: { type: String, default: '2px' },
        effect: { type: String, default: 'letter-wave' },
        layoutType: { type: String, default: 'default' },
        useImage: { type: Boolean, default: true }
    },
    menuSettings: {
        textColor: { type: String, default: '#ff2a85' },
        fontSize: { type: String, default: '24px' },
        fontFamily: { type: String, default: 'Apple SD Gothic Neo, "Malgun Gothic", sans-serif' },
        effect: { type: String, default: 'modern-glow' },
        borderColor: { type: String, default: '#000000' },
        borderWidth: { type: String, default: '0px' },
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

// 알림창 설정 저장 API
app.post('/api/settings/alert/:apiKey', async (req, res) => {
    try {
        const { layoutType, fontSize, fontFamily, fontColor, borderColor, borderWidth, effect } = req.body;
        const user = await User.findOneAndUpdate(
            { apiKey: req.params.apiKey },
            { $set: { 
                'alertSettings.layoutType': layoutType,
                'alertSettings.fontSize': fontSize,
                'alertSettings.fontFamily': fontFamily,
                'alertSettings.fontColor': fontColor,
                'alertSettings.borderColor': borderColor,
                'alertSettings.borderWidth': borderWidth,
                'alertSettings.effect': effect
            }},
            { new: true }
        );
        if (!user) return res.status(404).json({ success: false, error: 'Streamer not found' });
        res.json({ success: true, message: '알림창 설정이 저장되었습니다.' });
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
            textColor: '#ff2a85',
            fontSize: '24px',
            fontFamily: 'Apple SD Gothic Neo, "Malgun Gothic", sans-serif',
            effect: 'modern-glow',
            borderColor: '#000000',
            borderWidth: '0px',
            scrollMode: 'page',
            scrollInterval: 3
        };

        const alertSettings = user.alertSettings || {
            layoutType: 'default',
            fontSize: '8vh',
            fontFamily: 'Jalnan2, sans-serif',
            fontColor: '#ffffff',
            borderColor: '#000000',
            borderWidth: '2px',
            effect: 'letter-wave'
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
        
        header { display: flex; justify-content: space-between; align-items: center; padding: 16px 40px; background-color: #ffffff; border-bottom: 1px solid #e2e8f0; flex-wrap: wrap; gap: 10px; }
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

        .dashboard-container { max-width: 1400px; margin: 30px auto; padding: 0 20px; }
        .dashboard-card { background: white; border-radius: 20px; box-shadow: 0 4px 20px rgba(0,0,0,0.03); border: 1px solid #e2e8f0; padding: 30px; overflow: hidden; }
        
        /* 💡 상단 타이틀 영역 (사이드바 토글 버튼 포함) */
        .dashboard-header-top { display: flex; align-items: center; gap: 12px; margin-bottom: 30px; }
        .sidebar-toggle-btn { background: #f1f5f9; border: 1px solid #cbd5e1; width: 38px; height: 38px; border-radius: 8px; font-size: 18px; font-weight: bold; cursor: pointer; display: flex; align-items: center; justify-content: center; color: #475569; flex-shrink: 0; }
        .sidebar-toggle-btn:hover { background-color: #e2e8f0; color: #0f172a; }
        .dashboard-title { display: flex; align-items: center; gap: 10px; font-size: 22px; font-weight: 800; color: #0f172a; margin: 0; }
        
        /* 💡 사이드바 접기 상태를 위한 그리드 변환 */
        .layout-grid { display: grid; grid-template-columns: 240px 1fr; gap: 24px; min-height: 600px; transition: grid-template-columns 0.3s ease; }
        .layout-grid.collapsed { grid-template-columns: 0px 1fr; }
        
        .sidebar { border-right: 1px solid #f1f5f9; padding-right: 20px; display: flex; flex-direction: column; justify-content: space-between; overflow: hidden; transition: opacity 0.2s ease, padding 0.3s ease; white-space: nowrap; }
        .layout-grid.collapsed .sidebar { opacity: 0; padding-right: 0; pointer-events: none; border-right: none; }

        .sidebar-menu { list-style: none; display: flex; flex-direction: column; gap: 8px; }
        .menu-btn { display: flex; align-items: center; gap: 10px; width: 100%; padding: 12px 16px; border: none; background: transparent; border-radius: 12px; font-size: 14px; font-weight: 700; color: #475569; cursor: pointer; text-align: left; }
        .menu-btn.active { background-color: #e8f7ec; color: #16a34a; }
        .sidebar-footer { background: #f8fafc; padding: 16px; border-radius: 12px; margin-top: auto; text-align: center; }
        .sidebar-footer .status { font-size: 11px; color: #16a34a; font-weight: 700; margin-top: 4px; display: flex; align-items: center; justify-content: center; gap: 4px; }
        
        .tab-content { display: none; width: 100%; overflow: hidden; }
        .tab-content.active { display: block; }
        
        .content-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; width: 100%; }
        .card-panel { border: 1px solid #e2e8f0; border-radius: 16px; padding: 20px; margin-bottom: 20px; width: 100%; min-width: 0; box-sizing: border-box; overflow: hidden; }
        .card-panel-title { font-size: 15px; font-weight: 800; color: #0f172a; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; word-break: break-all; flex-wrap: wrap; gap: 10px; }
        
        .overlay-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 14px; display: flex; justify-content: space-between; align-items: center; font-family: monospace; font-size: 13px; color: #475569; margin-top: 8px; margin-bottom: 20px; width: 100%; min-width: 0; box-sizing: border-box; overflow: hidden; }
        .overlay-link { color: #2563eb; text-decoration: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-right: 10px; display: block; flex: 1; min-width: 0; }
        .overlay-link:hover { text-decoration: underline; }
        
        .copy-btn { background: white; border: 1px solid #cbd5e1; padding: 4px 12px; border-radius: 6px; font-size: 12px; font-weight: 700; cursor: pointer; flex-shrink: 0; }
        
        .reaction-cards-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 16px; margin-top: 20px; }
        .reaction-item-card { border: 1px solid #e2e8f0; border-radius: 16px; padding: 16px; text-align: center; background: #fafafa; display: flex; flex-direction: column; align-items: center; justify-content: center; position: relative; }
        .reaction-thumb { width: 70px; height: 70px; border-radius: 12px; object-fit: contain; margin-bottom: 10px; background: #eee; }
        
        /* 💡 세로 점 3개 (⋮) 버튼 및 드롭다운 스타일 */
        .card-menu-btn { position: absolute; top: 10px; right: 10px; background: transparent; border: none; font-size: 18px; font-weight: bold; color: #64748b; cursor: pointer; padding: 4px 8px; border-radius: 4px; letter-spacing: -2px; }
        .card-menu-btn:hover { background-color: #e2e8f0; color: #0f172a; }
        
        .card-dropdown-menu { display: none; position: absolute; top: 38px; right: 10px; background: white; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); border: 1px solid #e2e8f0; z-index: 50; width: 110px; overflow: hidden; text-align: left; }
        .card-dropdown-menu.active { display: block; }
        .card-dropdown-item { padding: 10px 14px; font-size: 13px; font-weight: 600; color: #334155; cursor: pointer; display: block; width: 100%; border: none; background: transparent; text-align: left; }
        .card-dropdown-item:hover { background-color: #f8fafc; }
        .card-dropdown-item.delete { color: #ef4444; border-top: 1px solid #f1f5f9; }

        @media (max-width: 1200px) {
            .reaction-cards-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
        }
        @media (max-width: 900px) {
            .layout-grid { grid-template-columns: 1fr !important; }
            .sidebar { opacity: 1 !important; padding-right: 0 !important; border-right: none !important; border-bottom: 1px solid #f1f5f9; padding-bottom: 20px; margin-bottom: 20px; }
            .sidebar-menu { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; }
            .reaction-cards-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        }
        @media (max-width: 600px) {
            .sidebar-menu { grid-template-columns: 1fr; }
            .content-grid { grid-template-columns: 1fr; }
            .reaction-cards-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
            header { padding: 12px 20px; }
            .dashboard-container { padding: 0 10px; margin: 15px auto; }
            .dashboard-card { padding: 15px; }
        }

        .btn-green { background-color: #52b735; color: white; border: none; padding: 8px 16px; border-radius: 8px; font-weight: 700; cursor: pointer; white-space: nowrap; }
        .form-group { margin-bottom: 15px; }
        .form-group label { display: block; font-weight: bold; margin-bottom: 5px; font-size: 13px; }
        .form-group input, .form-group select { width: 100%; padding: 8px; box-sizing: border-box; border: 1px solid #ddd; border-radius: 4px; }
        
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
                <a href="#" class="dropdown-item" onclick="showTab('tab-alert')">💬 알림창 설정</a>
                <a href="/login" class="dropdown-item logout">🚪 로그아웃</a>
            </div>
        </div>
    </header>

    <div class="dashboard-container">
        <div class="dashboard-card">
            <div class="dashboard-header-top">
                <button class="sidebar-toggle-btn" onclick="toggleSidebar()" title="사이드바 접기/펼치기">☰</button>
                <div class="dashboard-title"><span class="logo-icon" style="width:22px; height:22px;"></span> Slenation Dashboard</div>
            </div>
            
            <div class="layout-grid" id="layoutGrid">
                <div class="sidebar">
                    <ul class="sidebar-menu">
                        <li><button class="menu-btn active" onclick="showTab('tab-ranking', this)">📊 실시간 후원 랭킹</button></li>
                        <li><button class="menu-btn" onclick="showTab('tab-logs', this)">💰 후원 내역</button></li>
                        <li><button class="menu-btn" onclick="showTab('tab-reactions', this)">🐱 리액션 설정</button></li>
                        <li><button class="menu-btn" onclick="showTab('tab-alert', this)">💬 알림창 설정</button></li>
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
                                    <a href="https://${req.get('host')}/overlay/${user.apiKey}" target="_blank" class="overlay-link" title="클릭하여 오버레이 미리보기 열기">https://${req.get('host')}/overlay/${user.apiKey}</a>
                                    <button class="copy-btn" onclick="copyToClipboard('https://${req.get('host')}/overlay/${user.apiKey}')">복사</button>
                                </div>
                            </div>
                            <div class="card-panel">
                                <div class="card-panel-title">실시간 후원 랭킹 오버레이</div>
                                <div class="overlay-box">
                                    <a href="https://${req.get('host')}/ranking-overlay/${user.apiKey}" target="_blank" class="overlay-link" title="클릭하여 랭킹 오버레이 미리보기 열기">https://${req.get('host')}/ranking-overlay/${user.apiKey}</a>
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
                                <span>📋 등록된 리액션 목록 (총 <span id="reactionCount">${reactions.length}</span>개)</span>
                                <button type="button" class="btn-green" onclick="openReactionModal()" style="font-size:13px;">+ 새 리액션 추가 / 관리하기</button>
                            </div>
                            <div class="reaction-cards-grid" id="reactionGridContainer">
                                ${reactions.length === 0 ? '<div style="color:#94a3b8; grid-column:1 / -1; text-align:center; padding:40px;" id="noReactionMsg">등록된 리액션이 없습니다.</div>' : ''}
                                ${reactions.map(r => `
                                    <div class="reaction-item-card">
                                        <button class="card-menu-btn" onclick="toggleCardMenu(event, '${r._id}')">⋮</button>
                                        <div class="card-dropdown-menu" id="menu-${r._id}">
                                            <button class="card-dropdown-item" onclick="openEditModal('${r._id}', '${r.name}', ${r.amount})">수정하기</button>
                                            <button class="card-dropdown-item delete" onclick="deleteReaction('${r._id}')">삭제하기</button>
                                        </div>
                                        <img src="${r.imageUrl && r.imageUrl.startsWith('http') ? r.imageUrl : '/alerticon.gif'}" class="reaction-thumb" alt="리액션" onerror="this.src='/alerticon.gif'">
                                        <div style="font-size:14px; font-weight:800; color:#0f172a; margin-bottom:4px; word-break:break-all;">${r.name}</div>
                                        <div style="font-size:13px; font-weight:800; color:#16a34a;">${r.amount.toLocaleString()}원 일치</div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </div>

                    <!-- 4. 알림창 설정 탭 -->
                    <div id="tab-alert" class="tab-content">
                        <div class="card-panel">
                            <div class="card-panel-title">💬 실시간 후원 알림창 스타일 설정</div>
                            <p style="font-size:13px; color:#64748b; margin-bottom:15px;">방송 화면에 송출되는 알림창의 폰트, 크기, 색상, 테두리 및 애니메이션 효과를 설정할 수 있습니다.</p>

                            <div class="overlay-box">
                                <a href="https://${req.get('host')}/overlay/${user.apiKey}" target="_blank" class="overlay-link" title="클릭하여 알림 오버레이 미리보기 열기">https://${req.get('host')}/overlay/${user.apiKey}</a>
                                <button class="copy-btn" onclick="copyToClipboard('https://${req.get('host')}/overlay/${user.apiKey}')">주소 복사</button>
                            </div>

                            <form id="alertSettingsForm" style="margin-top:20px;">
                                <div class="form-group">
                                    <label>기본 알림창 형식 선택</label>
                                    <select id="alertLayoutType">
                                        <option value="default" ${alertSettings.layoutType === 'default' ? 'selected' : ''}>🌟 [기본형] 상단 이미지 + 하단 두 줄 텍스트</option>
                                        <option value="banner" ${alertSettings.layoutType === 'banner' ? 'selected' : ''}>💬 [배너형] 가로형 일체형 바 (추후 업데이트)</option>
                                        <option value="compact" ${alertSettings.layoutType === 'compact' ? 'selected' : ''}>⚡ [미니형] 컴팩트 심플 알림 (추후 업데이트)</option>
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label>글씨체 (폰트 선택)</label>
                                    <select id="alertFontFamily">
                                        <option value="Jalnan2, sans-serif" ${alertSettings.fontFamily.includes('Jalnan2') ? 'selected' : ''}>🔥 싹둑/여기야 폰트 (Jalnan2 커스텀)</option>
                                        <option value="Apple SD Gothic Neo, 'Malgun Gothic', sans-serif" ${alertSettings.fontFamily.includes('Apple SD Gothic Neo') ? 'selected' : ''}>✨ 애플 SD 산돌고딕 (세련된 모던)</option>
                                        <option value="'Pretendard', sans-serif" ${alertSettings.fontFamily.includes('Pretendard') ? 'selected' : ''}>🌟 프리텐다드 (깔끔한 프리미엄)</option>
                                        <option value="'Black Han Sans', sans-serif" ${alertSettings.fontFamily.includes('Black Han Sans') ? 'selected' : ''}>🔥 블랙한산스 (초특급 볼드)</option>
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label>글씨 크기 (예: 8vh 등)</label>
                                    <input type="text" id="alertFontSize" value="${alertSettings.fontSize || '8vh'}">
                                </div>
                                <div class="form-group">
                                    <label>글씨 색상</label>
                                    <input type="color" id="alertFontColor" value="${alertSettings.fontColor || '#ffffff'}" style="height:40px; cursor:pointer;">
                                </div>
                                <div class="form-group">
                                    <label>글씨 테두리(외곽선) 색상</label>
                                    <input type="color" id="alertBorderColor" value="${alertSettings.borderColor || '#000000'}" style="height:40px; cursor:pointer;">
                                </div>
                                <div class="form-group">
                                    <label>글씨 테두리(외곽선) 두께 (예: 2px)</label>
                                    <input type="text" id="alertBorderWidth" value="${alertSettings.borderWidth || '2px'}">
                                </div>
                                <div class="form-group">
                                    <label>유동성 / 애니메이션 효과 선택</label>
                                    <select id="alertEffect">
                                        <option value="letter-wave" ${alertSettings.effect === 'letter-wave' ? 'selected' : ''}>🌊 [추천] 글씨가 하나씩 따로따로 움직이는 파도타기 (Letter Wave)</option>
                                        <option value="wave-bounce" ${alertSettings.effect === 'wave-bounce' ? 'selected' : ''}>🌊 문장 전체가 위아래로 출렁이는 파도타기 (Bounce)</option>
                                        <option value="glow-pulse" ${alertSettings.effect === 'glow-pulse' ? 'selected' : ''}>✨ 은은하게 반짝이는 네온 글로우 (Pulse)</option>
                                        <option value="rainbow-neon" ${alertSettings.effect === 'rainbow-neon' ? 'selected' : ''}>🌈 화려한 무지개빛 네온 효과</option>
                                        <option value="gold-metal" ${alertSettings.effect === 'gold-metal' ? 'selected' : ''}>🏆 고급 골드 메탈릭 입체감</option>
                                        <option value="clean-shadow" ${alertSettings.effect === 'clean-shadow' ? 'selected' : ''}>✨ 깔끔한 기본 입체 그림자</option>
                                    </select>
                                </div>
                                <button type="button" class="btn-green" onclick="saveAlertSettings()">알림창 설정 저장하기</button>
                            </form>
                        </div>
                    </div>

                    <!-- 5. 메뉴판 오버레이 설정 탭 -->
                    <div id="tab-menu" class="tab-content">
                        <div class="card-panel">
                            <div class="card-panel-title">📋 투명 깔끔 메뉴판 오버레이 설정</div>
                            <p style="font-size:13px; color:#64748b; margin-bottom:15px;">색상 맞춤형 세련된 자막 스타일을 설정할 수 있습니다.</p>
                            
                            <div class="overlay-box">
                                <a href="https://${req.get('host')}/menu-overlay/${user.apiKey}" target="_blank" class="overlay-link" title="클릭하여 메뉴판 미리보기 열기">https://${req.get('host')}/menu-overlay/${user.apiKey}</a>
                                <button class="copy-btn" onclick="copyToClipboard('https://${req.get('host')}/menu-overlay/${user.apiKey}')">주소 복사</button>
                            </div>

                            <form id="menuSettingsForm" style="margin-top:20px;">
                                <div class="form-group">
                                    <label>글씨 색상 (원하는 컬러 선택)</label>
                                    <input type="color" id="menuTextColor" value="${menuSettings.textColor}" style="height:40px; cursor:pointer;">
                                </div>
                                <div class="form-group">
                                    <label>테두리(외곽선) 색상 (필요시)</label>
                                    <input type="color" id="menuBorderColor" value="${menuSettings.borderColor || '#000000'}" style="height:40px; cursor:pointer;">
                                </div>
                                <div class="form-group">
                                    <label>테두리(외곽선) 두께 (기본: 0px로 깔끔하게)</label>
                                    <input type="text" id="menuBorderWidth" value="${menuSettings.borderWidth || '0px'}">
                                </div>
                                <div class="form-group">
                                    <label>글씨 크기</label>
                                    <input type="text" id="menuFontSize" value="${menuSettings.fontSize}">
                                </div>
                                <div class="form-group">
                                    <label>글씨체 (폰트)</label>
                                    <select id="menuFontFamily">
                                        <option value="Jalnan2, sans-serif" ${menuSettings.fontFamily.includes('Jalnan2') ? 'selected' : ''}>🔥 싹둑/여기야 폰트 (Jalnan2)</option>
                                        <option value="Apple SD Gothic Neo, 'Malgun Gothic', sans-serif" ${menuSettings.fontFamily.includes('Apple SD Gothic Neo') ? 'selected' : ''}>✨ 애플 SD 산돌고딕 (세련된 모던)</option>
                                        <option value="'Pretendard', sans-serif" ${menuSettings.fontFamily.includes('Pretendard') ? 'selected' : ''}>🌟 프리텐다드 (깔끔한 프리미엄)</option>
                                        <option value="'Black Han Sans', sans-serif" ${menuSettings.fontFamily.includes('Black Han Sans') ? 'selected' : ''}>🔥 블랙한산스 (초특급 볼드)</option>
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label>세련된 컬러 맞춤 효과 선택</label>
                                    <select id="menuEffect">
                                        <option value="modern-glow" ${menuSettings.effect === 'modern-glow' ? 'selected' : ''}>🌟 [추천] 글씨 색상 맞춤 은은한 빛(Glow) 효과</option>
                                        <option value="soft-shadow" ${menuSettings.effect === 'soft-shadow' ? 'selected' : ''}>✨ 부드러운 입체 음영 그림자</option>
                                        <option value="clean-flat" ${menuSettings.effect === 'clean-flat' ? 'selected' : ''}>🎨 외곽선 없이 깔끔한 플랫 디자인</option>
                                        <option value="rainbow" ${menuSettings.effect === 'rainbow' ? 'selected' : ''}>🌈 화려한 무지개 다채광 네온</option>
                                        <option value="gold" ${menuSettings.effect === 'gold' ? 'selected' : ''}>🏆 고급 골드 메탈릭 입체감</option>
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label>순환 방식 선택</label>
                                    <select id="menuScrollMode">
                                        <option value="page" ${menuSettings.scrollMode === 'page' ? 'selected' : ''}>📄 페이지 단위 전환 (정해진 시간마다 끊어 넘김)</option>
                                        <option value="ticker" ${menuSettings.scrollMode === 'ticker' ? 'selected' : ''}>🔄 스크롤 순환 (위로 부드럽게 무한 롤링)</option>
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label>페이지 전환 시간 (초) - [페이지 모드 전용]</label>
                                    <input type="number" id="menuScrollInterval" min="1" max="30" value="${menuSettings.scrollInterval || 3}">
                                </div>
                                <button type="button" class="btn-green" onclick="saveMenuSettings()">메뉴판 설정 저장하기</button>
                            </form>
                        </div>
                    </div>

                    <!-- 6. 계정 설정 탭 -->
                    <div id="tab-account" class="tab-content">
                        <div class="card-panel">
                            <div class="card-panel-title">⚙️ 계정 및 API Key 관리</div>
                            <div class="overlay-box">
                                <span class="overlay-link" style="cursor: default;" title="${user.apiKey}">${user.apiKey}</span>
                                <button class="copy-btn" onclick="copyToClipboard('${user.apiKey}')">키 복사</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- 🐱 리액션 추가 팝업 모달 -->
    <div id="reactionModal" class="modal">
        <div class="modal-content" onclick="event.stopPropagation()">
            <span class="close-btn" onclick="closeReactionModal()">&times;</span>
            <h3 style="margin-bottom: 20px;">🎨 신규 커스텀 리액션 등록</h3>
            <form id="reactionForm">
                <div class="form-group"><label>리액션 이름</label><input type="text" id="modal-name" placeholder="예: 폭탄 리액션" required></div>
                <div class="form-group"><label>특정 후원 금액 (원)</label><input type="number" id="modal-amount" placeholder="예: 9999" required></div>
                <div class="form-group"><label>이미지 파일 선택 (PNG, JPG, GIF)</label><input type="file" id="modal-imageFile" accept="image/*"></div>
                <div class="form-group"><label>오디오 파일 선택 (MP3, WAV 등)</label><input type="file" id="modal-audioFile" accept="audio/*"></div>
                <button type="button" id="modalUploadBtn" class="btn-green" style="width:100%; padding:10px; margin-top:10px;">리액션 업로드 및 등록</button>
            </form>
        </div>
    </div>

    <!-- ✏️ 리액션 수정 팝업 모달 -->
    <div id="editReactionModal" class="modal">
        <div class="modal-content" onclick="event.stopPropagation()">
            <span class="close-btn" onclick="closeEditModal()">&times;</span>
            <h3 style="margin-bottom: 20px;">✏️ 커스텀 리액션 수정</h3>
            <form id="editReactionForm">
                <input type="hidden" id="edit-id">
                <div class="form-group"><label>리액션 이름</label><input type="text" id="edit-name" required></div>
                <div class="form-group"><label>특정 후원 금액 (원)</label><input type="number" id="edit-amount" required></div>
                <div class="form-group"><label>새 이미지 파일 변경 (선택사항)</label><input type="file" id="edit-imageFile" accept="image/*"></div>
                <div class="form-group"><label>새 오디오 파일 변경 (선택사항)</label><input type="file" id="edit-audioFile" accept="audio/*"></div>
                <button type="button" id="editUploadBtn" class="btn-green" style="width:100%; padding:10px; margin-top:10px;">리액션 수정 저장하기</button>
            </form>
        </div>
    </div>

    <script>
        function toggleDropdown() { document.getElementById('profileDropdown').classList.toggle('active'); }
        
        // 💡 사이드바 접기/펼치기 토글 함수
        function toggleSidebar() {
            document.getElementById('layoutGrid').classList.toggle('collapsed');
        }

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
        
        function openReactionModal() {
            document.getElementById('reactionModal').style.display = 'flex';
            document.getElementById('profileDropdown').classList.remove('active');
        }
        function closeReactionModal() {
            document.getElementById('reactionModal').style.display = 'none';
        }

        function toggleCardMenu(event, id) {
            event.stopPropagation();
            document.querySelectorAll('.card-dropdown-menu').forEach(el => {
                if (el.id !== 'menu-' + id) el.classList.remove('active');
            });
            const menu = document.getElementById('menu-' + id);
            if (menu) menu.classList.toggle('active');
        }

        function openEditModal(id, name, amount) {
            document.querySelectorAll('.card-dropdown-menu').forEach(el => el.classList.remove('active'));
            document.getElementById('edit-id').value = id;
            document.getElementById('edit-name').value = name;
            document.getElementById('edit-amount').value = amount;
            document.getElementById('editReactionModal').style.display = 'flex';
        }
        function closeEditModal() {
            document.getElementById('editReactionModal').style.display = 'none';
        }

        async function deleteReaction(id) {
            if (!confirm('정말 이 리액션을 삭제하시겠습니까?')) return;
            try {
                const res = await fetch('/api/reaction/' + '${user.apiKey}/' + id, { method: 'DELETE' });
                const result = await res.json();
                if (result.success) {
                    alert('리액션이 삭제되었습니다.');
                    fetchReactionsAndRefreshUI();
                } else {
                    alert('삭제 실패: ' + result.error);
                }
            } catch (e) {
                console.error(e);
                alert('서버 오류가 발생했습니다.');
            }
        }

        document.getElementById('editUploadBtn').addEventListener('click', async () => {
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

            const btn = document.getElementById('editUploadBtn');
            btn.innerText = '수정 중...';
            btn.disabled = true;

            try {
                const res = await fetch('/api/reaction/' + '${user.apiKey}/' + id, { method: 'PUT', body: formData });
                const result = await res.json();
                if (result.success) {
                    alert('리액션이 성공적으로 수정되었습니다!');
                    closeEditModal();
                    fetchReactionsAndRefreshUI();
                } else {
                    alert('수정 실패: ' + result.error);
                }
            } catch (err) {
                console.error(err);
                alert('수정 중 오류가 발생했습니다.');
            } finally {
                btn.innerText = '리액션 수정 저장하기';
                btn.disabled = false;
            }
        });

        document.getElementById('modalUploadBtn').addEventListener('click', async () => {
            const name = document.getElementById('modal-name').value;
            const amount = document.getElementById('modal-amount').value;
            const imageInput = document.getElementById('modal-imageFile').files[0];
            const audioInput = document.getElementById('modal-audioFile').files[0];
            
            if (!name || !amount) { alert('리액션 이름과 금액을 입력해주세요.'); return; }
            
            const formData = new FormData();
            formData.append('name', name);
            formData.append('amount', amount);
            if (imageInput) formData.append('image', imageInput);
            if (audioInput) formData.append('audio', audioInput);
            
            const btn = document.getElementById('modalUploadBtn');
            btn.innerText = '업로드 중...';
            btn.disabled = true;
            
            try {
                const res = await fetch('/api/reactions/' + '${user.apiKey}', { method: 'POST', body: formData });
                const result = await res.json();
                if (result.success) { 
                    alert('리액션이 성공적으로 등록되었습니다!'); 
                    document.getElementById('reactionForm').reset(); 
                    closeReactionModal();
                    fetchReactionsAndRefreshUI();
                } else { 
                    alert('등록 실패: ' + result.error); 
                }
            } catch (err) { 
                console.error(err); 
                alert('업로드 중 오류가 발생했습니다.'); 
            } finally { 
                btn.innerText = '리액션 업로드 및 등록'; 
                btn.disabled = false; 
            }
        });

        async function fetchReactionsAndRefreshUI() {
            try {
                const res = await fetch('/api/reactions/' + '${user.apiKey}');
                const reactions = await res.json();
                
                document.getElementById('reactionCount').innerText = reactions.length;
                const container = document.getElementById('reactionGridContainer');
                container.innerHTML = '';

                if (reactions.length === 0) {
                    container.innerHTML = '<div style="color:#94a3b8; grid-column:1 / -1; text-align:center; padding:40px;" id="noReactionMsg">등록된 리액션이 없습니다.</div>';
                    return;
                }

                reactions.forEach(r => {
                    const imgSrc = r.imageUrl && r.imageUrl.startsWith('http') ? r.imageUrl : '/alerticon.gif';
                    const card = document.createElement('div');
                    card.className = 'reaction-item-card';
                    card.innerHTML = \`
                        <button class="card-menu-btn" onclick="toggleCardMenu(event, '\${r._id}')">⋮</button>
                        <div class="card-dropdown-menu" id="menu-\${r._id}">
                            <button class="card-dropdown-item" onclick="openEditModal('\${r._id}', '\${r.name}', \${r.amount})">수정하기</button>
                            <button class="card-dropdown-item delete" onclick="deleteReaction('\${r._id}')">삭제하기</button>
                        </div>
                        <img src="\${imgSrc}" class="reaction-thumb" alt="리액션" onerror="this.src='/alerticon.gif'">
                        <div style="font-size:14px; font-weight:800; color:#0f172a; margin-bottom:4px; word-break:break-all;">\${r.name}</div>
                        <div style="font-size:13px; font-weight:800; color:#16a34a;">\${r.amount.toLocaleString()}원 일치</div>
                    \`;
                    container.appendChild(card);
                });
            } catch (e) {
                console.error("리액션 목록 갱신 실패:", e);
            }
        }

        async function saveAlertSettings() {
            const data = {
                layoutType: document.getElementById('alertLayoutType').value,
                fontFamily: document.getElementById('alertFontFamily').value,
                fontSize: document.getElementById('alertFontSize').value,
                fontColor: document.getElementById('alertFontColor').value,
                borderColor: document.getElementById('alertBorderColor').value,
                borderWidth: document.getElementById('alertBorderWidth').value,
                effect: document.getElementById('alertEffect').value
            };
            try {
                const res = await fetch('/api/settings/alert/${user.apiKey}', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                const result = await res.json();
                if(result.success) alert('알림창 설정이 성공적으로 저장되었습니다!');
                else alert('저장 실패');
            } catch(e) {
                console.error(e);
                alert('서버 통신 오류');
            }
        }

        async function saveMenuSettings() {
            const data = {
                textColor: document.getElementById('menuTextColor').value,
                borderColor: document.getElementById('menuBorderColor').value,
                borderWidth: document.getElementById('menuBorderWidth').value,
                fontSize: document.getElementById('menuFontSize').value,
                fontFamily: document.getElementById('menuFontFamily').value,
                effect: document.getElementById('menuEffect').value,
                scrollMode: document.getElementById('menuScrollMode').value,
                scrollInterval: document.getElementById('menuScrollInterval').value
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
            if (!e.target.closest('.user-profile-menu') && !e.target.closest('.card-menu-btn')) {
                document.getElementById('profileDropdown').classList.remove('active');
                document.querySelectorAll('.card-dropdown-menu').forEach(el => el.classList.remove('active'));
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

// 📋 메뉴판 오버레이 엔드포인트
app.get('/menu-overlay/:apiKey', async (req, res) => {
    try {
        const { apiKey } = req.params;
        const user = await User.findOne({ apiKey });
        if (!user) return res.status(404).send('Streamer not found');

        const reactions = await Reaction.find({ streamerId: user._id }).sort({ amount: 1 });
        const menuSettings = user.menuSettings || {
            textColor: '#ff2a85',
            fontSize: '24px',
            fontFamily: 'Jalnan2, sans-serif',
            effect: 'modern-glow',
            borderColor: '#000000',
            borderWidth: '0px',
            scrollMode: 'page',
            scrollInterval: 3
        };

        const bw = menuSettings.borderWidth || '0px';
        const bc = menuSettings.borderColor || '#000000';
        const tc = menuSettings.textColor;
        const effect = menuSettings.effect;
        const scrollMode = menuSettings.scrollMode || 'page';
        const intervalSec = menuSettings.scrollInterval || 3;
        
        let extraStyle = `
            -webkit-font-smoothing: antialiased;
        `;

        if (bw !== '0px' && bw !== '0') {
            extraStyle += ` -webkit-text-stroke: ${bw} ${bc}; paint-order: fill stroke;`;
        }

        if (effect === 'modern-glow') {
            extraStyle += ` text-shadow: 0 0 2px #ffffff, 0 0 8px ${tc}, 0 0 16px ${tc};`;
        } else if (effect === 'soft-shadow') {
            extraStyle += ` text-shadow: 2px 2px 5px rgba(0, 0, 0, 0.5), 0 0 10px ${tc};`;
        } else if (effect === 'clean-flat') {
            extraStyle += ` text-shadow: 1px 1px 3px rgba(0, 0, 0, 0.3);`;
        } else if (effect === 'rainbow') {
            extraStyle += ` text-shadow: 0 0 4px #ffffff, 0 0 10px #ff0055, 0 0 20px #ff9900, 0 0 30px #33ccff;`;
        } else if (effect === 'gold') {
            extraStyle += ` text-shadow: 0 0 4px #ffffff, 0 0 12px #ffd700, 2px 2px 4px rgba(0,0,0,0.9);`;
        }

        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>SelyPay Menu Overlay</title>
                <link href="https://fonts.googleapis.com/css2?family=Black+Han+Sans&family=Noto+Sans+KR:wght@700;900&display=swap" rel="stylesheet">
                <style>
                    @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css');
                    @font-face {
                        font-family: 'Jalnan2';
                        src: url('/Jalnan2TTF.ttf') format('truetype');
                        font-weight: normal;
                        font-style: normal;
                    }
                    body { background: transparent !important; margin: 0; padding: 0; overflow: hidden; font-family: ${menuSettings.fontFamily}; height: 100vh; width: 100vw; }
                    #menu-container { display: flex; flex-direction: column; gap: 10px; width: fit-content; padding: 10px; }
                    .menu-row { color: ${tc}; font-size: ${menuSettings.fontSize}; font-weight: 800; letter-spacing: -0.5px; ${extraStyle} white-space: nowrap; }
                    @keyframes scrollTicker { 0% { transform: translateY(0); } 100% { transform: translateY(-50%); } }
                    .ticker-wrapper { overflow: hidden; height: 100vh; width: 100vw; position: relative; }
                    .ticker-content { display: flex; flex-direction: column; gap: 10px; position: absolute; width: fit-content; padding: 10px; }
                </style>
            </head>
            <body>
                <div id="app"></div>
                <script>
                    const reactions = ${JSON.stringify(reactions)};
                    const mode = "${scrollMode}";
                    const intervalTime = ${intervalSec} * 1000;
                    const app = document.getElementById('app');

                    if (reactions.length === 0) {
                        app.innerHTML = '<div style="padding:10px;" class="menu-row" style="color:#aaa; font-size:16px;">등록된 리액션이 없습니다.</div>';
                    } else {
                        const rowsHTML = reactions.map(r => 
                            '<div class="menu-row">' + r.name + '<span style="display:inline-block; width: 1.5em;"></span>' + r.amount.toLocaleString() + '원</div>'
                        ).join('');

                        if (mode === 'ticker') {
                            app.className = 'ticker-wrapper';
                            app.innerHTML = '<div class="ticker-content">' + rowsHTML + rowsHTML + '</div>';
                            setTimeout(() => {
                                const content = app.querySelector('.ticker-content');
                                const totalHeight = content.scrollHeight / 2;
                                if (totalHeight > window.innerHeight) {
                                    const duration = totalHeight / 35;
                                    content.style.animation = 'scrollTicker ' + duration + 's linear infinite';
                                }
                            }, 100);
                        } else {
                            app.innerHTML = '<div id="menu-container"></div>';
                            const container = document.getElementById('menu-container');
                            let pages = [];
                            let currentPageItems = [];
                            const measureDiv = document.createElement('div');
                            measureDiv.className = 'menu-row';
                            measureDiv.style.visibility = 'hidden';
                            measureDiv.style.position = 'absolute';
                            document.body.appendChild(measureDiv);

                            function buildPages() {
                                pages = [];
                                currentPageItems = [];
                                const maxH = window.innerHeight - 20;
                                let currentH = 0;
                                const gap = 10;
                                reactions.forEach((r) => {
                                    measureDiv.innerHTML = r.name + '<span style="display:inline-block; width: 1.5em;"></span>' + r.amount.toLocaleString() + '원';
                                    const itemH = measureDiv.getBoundingClientRect().height;
                                    if (currentPageItems.length > 0 && (currentH + gap + itemH > maxH)) {
                                        pages.push(currentPageItems);
                                        currentPageItems = [r];
                                        currentH = itemH;
                                    } else {
                                        currentPageItems.push(r);
                                        currentH += (currentPageItems.length === 1 ? itemH : gap + itemH);
                                    }
                                });
                                if (currentPageItems.length > 0) pages.push(currentPageItems);
                            }

                            buildPages();
                            if (document.body.contains(measureDiv)) document.body.removeChild(measureDiv);

                            let pageIndex = 0;
                            function renderPage() {
                                if (pages.length === 0) return;
                                const items = pages[pageIndex];
                                container.innerHTML = items.map(r => 
                                    '<div class="menu-row">' + r.name + '<span style="display:inline-block; width: 1.5em;"></span>' + r.amount.toLocaleString() + '원</div>'
                                ).join('');
                                pageIndex = (pageIndex + 1) % pages.length;
                            }

                            renderPage();
                            let timer = null;
                            if (pages.length > 1) timer = setInterval(renderPage, intervalTime);

                            window.addEventListener('resize', () => {
                                if (timer) clearInterval(timer);
                                buildPages();
                                pageIndex = 0;
                                renderPage();
                                if (pages.length > 1) timer = setInterval(renderPage, intervalTime);
                            });
                        }
                    }
                </script>
            </body>
            </html>
        `);
    } catch (e) {
        res.status(500).send('Menu Overlay Error');
    }
});

// 회원가입 페이지 라우트
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

// 로그인 페이지 라우트
app.get('/login', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="ko">
        <head>
            <meta charset="UTF-8">
            <title>슬네이션 - 스트리머 로그인</title>
            <style>
                * { box-sizing: border-box; }
                body { margin: 0; padding: 0; height: 100vh; background: #f0f4f8; display: flex; justify-content: center; align-items: center; font-family: sans-serif; }
                .login-box { background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); width: 350px; text-align: center; }
                .input-group { margin-bottom: 15px; text-align: left; }
                .input-group label { display: block; font-weight: bold; margin-bottom: 5px; font-size: 13px; }
                .input-group input { width: 100%; padding: 10px; box-sizing: border-box; border: 1px solid #ddd; border-radius: 6px; }
                .login-btn { width: 100%; padding: 12px; background: #52b735; color: white; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 15px; }
            </style>
        </head>
        <body>
            <div class="login-box">
                <h2>스트리머 로그인</h2>
                <form action="/api/login" method="POST" style="margin-top: 20px;">
                    <div class="input-group">
                        <label>아이디</label>
                        <input type="text" name="username" required>
                    </div>
                    <div class="input-group">
                        <label>비밀번호</label>
                        <input type="password" name="password" required>
                    </div>
                    <button type="submit" class="login-btn">로그인</button>
                </form>
                <p style="margin-top: 15px; font-size: 13px;"><a href="/register">계정이 없으신가요? 회원가입</a></p>
            </div>
        </body>
        </html>
    `);
});

// 스트리머별 OBS 알림 오버레이 화면
app.get('/overlay/:apiKey', async (req, res) => {
    const { apiKey } = req.params;
    const user = await User.findOne({ apiKey });
    if (!user) return res.status(404).send('Streamer not found');

    const settings = user.alertSettings || {};
    const reactions = await Reaction.find({ streamerId: user._id }).sort({ amount: 1 });
    const useImage = settings.useImage !== undefined ? settings.useImage : true;
    
    const fontSize = settings.fontSize || '8vh';
    const fontFamily = settings.fontFamily || 'Jalnan2, sans-serif';
    const fontColor = settings.fontColor || '#ffffff';
    const borderColor = settings.borderColor || '#000000';
    const borderWidth = settings.borderWidth || '2px';
    const effect = settings.effect || 'letter-wave';

    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>SelyPay Alert Overlay</title>
            <style>
                @font-face {
                    font-family: 'Jalnan2';
                    src: url('/Jalnan2TTF.ttf') format('truetype');
                    font-weight: normal;
                    font-style: normal;
                }
                body { background: transparent; margin: 0; overflow: hidden; font-family: ${fontFamily}; }
                #alert-container { width: 100vw; height: 100vh; display: none; flex-direction: column; justify-content: flex-start; align-items: center; text-align: center; box-sizing: border-box; padding: 2vh 3vw; background: transparent !important; }
                #alert-image { width: 70vw; height: auto; max-width: 80%; max-height: 50vh; object-fit: contain; display: ${useImage ? 'block' : 'none'}; margin-bottom: 5vh; }
                
                @keyframes letterWave {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-16px); }
                }

                @keyframes waveBounce {
                    0%, 100% { transform: translateY(0) scale(1); }
                    50% { transform: translateY(-15px) scale(1.05); }
                }

                @keyframes glowPulse {
                    0%, 100% { text-shadow: 0 0 5px ${fontColor}, 0 0 15px ${fontColor}; }
                    50% { text-shadow: 0 0 15px ${fontColor}, 0 0 30px ${fontColor}, 0 0 40px #ffffff; }
                }

                .base-text {
                    color: ${fontColor};
                    font-weight: 800;
                    -webkit-text-stroke: ${borderWidth} ${borderColor};
                    paint-order: stroke fill;
                }

                .char-wave {
                    display: inline-block;
                    animation: letterWave 1.2s ease-in-out infinite;
                }

                .effect-bounce {
                    animation: waveBounce 1.2s ease-in-out infinite;
                    display: inline-block;
                }

                .effect-glow {
                    animation: glowPulse 2s ease-in-out infinite;
                    text-shadow: 0 0 10px ${fontColor};
                }

                .effect-rainbow {
                    text-shadow: 0 0 4px #ffffff, 0 0 10px #ff0055, 0 0 20px #ff9900, 0 0 30px #33ccff;
                }

                .effect-gold {
                    text-shadow: 0 0 4px #ffffff, 0 0 12px #ffd700, 2px 2px 4px rgba(0,0,0,0.9);
                }

                .effect-shadow {
                    text-shadow: 2px 2px 8px rgba(0,0,0,0.8);
                }

                #alert-line1 { font-size: ${fontSize}; width: 90vw; word-break: keep-all; overflow-wrap: break-word; line-height: 1.2; margin-bottom: 3vh; }
                #alert-line2 { font-size: calc(${fontSize} * 0.85); width: 90vw; word-break: break-word; line-height: 1.2; }
            </style>
        </head>
        <body>
            <div id="alert-container">
                <img id="alert-image" src="" alt="리액션 이미지" onerror="this.src='/alerticon.gif'">
                <div id="alert-line1"></div>
                <div id="alert-line2"></div>
            </div>
            <script>
            const reactions = ${JSON.stringify(reactions)};
            const defaultSound = "/${settings.soundType || 'coinsound.mp3'}";
            const defaultImage = "/alerticon.gif";
            const useImageSetting = ${useImage};
            const currentEffect = "${effect}";
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

            function formatTextWithEffect(text, effectName) {
                if (!text) return '';
                if (effectName === 'letter-wave') {
                    let charIndex = 0;
                    return text.split('').map(char => {
                        if (char === ' ') return '<span style="display:inline-block; width:0.3em;"></span>';
                        const delay = (charIndex * 0.08).toFixed(2);
                        charIndex++;
                        return '<span class="base-text char-wave" style="animation-delay: ' + delay + 's;">' + char + '</span>';
                    }).join('');
                } else {
                    let effectClass = 'effect-shadow';
                    if (effectName === 'wave-bounce') effectClass = 'effect-bounce';
                    else if (effectName === 'glow-pulse') effectClass = 'effect-glow';
                    else if (effectName === 'rainbow-neon') effectClass = 'effect-rainbow';
                    else if (effectName === 'gold-metal') effectClass = 'effect-gold';
                    else if (effectName === 'clean-shadow') effectClass = 'effect-shadow';

                    return '<span class="base-text ' + effectClass + '">' + text + '</span>';
                }
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
                
                line1.innerHTML = formatTextWithEffect(firstText, currentEffect);
                line2.innerHTML = formatTextWithEffect(secondText, currentEffect);
                
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
                
                let timerCleared = false;
                let hideTimer = null;

                function closeAlert() {
                    if (timerCleared) return;
                    timerCleared = true;
                    if (hideTimer) clearTimeout(hideTimer);
                    try { sound.pause(); } catch(e){}
                    container.style.display = 'none';
                    isPlaying = false;
                    processQueue();
                }

                const hasCustomAudio = (matchedReaction && matchedReaction.audioUrl);

                sound.onloadedmetadata = () => {
                    if (hasCustomAudio && sound.duration && !isNaN(sound.duration) && sound.duration > 0) {
                        hideTimer = setTimeout(closeAlert, sound.duration * 1000);
                    } else {
                        hideTimer = setTimeout(closeAlert, 10000);
                    }
                };

                sound.onended = () => { closeAlert(); };
                sound.onerror = () => { closeAlert(); };

                setTimeout(() => {
                    if (!timerCleared && (!hasCustomAudio || isNaN(sound.duration))) {
                        hideTimer = setTimeout(closeAlert, 10000);
                    }
                }, 200);

                sound.play().catch(e => {
                    console.log("사운드 재생 실패:", e);
                    hideTimer = setTimeout(closeAlert, 10000);
                });
            }

            setInterval(checkNewDonation, 1000);
            setInterval(checkManualPlay, 1000);
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

// 기타 API 라우트들
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

// 리액션 수정 API (PUT)
app.put('/api/reaction/:apiKey/:id', upload.fields([{ name: 'image' }, { name: 'audio' }]), async (req, res) => {
    try {
        const user = await User.findOne({ apiKey: req.params.apiKey });
        if (!user) return res.status(404).json({ success: false, error: 'Streamer not found' });
        
        const reaction = await Reaction.findOne({ _id: req.params.id, streamerId: user._id });
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
        res.json({ success: true, message: '리액션이 수정되었습니다.' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ success: false, error: e.message || 'Server Error' });
    }
});

// 리액션 삭제 API (DELETE)
app.delete('/api/reaction/:apiKey/:id', async (req, res) => {
    try {
        const user = await User.findOne({ apiKey: req.params.apiKey });
        if (!user) return res.status(404).json({ success: false, error: 'Streamer not found' });

        const result = await Reaction.findOneAndDelete({ _id: req.params.id, streamerId: user._id });
        if (!result) return res.status(404).json({ success: false, error: 'Reaction not found' });

        res.json({ success: true, message: '리액션이 삭제되었습니다.' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ success: false, error: e.message || 'Server Error' });
    }
});

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
