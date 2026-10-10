const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// MongoDB 연결 설정
// mongoose.connect(process.env.MONGO_URI);

// Supabase 설정
const SUPABASE_URL = process.env.SUPABASE_URL || 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'YOUR_SUPABASE_ANON_KEY';
const STORAGE_BUCKET = process.env.STORAGE_BUCKET || 'reactions';

const upload = multer({ storage: multer.memoryStorage() });

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Mongoose 스키마 정의
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

// 리액션 설정 스키마 및 모델 (name 및 timestamp 포함)
const reactionSchema = new mongoose.Schema({
    streamerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, default: "" },
    amount: { type: Number, default: 0 },
    imageUrl: { type: String, default: "" },
    audioUrl: { type: String, default: "" },
    timestamp: { type: Date, default: Date.now }
});
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
        res.send(`<script>alert('회원가입 성공!'); location.href = '/login';</script>`);
    } catch (e) {
        res.send(`<script>alert('회원가입 실패 (중복된 아이디)'); history.back();</script>`);
    }
});

// 로그인 페이지
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
                <p style="text-align:center; margin-top:15px;"><a href="/register" style="color:#ff4757; text-decoration:none;">회원가입</a></p>
            </div>
        </body>
        </html>
    `);
});

// 로그인 성공 시 고유 대시보드 URL로 리다이렉트 처리
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username, password });
        if (!user) {
            return res.send(`<script>alert('아이디 또는 비밀번호가 틀렸습니다.'); history.back();</script>`);
        }
        res.redirect('/dashboard/' + user.apiKey);
    } catch (e) {
        res.status(500).send('Server Error');
    }
});

// 대시보드 전용 페이지
app.get('/dashboard/:apiKey', async (req, res) => {
    try {
        const user = await User.findOne({ apiKey: req.params.apiKey });
        if (!user) return res.status(404).send('Streamer not found');

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
                    .btn-group { display: flex; gap: 10px; margin-top: 8px; }
                    .btn { flex: 1; padding: 8px 12px; background: #3498db; color: white; text-align: center; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 13px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h2>환영합니다, ${user.username}님! 🎉</h2>
                    <p><b>고유 API Key:</b></p>
                    <div class="box">${user.apiKey}</div>
                    
                    <p style="margin-top:20px;"><b>알림창 오버레이 주소:</b></p>
                    <div class="box">https://${req.get('host')}/overlay/${user.apiKey}</div>
                    <div class="btn-group">
                        <a href="/manage/alert/${user.apiKey}" class="btn" target="_blank">⚙ 알림창 및 리액션 관리 가기</a>
                    </div>

                    <p style="margin-top:20px;"><b>랭킹판 오버레이 주소:</b></p>
                    <div class="box">https://${req.get('host')}/ranking-overlay/${user.apiKey}</div>
                    <div class="btn-group">
                        <a href="/manage/ranking/${user.apiKey}" class="btn" target="_blank" style="background:#e67e22;">⚙️ 랭킹판 관리 가기</a>
                    </div>

                    <p style="margin-top:30px;"><b>🏆 계좌후원 랭킹</b></p>
                    <div class="log-box" id="rankingList"><div class="log-item">불러오는 중...</div></div>
                    
                    <p style="margin-top:30px;"><b>📋 최근 후원 내역</b></p>
                    <div class="log-box" id="donationLogList"><div class="log-item">불러오는 중...</div></div>

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
                                logContainer.innerHTML = '<div class="log-item">내역이 없습니다.</div>';
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
                            const response = await fetch('/api/ranking/${user.apiKey}');
                            const ranking = await response.json();
                            const rankContainer = document.getElementById('rankingList');
                            rankContainer.innerHTML = '';
                            if (!ranking || ranking.length === 0) {
                                rankContainer.innerHTML = '<div class="log-item">내역이 없습니다.</div>';
                                return;
                            }
                            ranking.forEach((item, index) => {
                                const div = document.createElement('div');
                                div.className = 'log-item';
                                div.innerHTML = '<b>' + (index + 1) + '위</b> ' + item._id + '님 - ' + item.totalamount.toLocaleString() + '원';
                                rankContainer.appendChild(div);
                            });
                        } catch (e) { console.error(e); }
                    }
                    fetchDonationLogs();
                    fetchRanking();
                </script>
            </body>
            </html>
        `);
    } catch (e) {
        res.status(500).send('Server Error');
    }
});

