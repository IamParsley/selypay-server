app.get('/overlay', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>SelyPay OBS Overlay</title>
            <style>
                /* 귀여운 메이플스토리 폰트 불러오기 */
                @font-face {
                    font-family: 'Maplestory';
                    src: url('https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_20-04@2.1/MaplestoryOTFBold.woff') format('woff');
                    font-weight: normal;
                    font-style: normal;
                }

                * {
                    box-sizing: border-box;
                }

                body {
                    margin: 0;
                    padding: 0;
                    background: transparent;
                    font-family: 'Maplestory', sans-serif;
                    overflow: hidden;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                }

                /* 후원 알림 전체 컨테이너 */
                #alert-container {
                    display: none;
                    position: relative;
                    width: 900px;
                    height: 450px;
                    /* 배경 이미지 지정 */
                    background: url('https://raw.githubusercontent.com/IamParsley/selypay-server/main/banner.png') no-repeat center / contain;
                    animation: popIn 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                }

                /* 노란색 배너 내부 텍스트 영역 */
                .text-box {
                    position: absolute;
                    top: 52%;
                    left: 50.5%;
                    transform: translate(-50%, -50%);
                    width: 60%;
                    text-align: center;
                    word-break: keep-all;
                }

                /* 닉네임 + 금액 디자인 */
                .nickname-amount {
                    font-size: 28px;
                    font-weight: bold;
                    color: #FF6F00; /* 귀여운 엠버 오렌지색 */
                    margin-bottom: 6px;
                    /* 흰색 하이라이트 + 부드러운 그림자 효과 */
                    text-shadow: 
                        -2px -2px 0 #FFF,  
                         2px -2px 0 #FFF,
                        -2px  2px 0 #FFF,
                         2px  2px 0 #FFF,
                         0px  3px 5px rgba(116, 70, 0, 0.25);
                }

                /* 후원 메시지 디자인 */
                .comment {
                    font-size: 21px;
                    font-weight: normal;
                    color: #4A3319; /* 프레임과 어울리는 딥 브라운 */
                    line-height: 1.35;
                    /* 연한 아이보리 테두리로 가독성 보장 */
                    text-shadow: 
                        -1.5px -1.5px 0 #FFFDF9,  
                         1.5px -1.5px 0 #FFFDF9,
                        -1.5px  1.5px 0 #FFFDF9,
                         1.5px  1.5px 0 #FFFDF9;
                }

                /* 뿅 하고 나타나는 팝업 애니메이션 */
                @keyframes popIn {
                    0% { transform: scale(0.3) translateY(50px); opacity: 0; }
                    70% { transform: scale(1.05) translateY(-5px); opacity: 1; }
                    100% { transform: scale(1) translateY(0); }
                }
            </style>
        </head>
        <body>
            <div id="alert-container">
                <div class="text-box">
                    <div id="user-info" class="nickname-amount"></div>
                    <div id="user-comment" class="comment"></div>
                </div>
            </div>
            <audio id="audio-player"></audio>

            <script>
                let lastId = null;

                setInterval(async () => {
                    try {
                        const res = await fetch('/api/latest');
                        const data = await res.json();

                        if (data && data.id !== lastId) {
                            lastId = data.id;

                            const container = document.getElementById('alert-container');
                            const userInfo = document.getElementById('user-info');
                            const userComment = document.getElementById('user-comment');

                            userInfo.innerText = \`\${data.nickname}님 \${data.amount.toLocaleString()}원 후원!\`;
                            userComment.innerText = data.comment || data.message || '';

                            container.style.display = 'block';

                            if (data.audioUrl) {
                                const player = document.getElementById('audio-player');
                                player.src = data.audioUrl;
                                player.play().catch(e => console.log(e));
                            }

                            // 6초 동안 보여준 후 숨김
                            setTimeout(() => {
                                container.style.display = 'none';
                            }, 6000);
                        }
                    } catch (err) {
                        console.error(err);
                    }
                }, 1500);
            </script>
        </body>
        </html>
    `);
});
