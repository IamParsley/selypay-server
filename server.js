const express = require('express');
const bodyParser = require('body-parser');
const app = express();
const PORT = process.env.PORT || 3000;

// 미들웨어 설정
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// 데이터 저장용 배열 (메모리 저장)
let donationLogs = []; // 후원 알림 (최대 50개)
let pingLogs = [];     // 서버 핑 수신 로그 (최대 20개)

// 한국 시간(KST) 구하는 헬퍼 함수
function getKSTTime() {
    return new Date().toLocaleTimeString('ko-KR', { 
        timeZone: 'Asia/Seoul', 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit' 
    });
}

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

// 1. 기본 홈 루트 (서버 살아있는지 확인 + 핑 기록 남기기)
app.get('/', (req, res) => {
    const timeStr = getKSTDateTime();
    const pingEntry = `[${timeStr}] 핑 수신 성공 (Alive Check)`;
    
    // 핑 로그 배열에 추가 (최대 20개 유지)
    pingLogs.unshift(pingEntry);
    if (pingLogs.length > 20) {
        pingLogs.pop();
    }

    res.send('SelyPay Server is Running');
});

// 2. 안드로이드 앱에서 알림을 받아오는 POST 엔드포인트
app.post('/api/notification', (req, res) => {
    const message = req.body.message;
    
    if (!message) {
        return res.status(400).json({ success: false, error: 'Message is empty' });
    }

    console.log("받은 원본 메시지:", message);

    let amount = 0;
    const amountMatch = message.match(/([0-9,]+)\s*원/);
    if (amountMatch) {
        amount = parseInt(amountMatch[1].replace(/,/g, ''), 10);
    }

    let nickname = "익명";
    if (message.includes("님")) {
        nickname = message.split("님")[0].trim();
    }

    const timeString = getKSTTime();

    const donationData = {
        time: timeString,
        datetime: getKSTDateTime(),
        message: message,
        nickname: nickname,
        amount: amount
    };

    // 후원 내역을 배열 앞에 추가 (최대 50개 유지)
    donationLogs.unshift(donationData);
    if (donationLogs.length > 50) {
        donationLogs.pop();
    }

    console.log("파싱된 후원 정보:", donationData);

    res.status(200).json({ success: true, data: donationData });
});

// 3. OBS 오버레이 화면
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
                            if (latest.datetime !== lastCheckedTime) {
                                lastCheckedTime = latest.datetime;
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
                    }, 5000);
                }

                setInterval(checkNewDonation, 1000);
            </script>
        </body>
        </html>
    `);
});

// 4. 관리자 페이지 (/admin) - 후원 내역(최대 50개)과 핑 로그(최대 20개) 분리 표시
app.get('/admin', (req, res) => {
    let html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>SelyPay 관리자</title>
            <style>
                body { font-family: 'Malgun Gothic', sans-serif; background: #f4f7f6; margin: 0; padding: 20px; }
                .container { max-width: 800px; margin: 0 auto; }
                .card { background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); margin-bottom: 20px; }
                h2 { color: #333; margin-top: 0; }
                .log-item { padding: 10px 0; border-bottom: 1px solid #eee; font-size: 15px; }
                .log-item:last-child { border-bottom: none; }
                .ping-item { font-size: 13px; color: #666; padding: 5px 0; border-bottom: 1px dashed #eee; }
                .scroll-box { max-height: 300px; overflow-y: auto; padding-right: 5px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="card">
                    <h2>🎁 실시간 후원 내역 (최대 50개)</h2>
                    <div id="donation-list" class="scroll-box">후원 내역을 불러오는 중...</div>
                </div>

                <div class="card">
                    <h2>📡 서버 핑 수신 기록 (최대 20개)</h2>
                    <div id="ping-list" class="scroll-box">핑 기록을 불러오는 중...</div>
                </div>
            </div>
            <script>
                async function fetchAllData() {
                    try {
                        // 후원 내역 가져오기
                        const resDonation = await fetch('/api/logs');
                        const donations = await resDonation.json();
                        const donationDiv = document.getElementById('donation-list');
                        
                        if (donations.length === 0) {
                            donationDiv.innerHTML = '<p>아직 후원 내역이 없습니다.</p>';
                        } else {
                            let donationHtml = '';
                            donations.forEach(log => {
                                donationHtml += \`<div class="log-item">[\${log.datetime}] <b>\${log.nickname}</b>님 (<b>\${log.amount.toLocaleString()}원</b>) - <span style="color:#555;">\${log.message}</span></div>\`;
                            });
                            donationDiv.innerHTML = donationHtml;
                        }

                        // 핑 로그 가져오기
                        const resPing = await fetch('/api/pings');
                        const pings = await resPing.json();
                        const pingDiv = document.getElementById('ping-list');

                        if (pings.length === 0) {
                            pingDiv.innerHTML = '<p>아직 수신된 핑 기록이 없습니다.</p>';
                        } else {
                            let pingHtml = '';
                            pings.forEach(ping => {
                                pingHtml += \`<div class="ping-item">\${ping}</div>\`;
                            });
                            pingDiv.innerHTML = pingHtml;
                        }

                    } catch (e) {
                        console.error(e);
                    }
                }

                setInterval(fetchAllData, 2000);
                fetchAllData();
            </script>
        </body>
        </html>
    `;
    res.send(html);
});

// 5. 프론트엔드에서 후원 로그 목록을 가져가는 API
app.get('/api/logs', (req, res) => {
    res.json(donationLogs);
});

// 6. 프론트엔드에서 핑 로그 목록을 가져가는 API
app.get('/api/pings', (req, res) => {
    res.json(pingLogs);
});

// 서버 구동
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
