// 7. 스트리머별 OBS 오버레이 화면
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
                body { 
                    background-color: transparent; 
                    margin: 0; 
                    font-family: 'Malgun Gothic', sans-serif; 
                }
                #alert-container {
                    position: absolute; 
                    bottom: 50px; 
                    left: 50%;
                    transform: translateX(-50%);
                    display: none; 
                    text-align: center;
                }
                /* 문구 위 중앙에 표시될 GIF 이미지 스타일 */
                #alert-image {
                    width: 150px; /* 이미지 크기 조절 가능 */
                    height: auto;
                    margin-bottom: 15px;
                    display: inline-block;
                }
                /* 배경 없는 깔끔한 텍스트 스타일 */
                #alert-text {
                    color: white; 
                    font-size: 32px;
                    font-weight: bold; 
                    text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.9); /* 어떤 화면이든 글자가 잘 보이도록 그림자 효과 */
                }
            </style>
        </head>
        <body>
            <div id="alert-container">
                <!-- 💡 src 경로에 GitHub에 올리신 GIF 파일명을 적어주세요 (예: /my-gif.gif) -->
                <img id="alert-image" src="/여기에파일명.gif" alt="Alert GIF">
                <div id="alert-text"></div>
            </div>

            <script>
                let lastCheckedTime = "";
                async function checkNewDonation() {
                    try {
                        const response = await fetch('/api/logs/${apiKey}');
                        const logs = await response.json();
                        if (logs.length > 0) {
                            const latest = logs[0];
                            if (latest.datetime !== lastCheckedTime) {
                                lastCheckedTime = latest.datetime;
                                showAlert(latest.nickname, latest.amount, latest.message);
                            }
                        }
                    } catch (e) { console.error(e); }
                }

                function showAlert(nickname, amount, message) {
                    const container = document.getElementById('alert-container');
                    const textDiv = document.getElementById('alert-text');
                    
                    textDiv.innerText = \`\${nickname}님 \${amount.toLocaleString()}원 후원감사합니다!\`;
                    container.style.display = 'block';

                    // 5초 후에 알림 숨기기
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
