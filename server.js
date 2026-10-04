const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');

const app = express();

// 1. MongoDB 연결
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/selypay';
mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

// 2. 스키마 및 모델 정의
const reactionSchema = new mongoose.Schema({
    minAmount: { type: Number, required: true },
    imagePath: { type: String, required: true },
    audioPath: { type: String, required: true }
});

const userSchema = new mongoose.Schema({
    apiKey: { type: String, unique: true, required: true },
    username: { type: String, required: true },
    reactions: [reactionSchema],
    overlayX: { type: Number, default: 20 },     // X 좌표 (px)
    overlayY: { type: Number, default: 20 },     // Y 좌표 (px)
    imageWidth: { type: Number, default: 200 },  // 이미지 크기 (px)
    fontSize1: { type: Number, default: 28 },    // 첫째 줄 폰트 크기 (px)
    fontSize2: { type: Number, default: 24 }     // 둘째 줄 폰트 크기 (px)
});

const User = mongoose.model('User', userSchema);

const logSchema = new mongoose.Schema({
    apiKey: String,
    message: String,
    amount: Number,
    nickname: String,
    dateKey: String,
    datetime: { type: String, default: () => new Date().toLocaleString() }
});
const Log = mongoose.model('Log', logSchema);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// 3. 회원가입 화면
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8"><title>SelyPay 가입</title></head>
        <body style="font-family:'Malgun Gothic'; text-align:center; padding-top:50px;">
            <h2>SelyPay 스트리머 가입</h2>
            <form action="/register" method="POST">
                <input type="text" name="username" placeholder="스트리머 닉네임" required style="padding:10px; width:200px;">
                <button type="submit" style="padding:10px 20px;">가입 및 API Key 발급</button>
            </form>
        </body>
        </html>
    `);
});

app.post('/register', async (req, res) => {
    const { username } = req.body;
    const apiKey = 'sely_' + crypto.randomBytes(16).toString('hex');
    const newUser = new User({ username, apiKey, reactions: [] });
    await newUser.save();
    res.redirect(`/dashboard/${apiKey}`);
});

// 4. 대시보드 화면 (마우스 드래그 & 리사이즈 인터랙티브 편집기 포함)
app.get('/dashboard/:apiKey', async (req, res) => {
    const { apiKey } = req.params;
    const user = await User.findOne({ apiKey });
    if (!user) return res.status(404).send('Streamer not found');

    let reactionsHtml = '';
    user.reactions.forEach((r) => {
        reactionsHtml += `
            <div style="background:#fff; padding:15px; margin-bottom:10px; border-radius:8px; display:flex; justify-content:space-between; align-items:center; box-shadow:0 2px 5px rgba(0,0,0,0.1);">
                <div>
                    <b>[${r.minAmount.toLocaleString()}원 이상 후원]</b><br>
                    이미지: ${r.imagePath} | 음악: ${r.audioPath}
                </div>
                <form action="/dashboard/${apiKey}/reaction/delete" method="POST" style="margin:0;">
                    <input type="hidden" name="reactionId" value="${r._id}">
                    <button type="submit" style="background:#e74c3c; color:white; border:none; padding:8px 12px; border-radius:5px; cursor:pointer;">삭제</button>
                </form>
            </div>
        `;
    });

    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>SelyPay 대시보드 - ${user.username}</title>
            <style>
                body { background: #f4f6f9; font-family: 'Malgun Gothic', sans-serif; padding: 20px; }
                .container { max-width: 800px; margin: 0 auto; }
                .card { background: white; padding: 20px; border-radius: 10px; margin-bottom: 20px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
                input, button { padding: 10px; margin: 5px 0; border: 1px solid #ddd; border-radius: 5px; }
                button { background: #3498db; color: white; border: none; cursor: pointer; font-weight: bold; }
                
                /* 드래그 앤 리사이즈 편집기 영역 스타일 */
                #preview-workspace {
                    position: relative;
                    width: 100%;
                    height: 300px;
                    background: #222;
                    border-radius: 8px;
                    overflow: hidden;
                    border: 2px dashed #444;
                }
                #draggable-box {
                    position: absolute;
                    top: ${user.overlayY}px;
                    left: ${user.overlayX}px;
                    width: ${user.imageWidth + 50}px;
                    background: rgba(52, 152, 219, 0.85);
                    border: 2px solid #fff;
                    border-radius: 6px;
                    padding: 10px;
                    cursor: move;
                    user-select: none;
                    text-align: center;
                    color: white;
                    box-shadow: 0 4px 10px rgba(0,0,0,0.5);
                }
                #draggable-box img {
                    width: ${user.imageWidth}px;
                    height: auto;
                    display: block;
                    margin: 0 auto 8px auto;
                }
                #save-status {
                    margin-top: 10px;
                    font-size: 13px;
                    color: #27ae60;
                    font-weight: bold;
                    display: none;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="card">
                    <h2>🎬 ${user.username}님의 대시보드</h2>
                    <p><b>알림창 오버레이 주소:</b> <a href="/overlay/${apiKey}" target="_blank">/overlay/${apiKey}</a></p>
                    <p><b>랭킹판 오버레이 주소:</b> <a href="/ranking-overlay/${apiKey}" target="_blank">/ranking-overlay/${apiKey}</a></p>
                </div>

                <!-- 마우스로 직접 조절하는 오버레이 미리보기 및 위치 편집기 -->
                <div class="card">
                    <h3>🖱️ 알림창 위치 및 크기 시각적 편집기</h3>
                    <p style="font-size:13px; color:#666;">* 아래 검은 박스 안에서 파란색 알림 상자를 마우스로 **드래그하여 위치를 옮기거나**, 모서리를 조절해 보세요. 마우스를 떼면 자동 저장됩니다!</p>
                    
                    <div id="preview-workspace">
                        <div id="draggable-box">
                            <img src="/alerticon.gif" alt="Preview">
                            <div style="font-size:${user.fontSize1}px; font-weight:bold;">후원 5,000원</div>
                            <div style="font-size:${user.fontSize2}px;">홍길동님 감사합니다!</div>
                        </div>
                    </div>
                    <div id="save-status">💾 설정이 실시간 저장되었습니다!</div>
                </div>

                <div class="card">
                    <h3>✨ 금액별 리액션 설정</h3>
                    <form action="/dashboard/${apiKey}/reaction/add" method="POST">
                        <div>
                            <label>조건 금액 (원):</label><br>
                            <input type="number" name="minAmount" placeholder="예: 5000" required style="width:100%;">
                        </div>
                        <div style="margin-top:10px;">
                            <label>이미지 파일 경로:</label><br>
                            <input type="text" name="imagePath" placeholder="/alerticon.gif" required style="width:100%;">
                        </div>
                        <div style="margin-top:10px;">
                            <label>음악 파일 경로:</label><br>
                            <input type="text" name="audioPath" placeholder="/coinsound.mp3" required style="width:100%;">
                        </div>
                        <button type="submit" style="margin-top:15px; width:100%;">리액션 등록하기</button>
                    </form>
                </div>

                <div class="card">
                    <h3>📋 등록된 리액션 목록</h3>
                    ${reactionsHtml || '<p style="color:#7f8c8d;">등록된 리액션이 없습니다.</p>'}
                </div>
            </div>

            <script>
                // 마우스 드래그 및 위치 자동 저장 로직
                const box = document.getElementById('draggable-box');
                const workspace = document.getElementById('preview-workspace');
                const statusMsg = document.getElementById('save-status');
                
                let isDragging = false;
                let startX, startY;

                box.addEventListener('mousedown', (e) => {
                    isDragging = true;
                    startX = e.clientX - box.offsetLeft;
                    startY = e.clientY - box.offsetTop;
                    box.style.cursor = 'grabbing';
                });

                document.addEventListener('mousemove', (e) => {
                    if (!isDragging) return;
                    let x = e.clientX - startX;
                    let y = e.clientY - startY;

                    // 작업 영역 밖으로 나가지 않도록 제한
                    if (x < 0) x = 0;
                    if (y < 0) y = 0;

                    box.style.left = x + 'px';
                    box.style.top = y + 'px';
                });

                document.addEventListener('mouseup', () => {
                    if (!isDragging) return;
                    isDragging = false;
                    box.style.cursor = 'move';

                    // 서버로 위치 값 자동 비동기 저장 (AJAX)
                    const currentX = parseInt(box.style.left);
                    const currentY = parseInt(box.style.top);
                    const currentWidth = box.querySelector('img').clientWidth;

                    fetch('/api/settings/update/' + '${apiKey}', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ overlayX: currentX, overlayY: currentY, imageWidth: currentWidth })
                    }).then(res => res.json()).then(data => {
                        if (data.success) {
                            statusMsg.style.display = 'block';
                            setTimeout(() => { statusMsg.style.display = 'none'; }, 2000);
                        }
                    });
                });
            </script>
        </body>
        </html>
    `);
});

