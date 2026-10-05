const express = require('express');
const app = express();
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcrypt');

// --- 미들웨어 및 기본 설정 ---
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use(session({
    secret: 'selypay_secret_key_change_this',
    resave: false,
    saveUninitialized: false
}));

// --- 파일 업로드 설정 (Multer) ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + Buffer.from(file.originalname, 'latin1').toString('utf8'));
    }
});
const upload = multer({ storage: storage });

// --- MongoDB 연결 ---
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/selypay';
mongoose.connect(MONGO_URI)
    .then(() => console.log('MongoDB Connected'))
    .catch(err => console.error('MongoDB Connection Error:', err));

// --- Mongoose 스키마 및 모델 정의 ---
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    apiKey: { type: String, required: true, unique: true }
});
const User = mongoose.model('User', userSchema);

const donationSchema = new mongoose.Schema({
    apiKey: { type: String, required: true },
    donor: { type: String, required: true },
    amount: { type: Number, required: true },
    message: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now }
});
const Donation = mongoose.model('Donation', donationSchema);

const reactionSchema = new mongoose.Schema({
    apiKey: { type: String, required: true },
    amount: { type: Number, required: true },
    imageUrl: { type: String, default: '' },
    soundUrl: { type: String, default: '' }
});
const Reaction = mongoose.model('Reaction', reactionSchema);

const settingSchema = new mongoose.Schema({
    apiKey: { type: String, required: true, unique: true },
    useImage: { type: Boolean, default: true }
});
const Setting = mongoose.model('Setting', settingSchema);


// --- 라우터: 인증 체크 미들웨어 ---
function isAuthenticated(req, res, next) {
    if (req.session && req.session.userId) {
        return next();
    }
    res.redirect('/login');
}


// --- 1. 메인, 회원가입 / 로그인 / 로그아웃 ---
app.get('/', (req, res) => {
    res.redirect('/login'); // 메인 주소 접속 시 로그인 페이지로 이동
});

app.get('/register', (req, res) => {
    res.send(`
        <h2>회원가입</h2>
        <form action="/register" method="POST">
            <input type="text" name="username" placeholder="아이디" required><br>
            <input type="password" name="password" placeholder="비밀번호" required><br>
            <button type="submit">가입하기</button>
        </form>
        <a href="/login">로그인하기</a>
    `);
});

app.post('/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        const apiKey = 'sely_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        
        await User.create({ username, password: hashedPassword, apiKey });
        res.redirect('/login');
    } catch (e) {
        res.send('회원가입 실패 (중복된 아이디 등): ' + e.message);
    }
});

app.get('/login', (req, res) => {
    res.send(`
        <h2>로그인</h2>
        <form action="/login" method="POST">
            <input type="text" name="username" placeholder="아이디" required><br>
            <input type="password" name="password" placeholder="비밀번호" required><br>
            <button type="submit">로그인</button>
        </form>
        <a href="/register">회원가입하기</a>
    `);
});

app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username });
        if (user && await bcrypt.compare(password, user.password)) {
            req.session.userId = user._id;
            req.session.apiKey = user.apiKey;
            res.redirect('/dashboard');
        } else {
            res.send('아이디 또는 비밀번호가 틀렸습니다.');
        }
    } catch (e) {
        res.status(500).send('서버 에러');
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/login');
    });
});


