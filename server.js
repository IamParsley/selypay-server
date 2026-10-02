const express = require('express');
const bodyParser = require('body-parser');
const app = express();
const PORT = process.env.PORT || 3000;

// 미들웨어 설정
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// 최근 후원 내역을 저장할 배열 (메모리 저장)
let donationLogs = [];

// 1. 기본 홈 루트 (서버 살아있는지 확인용)
app.get('/', (req, res) => {
    res.send('SelyPay Server is Running');
});

// 2. 안드로이드 앱에서 알림을 받아오는 POST 엔드포인트
app.post('/api/notification', (req, res) => {
    const message = req.body.message;
    
    if (!message) {
        return res.status(400).json({ success: false, error: 'Message is empty' });
    }

    console.log("받은 원본 메시지:", message);

    // [수정된 금액 추출 로직] 메시지 안에서 "숫자 + 원" 패턴을 정확히 캐치
    let amount = 0;
    const amountMatch = message.match(/([0-9,]+)\s*원/);
    if (amountMatch) {
        // 콤마(,) 제거 후 숫자로 변환 (예: "1,000" -> 1000, "1" -> 1)
        amount = parseInt(amountMatch[1].replace(/,/g, ''), 10);
    }

    // 닉네임 추출 (예: "이서현님 1원..." 형태에서 이름 추출)
    let nickname = "익명";
    if (message.includes("님")) {
        nickname = message.split("님")[0].trim();
    }

        // 한국 시간(Asia/Seoul) 기준으로 시간 포맷팅
    const now = new Date();
    const timeString = now.toLocaleTimeString('ko-KR', { 
        timeZone: 'Asia/Seoul', 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit' 
    });

    // 관리자/오버레이에서 쓸 데이터 객체 생성
    const donationData = {
        time: timeString,
        message: message,
        nickname: nickname,
        amount: amount
    };

    // 최신 후원 내역을 배열 앞에 추가 (최대 20개 유지)
    donationLogs.unshift(donationData);
    if (donationLogs.length > 20) {
        donationLogs.pop();
    }

    console.log("파싱된 후원 정보:", donationData);

    res.status(200).json({ success: true, data: donationData });
});

// 3. OBS 오버레이 화면 (최신 후원을 화면에 띄워줌)
app.get('/overlay', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>SelyPay Overlay</title>
            <style>
                body { background-color: transparent; margin: 0; font-family: 'Malgun Gothic', sans-serif; }
                #alert-box {
                    position: absolute;
                    bottom: 50px;
                    left: 50px;
                    background: rgba(0, 0, 0, 0.8);
                    color: white;
                    padding: 20px 30px;
                    border-radius: 15px;
                    font-size: 28px;
                    font-weight: bold;
                    display: none;
                    box-shadow: 0 4px 15px rgba(0,0,0,0.5);
                    border: 2px solid #ff4757;
                }
            </style>
        </head>
        <body>
            <div id="alert-box"></div>
            <script>
                let lastCheckedTime = "";

                async function checkNewDonation() {
                    try {
                        const response = await fetch('/api/logs');
                        const logs = await response.json();
                        if (logs.length > 0) {
                            const latest = logs[0];
                            // 새로운 후원이 들어왔을 때만 애니메이션 및 팝업 실행
                            if (latest.time !== lastCheckedTime) {
                                lastCheckedTime = latest.time;
                                showAlert(latest.nickname, latest.amount, latest.message);
                            }
                        }
                    } catch (e) {
                        console.error(e);
                    }
                }

                function showAlert(nickname, amount, message) {
                    const box = document.getElementById('alert-box');
                    box.innerText = \`🎉 \${nickname}님 \${amount.toLocaleString()}원 후원감사합니다! 🎉\`;
                    box.style.display = 'block';

                    setTimeout(() => {
                        box.style.display = 'none';
                    }, 5000); // 5초 동안 표시
                }

                setInterval(checkNewDonation, 1000); // 1초마다 새 후원 체크
            </script>
        </body>
        </html>
    `);
});

// 4. 관리자 페이지 (/admin)
app.get('/admin', (req, res) => {
    let html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>SelyPay 관리자</title>
            <style>
                body { font-family: 'Malgun Gothic', sans-serif; background: #f4f7f6; margin: 0; padding: 20px; }
                .container { max-width: 600px; margin: 0 auto; background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                h2 { color: #333; }
                .log-item { padding: 12px; border-bottom: 1px solid #eee; font-size: 16px; }
                .log-item:last-child { border-bottom: none; }
            </style>
        </head>
        <body>
            <div class="container">
                <h2>📱 SelyPay 후원 관리자</h2>
                <div id="log-list">후원 내역을 불러오는 중...</div>
            </div>
            <script>
                async function fetchLogs() {
                    try {
                        const res = await fetch('/api/logs');
                        const logs = await res.json();
                        const listDiv = document.getElementById('log-list');
                        
                        if (logs.length === 0) {
                            listDiv.innerHTML = '<p>아직 후원 내역이 없습니다.</p>';
                            return;
                        }

                        let htmlStr = '';
                        logs.forEach(log => {
                            htmlStr += \`<div class="log-item">[\${log.time}] <b>\${log.nickname}</b>님 (<b>\${log.amount.toLocaleString()}원</b>)</div>\`;
                        });
                        listDiv.innerHTML = htmlStr;
                    } catch (e) {
                        console.error(e);
                    }
                }
                setInterval(fetchLogs, 2000);
                fetchLogs();
            </script>
        </body>
        </html>
    `;
    res.send(html);
});

// 5. 프론트엔드에서 로그 목록을 가져가는 API
app.get('/api/logs', (req, res) => {
    res.json(donationLogs);
});

// 서버 구동
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