// 알림 수신 API
app.post('/api/notification', async (req, res) => {
    const { apiKey, message } = req.body;
    if (!apiKey || !message) return res.status(400).json({ success: false });

    try {
        const user = await User.findOne({ apiKey });
        if (!user) return res.status(401).json({ success: false });

        let amount = 0;
        const amountMatch = message.match(/([0-9,]+)\s*원/);
        if (amountMatch) amount = parseInt(amountMatch[1].replace(/,/g, ''), 10);

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
        res.status(500).json({ success: false });
    }
});

// OBS 알림 오버레이
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
                html, body { width: 100%; height: 100%; margin: 0; background: transparent !important; overflow: hidden; font-family: sans-serif; }
                #alert-container { width: 100vw; height: 100vh; display: none; flex-direction: column; justify-content: center; align-items: center; text-align: center; }
                #alert-image { max-height: 35vh; width: auto; display: ${useImage ? 'block' : 'none'}; margin-bottom: 1.5vh; }
                #alert-line1 { color: #fff; font-size: ${settings.fontSize || '7.5vh'}; font-weight: 800; text-shadow: 2px 2px #000; }
                #alert-line2 { color: #fff; font-size: 6.5vh; font-weight: 800; text-shadow: 2px 2px #000; }
            </style>
        </head>
        <body>
            <div id="alert-container">
                <img id="alert-image" src="/alerticon.gif" alt="Alert">
                <div id="alert-line1"></div>
                <div id="alert-line2"></div>
            </div>
            <script>
                const reactions = ${JSON.stringify(reactions)};
                const defaultSound = "/${settings.soundType || 'coinsound.mp3'}";
                let lastCheckedTime = "";
                
                async function checkNewDonation() {
                    try {
                        const response = await fetch('/api/logs/${apiKey}');
                        const logs = await response.json();
                        if (logs.length > 0) {
                            const latest = logs[0];
                            if (latest.datetime !== lastCheckedTime) {
                                lastCheckedTime = latest.datetime;
                                showAlert(latest);
                            }
                        }
                    } catch (e) { }
                }

                function showAlert(donation) {
                    const container = document.getElementById('alert-container');
                    const imgElement = document.getElementById('alert-image');
                    const line1 = document.getElementById('alert-line1');
                    
                    line1.innerText = donation.message;
                    const matched = reactions.find(r => r.amount === donation.amount);
                    if (matched && matched.imageUrl) imgElement.src = matched.imageUrl;
                    
                    const audioSrc = (matched && matched.audioUrl) ? matched.audioUrl : defaultSound;
                    const sound = new Audio(audioSrc);
                    container.style.display = 'flex';
                    sound.play().catch(e => {});

                    setTimeout(() => { container.style.display = 'none'; }, 5000);
                }
                setInterval(checkNewDonation, 1000);
            </script>
        </body>
        </html>
    `);
});

// 리액션 목록 조회 API
app.get('/api/reactions/:apiKey', async (req, res) => {
    try {
        const user = await User.findOne({ apiKey: req.params.apiKey });
        if (!user) return res.status(404).json([]);
        const reactions = await Reaction.find({ streamerId: user._id }).sort({ timestamp: -1 });
        res.json(reactions);
    } catch (e) {
        res.status(500).json([]);
    }
});

// 리액션 등록 및 수정 API
app.post('/api/reactions/:apiKey', upload.fields([{ name: 'image' }, { name: 'audio' }]), async (req, res) => {
    try {
        const user = await User.findOne({ apiKey: req.params.apiKey });
        if (!user) return res.status(404).json({ success: false, error: 'Streamer not found' });

        const { reactionId, name, amount } = req.body;
        const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        let imageUrl, audioUrl;

        if (req.files && req.files['image']) {
            const file = req.files['image'][0];
            const imgName = 'img_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7) + '.' + file.originalname.split('.').pop();
            await supabaseClient.storage.from(STORAGE_BUCKET).upload(imgName, file.buffer, { contentType: file.mimetype });
            imageUrl = supabaseClient.storage.from(STORAGE_BUCKET).getPublicUrl(imgName).data.publicUrl;
        }

        if (req.files && req.files['audio']) {
            const file = req.files['audio'][0];
            const audioName = 'audio_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7) + '.' + file.originalname.split('.').pop();
            await supabaseClient.storage.from(STORAGE_BUCKET).upload(audioName, file.buffer, { contentType: file.mimetype });
            audioUrl = supabaseClient.storage.from(STORAGE_BUCKET).getPublicUrl(audioName).data.publicUrl;
        }

        if (reactionId) {
            const updateData = { name, amount: Number(amount), timestamp: new Date() };
            if (imageUrl) updateData.imageUrl = imageUrl;
            if (audioUrl) updateData.audioUrl = audioUrl;
            await Reaction.findOneAndUpdate({ _id: reactionId, streamerId: user._id }, { $set: updateData });
            res.json({ success: true, message: '리액션이 성공적으로 수정되었습니다!' });
        } else {
            const newReaction = new Reaction({
                streamerId: user._id,
                name,
                amount: Number(amount),
                imageUrl: imageUrl || "",
                audioUrl: audioUrl || "",
                timestamp: new Date()
            });
            await newReaction.save();
            res.json({ success: true, message: '리액션이 성공적으로 등록되었습니다!' });
        }
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 알림창 관리 페이지 (가로 4개 그리드, 이름·금액·사진 및 정렬 기능 포함)
app.get('/manage/alert/:apiKey', async (req, res) => {
    const { apiKey } = req.params;
    const user = await User.findOne({ apiKey });
    if (!user) return res.status(404).send('Streamer not found');

    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>알림창 관리 - ${user.username}</title>
            <style>
                body { font-family: sans-serif; background: #f4f7f6; padding: 40px; margin: 0; }
                .container { max-width: 900px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                .box { background: #eee; padding: 10px; font-family: monospace; word-break: break-all; border-radius: 5px; margin-top: 5px; }
                .form-group { margin-bottom: 15px; }
                .form-group label { display: block; font-weight: bold; margin-bottom: 5px; }
                .form-group input { width: 100%; padding: 8px; box-sizing: border-box; border: 1px solid #ddd; border-radius: 4px; }
                .btn { display: inline-block; padding: 10px 15px; background: #3498db; color: white; border: none; border-radius: 5px; font-weight: bold; cursor: pointer; text-decoration: none; }
                .sort-bar { display: flex; justify-content: space-between; align-items: center; margin-top: 25px; margin-bottom: 15px; }
                .reaction-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; }
                .reaction-card { background: #fafafa; border: 1px solid #ddd; padding: 12px; border-radius: 8px; text-align: center; display: flex; flex-direction: column; justify-content: space-between; }
                .reaction-card img { width: 100%; height: 90px; object-fit: contain; background: #222; border-radius: 4px; margin-bottom: 8px; }
                .reaction-card h5 { margin: 5px 0; font-size: 15px; }
                .reaction-card p { margin: 5px 0; font-size: 13px; color: #555; }
                .btn-edit { background: #f39c12; color: white; width: 100%; padding: 5px; border: none; border-radius: 4px; font-weight: bold; cursor: pointer; margin-top: 8px; }
            </style>
        </head>
        <body>
            <div class="container">
                <h2>🔔 알림창 및 후원 리액션 관리</h2>
                <p>OBS 주소:</p>
                <div class="box">https://${req.get('host')}/overlay/${user.apiKey}</div>

                <hr style="margin: 25px 0; border:0; border-top:1px solid #ddd;">
                
                <h3 id="formTitle">🎨 커스텀 리액션 등록</h3>
                <form id="reactionForm">
                    <input type="hidden" id="reactionId">
                    <div class="form-group">
                        <label>리액션 이름</label>
                        <input type="text" id="reactionName" placeholder="예: 폭죽 리액션" required>
                    </div>
                    <div class="form-group">
                        <label>특정 후원 금액 (원)</label>
                        <input type="number" id="amount" placeholder="예: 9999" required>
                    </div>
                    <div class="form-group">
                        <label>이미지 파일</label>
                        <input type="file" id="imageFile" accept="image/*">
                    </div>
                    <div class="form-group">
                        <label>오디오 파일</label>
                        <input type="file" id="audioFile" accept="audio/*">
                    </div>
                    <button type="button" id="uploadBtn" class="btn" style="background:#2ed573;">리액션 등록하기</button>
                    <button type="button" id="cancelEditBtn" class="btn" style="background:#7f8c8d; display:none;">수정 취소</button>
                </form>

                <div class="sort-bar">
                    <h4 style="margin:0;">📋 리액션 목록</h4>
                    <select id="sortSelect" class="btn" style="background:#fff; color:#333; border:1px solid #ddd; padding:5px;">
                        <option value="latest">최신순</option>
                        <option value="high">가격 높은순</option>
                        <option value="low">가격 낮은순</option>
                    </select>
                </div>
                
                <div id="reactionList" class="reaction-grid"><div style="color:#666; grid-column: span 4;">불러오는 중...</div></div>
                <br><br>
                <a href="/dashboard/${user.apiKey}" class="btn" style="background:#7f8c8d;">대시보드로 돌아가기</a>
            </div>

            <script>
                const currentApiKey = "${apiKey}";
                let globalReactions = [];

                async function loadReactions() {
                    try {
                        const res = await fetch('/api/reactions/' + currentApiKey);
                        globalReactions = await res.json();
                        renderReactions();
                    } catch (e) { console.error(e); }
                }

                function renderReactions() {
                    const container = document.getElementById('reactionList');
                    container.innerHTML = '';
                    if (!globalReactions || globalReactions.length === 0) {
                        container.innerHTML = '<div style="color:#666; grid-column: span 4; text-align:center;">등록된 리액션이 없습니다.</div>';
                        return;
                    }

                    const sortType = document.getElementById('sortSelect').value;
                    let sorted = [...globalReactions];
                    if (sortType === 'high') sorted.sort((a, b) => b.amount - a.amount);
                    else if (sortType === 'low') sorted.sort((a, b) => a.amount - b.amount);
                    else sorted.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));

                    sorted.forEach(r => {
                        const card = document.createElement('div');
                        card.className = 'reaction-card';
                        const imgSrc = r.imageUrl ? r.imageUrl : '/alerticon.gif';
                        card.innerHTML = \`
                            <div>
                                <img src="\${imgSrc}" alt="이미지">
                                <h5>\${r.name || '이름 없음'}</h5>
                                <p><b>\${r.amount.toLocaleString()}원</b></p>
                            </div>
                            <button class="btn-edit" onclick="editReaction('\${r._id}')">수정</button>
                        \`;
                        container.appendChild(card);
                    });
                }

                document.getElementById('sortSelect').addEventListener('change', renderReactions);

                function editReaction(id) {
                    const target = globalReactions.find(r => r._id === id);
                    if (!target) return;
                    document.getElementById('reactionId').value = target._id;
                    document.getElementById('reactionName').value = target.name || '';
                    document.getElementById('amount').value = target.amount;
                    document.getElementById('formTitle').innerText = '✏️ 리액션 수정하기';
                    document.getElementById('uploadBtn').innerText = '수정사항 저장하기';
                    document.getElementById('cancelEditBtn').style.display = 'inline-block';
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                }

                document.getElementById('cancelEditBtn').addEventListener('click', () => {
                    document.getElementById('reactionForm').reset();
                    document.getElementById('reactionId').value = '';
                    document.getElementById('formTitle').innerText = '🎨 커스텀 리액션 등록';
                    document.getElementById('uploadBtn').innerText = '리액션 등록하기';
                    document.getElementById('cancelEditBtn').style.display = 'none';
                });

                document.getElementById('uploadBtn').addEventListener('click', async () => {
                    const reactionId = document.getElementById('reactionId').value;
                    const name = document.getElementById('reactionName').value;
                    const amount = document.getElementById('amount').value;
                    const imageInput = document.getElementById('imageFile').files[0];
                    const audioInput = document.getElementById('audioFile').files[0];

                    if (!name || !amount) {
                        alert('이름과 금액을 입력해주세요.');
                        return;
                    }

                    const formData = new FormData();
                    if (reactionId) formData.append('reactionId', reactionId);
                    formData.append('name', name);
                    formData.append('amount', amount);
                    if (imageInput) formData.append('image', imageInput);
                    if (audioInput) formData.append('audio', audioInput);

                    try {
                        const res = await fetch('/api/reactions/' + currentApiKey, { method: 'POST', body: formData });
                        const result = await res.json();
                        if (result.success) {
                            alert(result.message);
                            document.getElementById('cancelEditBtn').click();
                            loadReactions();
                        } else {
                            alert('실패: ' + result.error);
                        }
                    } catch (err) {
                        alert('오류가 발생했습니다.');
                    }
                });

                loadReactions();
            </script>
        </body>
        </html>
    `);
});