// --- 2. 대시보드 및 설정 관리 ---
app.get('/dashboard', isAuthenticated, async (req, res) => {
    const user = await User.findById(req.session.userId);
    const reactions = await Reaction.find({ apiKey: user.apiKey }).sort({ amount: 1 });
    const setting = await Setting.findOne({ apiKey: user.apiKey }) || { useImage: true };

    res.send(`
        <h1>대시보드</h1>
        <p>환영합니다, <b>${user.username}</b>님! | <a href="/logout">로그아웃</a></p>
        
        <hr>
        <h3>나의 고유 API Key</h3>
        <p><code>${user.apiKey}</code></p>
        <p><b>오버레이 주소:</b> <a href="/overlay/${user.apiKey}" target="_blank">/overlay/${user.apiKey}</a></p>

        <hr>
        <h3>후원 알림 설정</h3>
        <form action="/api/settings" method="POST">
            <label>
                <input type="checkbox" name="useImage" ${setting.useImage ? 'checked' : ''}> 기본 알림 이미지 사용
            </label><br>
            <button type="submit">설정 저장</button>
        </form>

        <hr>
        <h3>금액별 리액션(이미지/사운드) 추가</h3>
        <form action="/api/reactions" method="POST" enctype="multipart/form-data">
            <input type="number" name="amount" placeholder="최소 후원 금액 (원)" required><br>
            이미지 파일: <input type="file" name="image" accept="image/*"><br>
            사운드 파일: <input type="file" name="sound" accept="audio/*"><br>
            <button type="submit">리액션 추가</button>
        </form>

        <h3>등록된 리액션 목록</h3>
        <ul>
            ${reactions.map(r => `
                <li>
                    ${r.amount}원 이상 - 
                    이미지: ${r.imageUrl ? `<a href="${r.imageUrl}" target="_blank">보기</a>` : '없음'} | 
                    사운드: ${r.soundUrl ? `<a href="${r.soundUrl}" target="_blank">듣기</a>` : '없음'}
                    <form action="/api/reactions/delete/${r._id}" method="POST" style="display:inline;">
                        <button type="submit">삭제</button>
                    </form>
                </li>
            `).join('')}
        </ul>
    `);
});

// 설정 저장 API
app.post('/api/settings', isAuthenticated, async (req, res) => {
    const useImage = req.body.useImage === 'on';
    await Setting.findOneAndUpdate(
        { apiKey: req.session.apiKey },
        { useImage },
        { upsert: true, new: true }
    );
    res.redirect('/dashboard');
});

// 리액션 추가 API
app.post('/api/reactions', isAuthenticated, upload.fields([{ name: 'image', maxCount: 1 }, { name: 'sound', maxCount: 1 }]), async (req, res) => {
    const { amount } = req.body;
    let imageUrl = '';
    let soundUrl = '';

    if (req.files['image']) {
        imageUrl = `/uploads/${req.files['image'][0].filename}`;
    }
    if (req.files['sound']) {
        soundUrl = `/uploads/${req.files['sound'][0].filename}`;
    }

    await Reaction.create({
        apiKey: req.session.apiKey,
        amount: Number(amount),
        imageUrl,
        soundUrl
    });

    res.redirect('/dashboard');
});

// 리액션 삭제 API
app.post('/api/reactions/delete/:id', isAuthenticated, async (req, res) => {
    await Reaction.findOneAndDelete({ _id: req.params.id, apiKey: req.session.apiKey });
    res.redirect('/dashboard');
});


// --- 3. 외부 API (후원 전송 및 조회, 랭킹) ---