// 비동기 위치/크기 저장 API
app.post('/api/settings/update/:apiKey', async (req, res) => {
    const { apiKey } = req.params;
    const { overlayX, overlayY, imageWidth } = req.body;
    await User.findOneAndUpdate({ apiKey }, {
        overlayX: Number(overlayX),
        overlayY: Number(overlayY),
        imageWidth: Number(imageWidth)
    });
    res.json({ success: true });
});

// 리액션 추가 처리
app.post('/dashboard/:apiKey/reaction/add', async (req, res) => {
    const { apiKey } = req.params;
    const { minAmount, imagePath, audioPath } = req.body;
    const user = await User.findOne({ apiKey });
    if (!user) return res.status(404).send('Streamer not found');

    user.reactions.push({ minAmount: Number(minAmount), imagePath, audioPath });
    user.reactions.sort((a, b) => a.minAmount - b.minAmount);
    await user.save();

    res.redirect(`/dashboard/${apiKey}`);
});

// 리액션 삭제 처리
app.post('/dashboard/:apiKey/reaction/delete', async (req, res) => {
    const { apiKey } = req.params;
    const { reactionId } = req.body;
    const user = await User.findOne({ apiKey });
    if (!user) return res.status(404).send('Streamer not found');

    user.reactions = user.reactions.filter(r => r._id.toString() !== reactionId);
    await user.save();

    res.redirect(`/dashboard/${apiKey}`);
});

