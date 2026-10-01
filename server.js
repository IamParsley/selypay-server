const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

let donationLogs = [];
let audioSettings = {
    1000: "https://example.com/sound1.mp3",
    5000: "https://example.com/sound2.mp3",
    10000: "https://example.com/sound3.mp3"
};
let latestDonation = null;

app.post('/api/notification', (req, res) => {
    const { message, nickname, amount, comment } = req.body;
    
    const donationData = {
        id: Date.now(),
        message: message || "후원이 도착했습니다!",
        nickname: nickname || "익명",
        amount: amount || 0,
        comment: comment || "",
        audioUrl: audioSettings[amount] || null,
        time: new Date().toLocaleTimeString('ko-KR')
    };

    donationLogs.unshift(donationData);
    if (donationLogs.length > 50) donationLogs.pop();
    latestDonation = donationData;

    console.log("새 후원 수신:", donationData);
    res.status(200).json({ status: "success", data: donationData });
});

app.get('/admin', (req, res) => {
    let logHtml = donationLogs.map(item => 
        `<li style="padding:10px; border-bottom:1px solid #ccc;">
            <b>[${item.time}] ${item.nickname}님 (${item.amount}원)</b><br>${item.comment}
         </li>`
    ).join('');

    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>SelyPay 모바일 관리자</title>
            <style>
                body { font-family: sans-serif; padding: 15px; background: #f4f4f9; }
                h2 { color: #333; }
                .card { background: white; padding: 15px; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); margin-bottom: 20px; }
                ul { list-style: none; padding: 0; }
            </style>
        </head>
        <body>
            <h2>📱 SelyPay 후원 관리자</h2>
            <div class="card">
                <h3>최근 후원 내역</h3>
                <ul>${logHtml || '<li>아직 후원 내역이 없습니다.</li>'}</ul>
            </div>
        </body>
        </html>
    `);
});

app.get('/overlay', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>OBS Overlay</title>
            <style>
                body { font-family: sans-serif; background: transparent; color: white; overflow: hidden; }
                #alert-box { display: none; font-size: 24px; font-weight: bold; background: rgba(0,0,0,0.7); padding: 20px; border-radius: 10px; text-align: center; }
            </style>
        </head>
        <body>
            <div id="alert-box"></div>
            <audio id="audio-player"></audio>

            <script>
                let lastId = null;
                setInterval(async () => {
                    const res = await fetch('/api/latest');
                    const data = await res.json();
                    if (data && data.id !== lastId) {
                        lastId = data.id;
                        const box = document.getElementById('alert-box');
                        box.innerText = data.message;
                        box.style.display = 'block';

                        if (data.audioUrl) {
                            const player = document.getElementById('audio-player');
                            player.src = data.audioUrl;
                            player.play();
                        }

                        setTimeout(() => { box.style.display = 'none'; }, 5000);
                    }
                }, 2000);
            </script>
        </body>
        </html>
    `);
});

app.get('/api/latest', (req, res) => {
    res.json(latestDonation);
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
