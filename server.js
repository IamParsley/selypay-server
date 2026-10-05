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
                            const response = await fetch('/api/logs/' +
