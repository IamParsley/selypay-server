const express = require('express');
const router = express.Router();

// 홈 랜딩 페이지 + 모달
router.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>슬네이션 - 실시간 계좌 입금 알림 & 스트리밍 서포터 시스템</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background-color: #f4f8fa; color: #1e293b; min-height: 100vh; display: flex; flex-direction: column; }
        
        /* 상단 네비게이션 */
        header { display: flex; justify-content: space-between; align-items: center; padding: 16px 40px; background-color: #ffffff; border-bottom: 1px solid #e2e8f0; }
        .logo { display: flex; align-items: center; gap: 8px; font-size: 22px; font-weight: 800; color: #101828; text-decoration: none; }
        .logo-icon { width: 28px; height: 28px; background-color: #52b735; border-radius: 6px; display: inline-block; }
        .nav-links { display: flex; gap: 32px; list-style: none; }
        .nav-links a { text-decoration: none; color: #475569; font-size: 15px; font-weight: 600; }
        .login-btn-top { background-color: #52b735; color: white; padding: 8px 18px; border-radius: 8px; font-size: 14px; font-weight: 700; cursor: pointer; border: none; }

        /* 히어로 영역 */
        main { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 20px; text-align: center; }
        .version-badge { display: inline-flex; align-items: center; gap: 6px; background-color: #e8f7ec; color: #16a34a; border: 1px solid #bbf7d0; padding: 6px 16px; border-radius: 20px; font-size: 14px; font-weight: 700; margin-bottom: 32px; }
        .badge-dot { width: 7px; height: 7px; background-color: #16a34a; border-radius: 50%; }
        .hero-title { font-size: 46px; font-weight: 900; line-height: 1.3; color: #0f172a; margin-bottom: 16px; }
        .hero-title .highlight { color: #52b735; }
        .hero-subtitle { font-size: 17px; color: #64748b; margin-bottom: 36px; }
        .cta-group { display: flex; gap: 12px; justify-content: center; }
        .btn-primary { background-color: #52b735; color: white; padding: 14px 28px; border-radius: 8px; font-size: 15px; font-weight: 700; text-decoration: none; cursor: pointer; border: none; }
        .btn-secondary { background-color: #ffffff; color: #1e293b; padding: 14px 28px; border-radius: 8px; font-size: 15px; font-weight: 700; text-decoration: none; cursor: pointer; border: 1px solid #e2e8f0; }

        /* 모달 팝업 스타일 */
        .modal-overlay { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0, 0, 0, 0.5); z-index: 1000; justify-content: center; align-items: center; }
        .modal-box { background: #ffffff; width: 440px; padding: 35px 30px; border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.15); position: relative; text-align: left; }
        .modal-close { position: absolute; top: 20px; right: 20px; background: none; border: none; font-size: 20px; color: #94a3b8; cursor: pointer; }
        .modal-title { font-size: 22px; font-weight: 800; color: #0f172a; margin-bottom: 6px; }
        .modal-desc { font-size: 13px; color: #64748b; margin-bottom: 24px; }
        .form-group { margin-bottom: 16px; }
        .form-group label { display: block; font-size: 13px; font-weight: 700; color: #334155; margin-bottom: 6px; }
        .form-group input { width: 100%; height: 44px; padding: 0 14px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 14px; outline: none; }
        .form-group input:focus { border-color: #52b735; box-shadow: 0 0 0 3px rgba(82, 183, 53, 0.15); }
        .modal-submit-btn { width: 100%; height: 46px; background-color: #52b735; color: white; border: none; border-radius: 8px; font-size: 15px; font-weight: 700; cursor: pointer; margin-top: 10px; }
        .modal-footer-links { display: flex; justify-content: space-between; align-items: center; margin-top: 20px; font-size: 12px; color: #64748b; }
        .modal-footer-links a { color: #475569; text-decoration: none; font-weight: 600; cursor: pointer; }
        .modal-footer-links a:hover { color: #52b735; text-decoration: underline; }
    </style>
</head>
<body>
    <header>
        <a href="/" class="logo"><span class="logo-icon"></span>Slenation</a>
        <ul class="nav-links">
            <li><a href="#about">서비스 소개</a></li>
            <li><a href="#guide">사용 방법</a></li>
            <li><a href="#patch">패치 노트</a></li>
            <li><a href="#support">고객센터</a></li>
        </ul>
        <button class="login-btn-top" onclick="openLoginModal()">로그인</button>
    </header>

    <main>
        <div class="version-badge"><span class="badge-dot"></span>슬네이션 Open Alpha v1.0</div>
        <h1 class="hero-title">실시간 계좌 입금 알림<br><span class="highlight">& 스트리밍 서포터 시스템</span></h1>
        <p class="hero-subtitle">은행 입금 건을 초단위로 수신받아 스트리밍에 즉시 연동하세요.</p>
        <div class="cta-group">
            <button class="btn-primary" onclick="openRegisterModal()">무료로 시작하기</button>
            <button class="btn-secondary" onclick="openLoginModal()">스트리머 로그인</button>
        </div>
    </main>

    <!-- 로그인 모달 -->
    <div id="loginModal" class="modal-overlay">
        <div class="modal-box">
            <button class="modal-close" onclick="closeModal('loginModal')">&times;</button>
            <div class="modal-title">환영합니다!</div>
            <div class="modal-desc">계좌 입금 알림 및 후원 관리를 시작하세요.</div>
            <form action="/api/login" method="POST">
                <div class="form-group">
                    <label>닉네임 / 스트리머명</label>
                    <input type="text" name="username" placeholder="사용 중인 이름을 입력해주세요" required>
                </div>
                <div class="form-group">
                    <label>비밀번호</label>
                    <input type="password" name="password" placeholder="비밀번호를 입력해주세요" required>
                </div>
                <button type="submit" class="modal-submit-btn">로그인</button>
            </form>
            <div class="modal-footer-links">
                <a onclick="switchToRegister()">계정이 없으신가요? 회원가입</a>
                <a href="#forgot">비밀번호 찾기</a>
            </div>
        </div>
    </div>

    <!-- 회원가입 모달 -->
    <div id="registerModal" class="modal-overlay">
        <div class="modal-box">
            <button class="modal-close" onclick="closeModal('registerModal')">&times;</button>
            <div class="modal-title">회원가입</div>
            <div class="modal-desc">슬네이션과 함께 스마트한 후원 관리를 시작하세요.</div>
            <form action="/api/register" method="POST">
                <div class="form-group">
                    <label>닉네임 / 스트리머명</label>
                    <input type="text" name="username" placeholder="사용하실 이름을 입력해주세요" required>
                </div>
                <div class="form-group">
                    <label>비밀번호</label>
                    <input type="password" name="password" placeholder="비밀번호를 입력해주세요" required>
                </div>
                <button type="submit" class="modal-submit-btn">가입하기</button>
            </form>
            <div class="modal-footer-links">
                <a onclick="switchToLogin()">이미 계정이 있으신가요? 로그인</a>
            </div>
        </div>
    </div>

    <script>
        function openLoginModal() { document.getElementById('loginModal').style.display = 'flex'; }
        function openRegisterModal() { document.getElementById('registerModal').style.display = 'flex'; }
        function closeModal(id) { document.getElementById(id).style.display = 'none'; }
        function switchToRegister() { closeModal('loginModal'); openRegisterModal(); }
        function switchToLogin() { closeModal('registerModal'); openLoginModal(); }
        window.onclick = function(e) {
            if (e.target.classList.contains('modal-overlay')) {
                e.target.style.display = 'none';
            }
        }
    </script>
</body>
</html>
    `);
});

module.exports = router;
