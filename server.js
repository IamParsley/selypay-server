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
                    background: url('/login_background.png') no-repeat center center/cover;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif;
                    overflow: hidden;
                }

                /* 1. 로그인 전체 컨테이너 */
                .login-container {
                    position: relative;
                    width: 750px;
                    height: 750px;
                }

                /* 2. 나무 팻말 박스 이미지 */
                .login-board {
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 750px;
                    height: 750px;
                    background: url('/login_board.png') no-repeat center center/contain;
                    z-index: 2;
                }

                /* 3. 🐱 고양이 레이어 */
                .hanging-cat {
                    position: absolute;
                    top: -65px;
                    left: 50%;
                    transform: translateX(-50%);
                    width: 420px;
                    height: 280px;
                    background: url('/login_cat.png') no-repeat center center/contain;
                    z-index: 5;
                    pointer-events: none;
                    filter: drop-shadow(0 12px 16px rgba(0,0,0,0.7));
                }

                /* 4. 🎯 입력 폼 영역 (아래로 쏠려있던 것을 위로 훅 끌어올림) */
                .login-form-overlay {
                    position: absolute;
                    top: 280px; /* 👈 숫자를 확 줄여서 위쪽 목판 빈 공간으로 이동시킴 */
                    left: 180px; 
                    width: 390px;
                    z-index: 10;
                    text-align: center;
                }

                .input-group {
                    margin-bottom: 12px;
                }

                .input-group input {
                    width: 100%;
                    height: 48px;
                    padding: 0 18px;
                    background: rgba(10, 20, 15, 0.4);
                    border: 2px solid transparent;
                    border-radius: 10px;
                    color: #ffd32a;
                    font-size: 16px;
                    font-weight: bold;
                    outline: none;
                    transition: all 0.3s ease;
                }

                .input-group input:focus {
                    border-color: #2ed573;
                    box-shadow: 0 0 14px rgba(46, 213, 115, 0.7);
                    background: rgba(10, 20, 15, 0.75);
                }

                .input-group input::placeholder {
                    color: rgba(255, 255, 255, 0.45);
                }

                /* 5. 🟢 로그인 버튼 */
                .login-btn {
                    width: 100%;
                    height: 50px;
                    background: transparent;
                    border: none;
                    cursor: pointer;
                    margin-top: 2px;
                    outline: none;
                    border-radius: 10px;
                    transition: all 0.1s ease;
                }

                .login-btn:active {
                    background: rgba(255, 71, 87, 0.4);
                    box-shadow: 0 0 25px rgba(255, 71, 87, 0.9), inset 0 0 12px rgba(255, 71, 87, 0.6);
                    transform: scale(0.98);
                }

                /* 6. 하단 링크 영역 */
                .links {
                    margin-top: 15px;
                    text-align: center;
                    font-size: 14px;
                    font-weight: 900;
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                }

                .links span {
                    color: #ffd32a;
                    text-shadow: 
                        -2px -2px 0 #000,  2px -2px 0 #000, 
                        -2px  2px 0 #000,  2px  2px 0 #000,
                        0 3px 6px rgba(0,0,0,0.9);
                }

                .links a {
                    color: #ffd32a;
                    text-decoration: none;
                    text-shadow: 
                        -2px -2px 0 #000,  2px -2px 0 #000, 
                        -2px  2px 0 #000,  2px  2px 0 #000,
                        0 3px 6px rgba(0,0,0,0.9);
                    transition: color 0.2s, transform 0.2s;
                }

                .links a:hover {
                    color: #2ed573;
                }
            </style>
        </head>
        <body>
            <div class="login-container">
                <!-- 고양이 레이어 -->
                <div class="hanging-cat"></div>

                <!-- 나무 팻말 레이어 -->
                <div class="login-board"></div>

                <!-- 입력 폼 오버레이 레이어 -->
                <div class="login-form-overlay">
                    <form action="/api/login" method="POST">
                        <div class="input-group">
                            <input type="text" id="username" name="username" placeholder="아이디" required>
                        </div>

                        <div class="input-group">
                            <input type="password" id="password" name="password" placeholder="비밀번호" required>
                        </div>

                        <button type="submit" class="login-btn" title="로그인"></button>
                    </form>

                    <div class="links">
                        <a href="/forgot-password">비밀번호를 잊으셨나요?</a>
                        <div><span>계정이 없으신가요?</span> <a href="/register">회원가입</a></div>
                    </div>
                </div>
            </div>
        </body>
        </html>
    `);
});