// 후원 데이터 전송 API (외부에서 호출)
app.post('/api/donate/:apiKey', async (req, res) => {
    try {
        const apiKey = req.params.apiKey;
        const user = await User.findOne({ apiKey });
        if (!user) return res.status(404).json({ success: false, message: 'Invalid API Key' });

        const { donor, amount, message } = req.body;
        if (!donor || !amount) {
            return res.status(400).json({ success: false, message: 'Missing donor or amount' });
        }

        const donation = await Donation.create({
            apiKey,
            donor,
            amount: Number(amount),
            message: message ? String(message).trim() : ''
        });

        res.json({ success: true, donation });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 후원 로그 목록 조회 API (오버레이 및 대시보드용)
app.get('/api/logs/:apiKey', async (req, res) => {
    try {
        const logs = await Donation.find({ apiKey: req.params.apiKey }).sort({ createdAt: -1 }).limit(20);
        res.json(logs);
    } catch (e) {
        res.status(500).json([]);
    }
});

// 리액션 설정 정보 조회 API (오버레이용)
app.get('/api/reactions/:apiKey', async (req, res) => {
    try {
        const apiKey = req.params.apiKey;
        const reactions = await Reaction.find({ apiKey }).sort({ amount: -1 });
        const setting = await Setting.findOne({ apiKey });
        res.json({
            success: true,
            reactions,
            defaultAlert: setting ? { useImage: setting.useImage } : { useImage: true }
        });
    } catch (e) {
        res.json({ success: false, reactions: [] });
    }
});

// 실시간 후원 랭킹 API
app.get('/api/ranking/:apiKey', async (req, res) => {
    try {
        const ranking = await Donation.aggregate([
            { $match: { apiKey: req.params.apiKey } },
            { $group: { _id: '$donor', totalAmount: { $sum: '$amount' } } },
            { $sort: { totalAmount: -1 } },             {$limit: 10 }
        ]);
        res.json(ranking);
    } catch (e) {
        res.status(500).json([]);
    }
});


// --- 4. OBS 오버레이 화면 (실시간 알림창) ---
app.get('/overlay/:apiKey', async (req, res) => {
    const apiKeyVal = req.params.apiKey;
    const user = await User.findOne({ apiKey: apiKeyVal });
    if (!user) return res.status(404).send('Not found');
    
    res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>html,body{width:100%;height:100%;margin:0;background:transparent!important;font-family:sans-serif;overflow:hidden;}#alert-container{width:100vw;height:100vh;display:none;flex-direction:column;justify-content:center;align-items:center;text-align:center;}#alert-image{height:35vh;max-width:80vw;object-fit:contain;margin-bottom:1.5vh;display:block;}#alert-line1,#alert-line2{color:#fff;font-size:7vh;font-weight:800;text-shadow:-2px -2px 0 #000,2px -2px 0 #000,-2px 2px 0 #000,2px 2px 0 #000;width:90vw;word-break:break-word;}</style></head><body><div id="alert-container"><img id="alert-image" src="/alerticon.gif"><div id="alert-line1"></div><div id="alert-line2"></div></div><audio id="alert-sound" crossorigin="anonymous"></audio><script>
        let lastCount = -1;
        let hideTimeout = null;

        async function check() {
            try {
                const response = await fetch('/api/logs/' + '${apiKeyVal}');
                const logs = await response.json();
                if(logs) {
                    const currentCount = logs.length;
                    
                    if(lastCount === -1) {
                        lastCount = currentCount;
                        return;
                    }

                    if(currentCount > lastCount) {
                        lastCount = currentCount;
                        const latest = logs[0];
                        trigger(latest);
                    } else if(currentCount < lastCount) {
                        lastCount = currentCount;
                    }
                }
            } catch(e) {}
        }

        async function trigger(d) {
            let img = "/alerticon.gif", sound = "/coinsound.mp3";
            let useImage = true;
            try {
                const response = await fetch('/api/reactions/' + '${apiKeyVal}');
                const data = await response.json();
                if(data.success) {
                    if(data.defaultAlert && data.defaultAlert.useImage === false) {
                        useImage = false;
                    }
                    if(data.reactions && data.reactions.length > 0) {
                        const m = data.reactions.sort((a,b)=>b.amount-a.amount).find(r=>d.amount>=r.amount);
                        if(m){ 
                            img = m.imageUrl || "/alerticon.gif"; 
                            sound = m.soundUrl && m.soundUrl.trim() !== "" ? m.soundUrl : "/coinsound.mp3"; 
                        }
                    }
                }
            } catch(e) {}
            
            const line1Text = String(d.donor || '') + "님 " + String(d.amount || 0) + "원 후원!";
            const line2Text = String(d.message || '');
            showAlert(line1Text, line2Text, useImage ? img : "", sound);
        }

        function showAlert(l1Text, l2Text, imgUrl, soundUrl) {
            const c = document.getElementById('alert-container');
            const img = document.getElementById('alert-image');
            const l1 = document.getElementById('alert-line1');
            const l2 = document.getElementById('alert-line2');
            const s = document.getElementById('alert-sound');

            if(hideTimeout) clearTimeout(hideTimeout);
            s.pause(); s.currentTime = 0;
            
            l1.innerText = l1Text; 
            l2.innerText = l2Text; 
            
            if(imgUrl && imgUrl.trim() !== "") {
                img.src = imgUrl;
                img.style.display = 'block';
            } else {
                img.src = "";
                img.style.display = 'none';
            }

            c.style.display = 'flex';
            
            if(soundUrl && soundUrl.trim() !== "") {
                s.src = soundUrl; 
                s.load();
                s.play().catch(e => {});
            }

            hideTimeout = setTimeout(() => { 
                c.style.display = 'none'; 
            }, 7000);
        }

        document.body.addEventListener('click', () => {
            const s = document.getElementById('alert-sound');
            s.play().catch(()=>{});
        });

        setInterval(check, 1000);
    </script></body></html>`);
});

// --- 서버 실행 ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