// 5. 알림 수신 API
app.post('/api/notification', async (req, res) => {
    const { apiKey, message } = req.body;
    const user = await User.findOne({ apiKey });
    if (!user) return res.json({ success: false, error: 'Invalid API Key' });

    const amountMatch = message.match(/([0-9,]+)\s*원/);
    let amount = 0;
    if (amountMatch) {
        amount = parseInt(amountMatch[1].replace(/,/g, ''), 10);
    }

    const nowKST = new Date(Date.now() + (9 * 60 * 60 * 1000));
    const dateKey = nowKST.toISOString().split('T')[0];

    const newLog = new Log({ apiKey, message, amount, dateKey });
    await newLog.save();

    res.json({ success: true });
});

// 6. 최신 로그 조회 API
app.get('/api/logs/:apiKey', async (req, res) => {
    const { apiKey } = req.params;
    const logs = await Log.find({ apiKey }).sort({ _id: -1 }).limit(1);
    const user = await User.findOne({ apiKey });
    if (!user) return res.json([]);

    let matchedReaction = { imagePath: '/alerticon.gif', audioPath: '/coinsound.mp3' };
    if (user.reactions && user.reactions.length > 0) {
        const sortedReactions = [...user.reactions].sort((a, b) => b.minAmount - a.minAmount);
        if (logs.length > 0) {
            for (let r of sortedReactions) {
                if (logs[0].amount >= r.minAmount) {
                    matchedReaction = r;
                    break;
                }
            }
        }
    }

    res.json([{
        message: logs.length > 0 ? logs[0].message : '',
        datetime: logs.length > 0 ? logs[0].datetime : '',
        imagePath: matchedReaction.imagePath,
        audioPath: matchedReaction.audioPath,
        overlayX: user.overlayX,
        overlayY: user.overlayY,
        imageWidth: user.imageWidth,
        fontSize1: user.fontSize1,
        fontSize2: user.fontSize2
    }]);
});