// 로그 및 랭킹 API
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
        const todayKey = getKSTDateKey();
        const todayDonations = await Donation.find({ streamerId: user._id, dateKey: todayKey });
        const rankingMap = {};
        todayDonations.forEach(d => {
            let name = d.nickname.trim();
            if (name.endsWith("님")) name = name.slice(0, -1).trim();
            if (!rankingMap[name]) rankingMap[name] = { totalamount: 0, count: 0 };
            rankingMap[name].totalamount += d.amount;
        });
        const rankingList = Object.keys(rankingMap).map(name => ({
            _id: name,
            totalamount: rankingMap[name].totalamount
        })).sort((a, b) => b.totalamount - a.totalamount);
        res.json(rankingList.slice(0, 5));
    } catch (e) { res.status(500).json([]); }
});

app.get('/ranking-overlay/:apiKey', async (req, res) => {
    const { apiKey } = req.params;
    const user = await User.findOne({ apiKey });
    if (!user) return res.status(404).send('Streamer not found');
    res.send(`
        <!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8"><style>body{background:transparent;color:white;font-family:sans-serif;}</style></head>
        <body>
            <div style="background:rgba(0,0,0,0.75);padding:15px;border-radius:10px;">
                <h3 style="margin:0 0 10px 0;color:#f1c40f;">🏆 랭킹</h3>
                <div id="ranking-content">로딩중...</div>
            </div>
            <script>
                async function fetchOverlayRanking() {
                    const res = await fetch('/api/ranking/${apiKey}');
                    const ranking = await res.json();
                    const container = document.getElementById('ranking-content');
                    container.innerHTML = ranking.map((item, idx) => '<div>' + (idx+1) + '. ' + item._id + ' (' + item.totalamount.toLocaleString() + '원)</div>').join('');
                }
                fetchOverlayRanking();
                setInterval(fetchOverlayRanking, 5000);
            </script>
        </body>
        </html>
    `);
});

app.get('/manage/ranking/:apiKey', async (req, res) => {
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
                <div class="box">https://${req.get('host')}/ranking-overlay/${user.apiKey}</div>
                <br>
                <a href="/dashboard/${user.apiKey}" class="btn" style="background:#7f8c8d;">대시보드로 돌아가기</a>
            </div>
        </body>
        </html>
    `);
});

// 서버 구동
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
