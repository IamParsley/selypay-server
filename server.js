const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const crypto = require('crypto');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname)); // 현재 폴더의 이미지 파일(image_43fa16.jpg 등)을 웹에서 바로 읽을 수 있게 설정

const upload = multer({ storage: multer.memoryStorage() });

// 1. MongoDB 연결
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('✅ MongoDB Atlas 연결 성공!'))
    .catch((err) => console.error('❌ MongoDB 연결 에러:', err));

// 사용자 모델 정의 (기존 코드 연동용)
const User = mongoose.model('User', new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    apiKey: { type: String, required: true },
    alertSettings: Object
}));

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

// ==========================================
// 🌲 로그인 페이지 (제공해주신 통 이미지 + 투명 입력창 오버레이 적용)
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
                    /* 업로드하신 이미지를 전체 배경으로 깔아줍니다 */
                    background: url('login_sample.png') no-repeat center center/cover;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif;
                }

                /* 이미지 내부의 나무 팻말 입력 칸 위치에 정확히 맞물리도록 조절하는 박스 */
                .login-form-overlay {
                    position: relative;
                    width: 300px;  /* 이미지 속 입력칸 너비와 맞춤 */
                    margin-top: 55px; /* 고양이와 상단 타이틀 밑 실제 입력칸 위치로 오프셋 */
                    margin-left: 2px;
                }

                .input-group {
                    margin-bottom: 22px; /* 아이디와 비밀번호 입력창 사이 간격 */
                }

                /* 실제 입력되는 투명 입력창 (이미지 안의 그래픽 칸 위에 정확히 포개짐) */
                .input-group input {
                    width: 100%;
                    height: 40px;
                    padding: 0 12px;
                    background: transparent;
                    border: none;
                    color: #2ed573; /* 입력되는 텍스트 색상 (네온 그린) */
                    font-size: 16px;
                    font-weight: bold;
                    outline: none;
                }

                .input-group input::placeholder {
                    color: rgba(46, 213, 115, 0.3);
                }

                /* 로그인 버튼 (이미지 안의 '로그인' 버튼 그래픽 영역을 덮음) */
                .login-btn {
                    width: 100%;
                    height: 44px;
                    background: transparent;
                    border: none;
                    cursor: pointer;
                    margin-top: 5px;
                }

                /* 하단 링크 영역 ('비밀번호를 잊으셨나요?', '회원가입') */
                .links {
                    margin-top: 25px;
                    text-align: center;
                    font-size: 12px;
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                }

                .links a {
                    color: #a4b0be;
                    text-decoration: none;
                    transition: color 0.2s;
                }

                .links a:hover {
                    color: #2ed573;
                    text-decoration: underline;
                }
            </style>
        </head>
        <body>
            <div class="login-form-overlay">
                <form action="/api/login" method="POST">
                    <!-- 아이디 입력칸 -->
                    <div class="input-group">
                        <input type="text" id="username" name="username" required>
                    </div>

                    <!-- 비밀번호 입력칸 -->
                    <div class="input-group">
                        <input type="password" id="password" name="password" required>
                    </div>

                    <!-- 로그인 버튼 -->
                    <button type="submit" class="login-btn"></button>
                </form>

                <!-- 하단 링크 -->
                <div class="links">
                    <a href="/forgot-password">비밀번호를 잊으셨나요?</a>
                    <div>계정이 없으신가요? <a href="/register">회원가입</a></div>
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
                    .btn { display: inline-block; margin-top: 15px; padding: 10px 15px; background: #3498db; color: white; text-decoration: none; border-radius: 5px; font-weight: bold; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h2>환영합니다, ` + user.username + `님! 🎉</h2>
                    <p><b>고유 API Key:</b></p>
                    <div class="box">` + user.apiKey + `</div>
                    <a href="/login" class="btn" style="background:#e74c3c;">로그아웃</a>
                </div>
            </body>
            </html>
        `);
    } catch (e) {
        res.status(500).send('Server Error');
    }
});

// 서버 구동
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