// 7. 스트리머별 OBS 알림 오버레이 화면
app.get('/overlay/:apiKey', async (req, res) => {
    const { apiKey } = req.params;
    const user = await User.findOne({ apiKey });
    if (!user) return res.status(404).send('Streamer not found');

    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>SelyPay Overlay</title>
            <style>
                body { background-color: transparent; margin: 0; font-family: 'Malgun Gothic', sans-serif; }
                
                #alert-container {
                    position: absolute; 
                    top: ${user.overlayY}px; 
                    left: ${user.overlayX}px; 
                    display: none; 
                    text-align: center; 
                    width: fit-content; 
                }
                
                #alert-image { 
                    width: ${user.imageWidth}px; 
                    height: auto; 
                    margin-bottom: 15px; 
                    display: block; 
                    margin-left: auto; 
                    margin-right: auto; 
                }

                #alert-line1 {
                    color: #ffffff; 
                    font-size: ${user.fontSize1}px; 
                    font-weight: bold; 
                    text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.9); 
                    white-space: nowrap;
                    margin-bottom: 8px;
                }

                #alert-line2 {
                    color: #ffffff; 
                    font-size: ${user.fontSize2}px; 
                    font-weight: bold; 
                    text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.9); 
                    white-space: nowrap;
                }
            </style>
        </head>
        <body>
            <div id="alert-container">
                <img id="alert-image" src="/alerticon.gif" alt="Alert GIF">
                <div id="alert-line1"></div>
                <div id="alert-line2"></div>
            </div>

            <audio id="alert-sound" src="/coinsound.mp3"></audio>

            <script>
                let lastCheckedTime = "";
                
                async function checkNewDonation() {
                    try {
                        const response = await fetch('/api/logs/' + '${apiKey}');
                        const logs = await response.json();
                        if (logs.length > 0 && logs[0].datetime) {
                            const latest = logs[0];
                            if (latest.datetime !== lastCheckedTime) {
                                lastCheckedTime = latest.datetime;
                                showAlert(latest);
                            }
                        }
                    } catch (e) { console.error(e); }
                }

                function showAlert(latest) {
                    const container = document.getElementById('alert-container');
                    const line1 = document.getElementById('alert-line1');
                    const line2 = document.getElementById('alert-line2');
                    const alertImg = document.getElementById('alert-image');
                    const sound = document.getElementById('alert-sound');
                                        
                    container.style.top = latest.overlayY + 'px';
                    container.style.left = latest.overlayX + 'px';
                    alertImg.style.width = latest.imageWidth + 'px';
                    line1.style.fontSize = latest.fontSize1 + 'px';
                    line2.style.fontSize = latest.fontSize2 + 'px';

                    if (latest.imagePath) alertImg.src = latest.imagePath;
                    if (latest.audioPath) sound.src = latest.audioPath;

                    let firstText = latest.message;
                    let secondText = "";
                    const newlineIdx = latest.message.indexOf('\\n');
                    if (newlineIdx !== -1) {
                        firstText = latest.message.substring(0, newlineIdx);
                        secondText = latest.message.substring(newlineIdx + 1);
                    }

                    line1.innerText = firstText;
                    line2.innerText = secondText;

                    container.style.display = 'block';
                    sound.currentTime = 0;
                    sound.play().catch(e => console.log("사운드 재생 실패:", e));

                    setTimeout(() => { 
                        container.style.display = 'none'; 
                    }, 5000);
                }

                setInterval(checkNewDonation, 1000);
            </script>
        </body>
        </html>
    `);
});

// 8. 방송용 실시간 랭킹 OBS 오버레이 화면
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
                        const response = await fetch('/api/ranking/` + apiKey + `');
                        const ranking = await response.json();
                        const container = document.getElementById('ranking-content');
                        container.innerHTML = '불러오는 중...';
                        if (!ranking || ranking.length === 0) {
                            container.innerHTML = '<div style="text-align:center; padding:10px; color:#aaa;">오늘 후원 내역이 없습니다.</div>';
                            return;
                        }
                        container.innerHTML = '';
                        ranking.forEach((item, index) => {
                            const div = document.createElement('div');
                            div.className = 'rank-item';
                            div.innerHTML = '<span class="name">' + (index + 1) + '. ' + item._id + '</span><span class="amount">' + item.totalAmount.toLocaleString() + '원</span>';
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

// 오늘의 랭킹 API
app.get('/api/ranking/:apiKey', async (req, res) => {
    const { apiKey } = req.params;
    const nowKST = new Date(Date.now() + (9 * 60 * 60 * 1000));
    const dateKey = nowKST.toISOString().split('T')[0];

    try {
        const ranking = await Log.aggregate([
            { $match: { apiKey, dateKey } },
            { $group: { _id: "$nickname", totalAmount: { $sum: "$amount" }, firstDonation: { $min: "$_id" } } },
            { $sort: { totalAmount: -1, firstDonation: 1 } },             {$limit: 5 }
        ]);
        res.json(ranking);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`SelyPay Server running on port ${PORT}`);
});
