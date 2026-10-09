// 7-1. 알림창 전용 세부 관리 및 설정 페이지 (테스트 시뮬레이터 및 실시간 미리보기 기능 포함)
app.get('/manage/alert/:apiKey', async (req, res) => {
    const { apiKey } = req.params;
    const user = await User.findOne({ apiKey });
    if (!user) return res.status(404).send('Streamer not found');

    const settings = user.alertSettings || {};

    res.send(`
        <!DOCTYPE html>
        html
        head
            <meta charset="UTF-8">
            <title>알림창 관리 - ${user.username}</title>
            <style>
                body { font-family: sans-serif; background: #f4f7f6; padding: 40px; margin: 0; }
                .container { max-width: 650px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                .box { background: #eee; padding: 10px; font-family: monospace; word-break: break-all; border-radius: 5px; margin-top: 5px; }
                .btn { display: inline-block; margin-top: 15px; padding: 10px 15px; background: #3498db; color: white; text-decoration: none; border-radius: 5px; font-weight: bold; border: none; cursor: pointer; }
                .btn:hover { background: #2980b9; }
                
                /* 실시간 미리보기 영역 (실제 오버레이와 완벽히 일치) */
                .preview-section { background: #111; border-radius: 8px; padding: 25px; text-align: center; margin-bottom: 25px; position: relative; overflow: hidden; display: flex; flex-direction: column; justify-content: center; align-items: center; min-height: 180px; }
                .preview-title { color: #aaa; font-size: 12px; position: absolute; top: 10px; left: 15px; }
                #preview-image { max-height: 80px; width: auto; object-fit: contain; margin-bottom: 10px; filter: drop-shadow(0 4px 10px rgba(0, 0, 0, 0.8)); }
                
                #preview-line1 { 
                    color: #ffffff; 
                    font-weight: 800; 
                    text-shadow: -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000; 
                    line-height: 1.4; 
                    margin-bottom: 5px; 
                    word-break: break-all; 
                }
                #preview-line2 { 
                    color: #b5e48c; 
                    font-weight: 800; 
                    text-shadow: -3px -3px 0 #000, 3px -3px 0 #000, -3px 3px 0 #000, 3px 3px 0 #000, 4px 4px 8px rgba(0, 0, 0, 0.9); 
                    line-height: 1.2; 
                    word-break: break-word; 
                }
                .form-group { margin-bottom: 15px; }
                .form-group label { display: block; font-weight: bold; margin-bottom: 5px; font-size: 14px; }
                .form-group input[type="text"], .form-group input[type="number"] { width: 100%; padding: 8px; box-sizing: border-box; border: 1px solid #ccc; border-radius: 4px; }
            </style>
        head
        body
            <div class="container">
                <h2>🎨 알림창 설정 및 관리</h2>
                
                <p><b>OBS 브라우저 소스 오버레이 주소</b></p>
                <div class="box">https://${req.get('host')}/overlay/${user.apiKey}</div>

                <hr style="margin: 25px 0; border:0; border-top:1px solid #ddd;">

                <!-- 💡 실시간 미리보기 화면 -->
                <h3 style="margin-top: 0;">👀 알림창 실시간 미리보기</h3>
                <div class="preview-section">
                    <div class="preview-title">PREVIEW</div>
                    <img id="preview-image" src="/alerticon.gif" alt="Preview Image">
                    <div id="preview-line1">테스트후원알림님 1,000원</div>
                    <div id="preview-line2">후원 감사합니다!</div>
                </div>

                <!-- 💡 테스트 후원 시뮬레이터 입력 칸 -->
                <div style="background: #fff3cd; border: 1px solid #ffeeba; padding: 15px; border-radius: 8px; margin-bottom: 25px;">
                    <h4 style="margin-top: 0; color: #856404; margin-bottom: 10px;">🧪 테스트 후원 직접 입력</h4>
                    <div style="display: flex; gap: 10px; margin-bottom: 10px;">
                        <div style="flex: 1;">
                            <label style="font-size: 12px;">닉네임</label>
                            <input type="text" id="testNickname" value="테스트후원알림">
                        </div>
                        <div style="flex: 1;">
                            <label style="font-size: 12px;">금액 (원)</label>
                            <input type="number" id="testAmount" value="1000">
                        </div>
                    </div>
                    <div style="margin-bottom: 10px;">
                        <label style="font-size: 12px;">후원 메시지</label>
                        <input type="text" id="testMessage" value="후원 감사합니다!">
                    </div>
                    <button type="button" id="sendTestBtn" class="btn" style="background: #e67e22; width: 100%; margin-top: 5px;">🚀 테스트 후원 보내기 (사운드 재생)</button>
                </div>

                <!-- ⚙️ 기본 알림창 세부 설정 폼 -->
                <h3>⚙️ 기본 알림창 세부 설정</h3>
                <form id="alertSettingsForm">
                    <div class="form-group">
                        <label>알림 지속 시간 (초)</label>
                        <input type="number" name="duration" id="duration" min="1" max="15" value="${settings.duration || 5}">
                    </div>
                    <div class="form-group">
                        <label>메시지 폰트 크기 (CSS 단위, 예: 32px 또는 5vh)</label>
                        <input type="text" name="fontSize" id="fontSize" value="${settings.fontSize || '32px'}">
                    </div>
                    <div class="form-group">
                        <label>
                            <input type="checkbox" name="useImage" id="useImage" ${settings.useImage !== false ? 'checked' : ''} style="width:auto;"> 기본 알림 이미지 사용 여부
                        </label>
                    </div>
                    <button type="submit" class="btn">기본 설정 저장하기</button>
                </form>

                <div style="margin-top: 20px;">
                    <a href="/login" class="btn" style="background: #7f8c8d;">대시보드로 돌아가기</a>
                </div>
            </div>

            <script>
                // 💡 미리보기 업데이트 및 실시간 반영 함수
                function updatePreview() {
                    const fontSizeInput = document.getElementById('fontSize').value;
                    const useImageCheckbox = document.getElementById('useImage').checked;

                    const line1 = document.getElementById('preview-line1');
                    const line2 = document.getElementById('preview-line2');
                    const img = document.getElementById('preview-image');

                    const nickname = document.getElementById('testNickname').value || '익명';
                    const amount = Number(document.getElementById('testAmount').value || 0).toLocaleString();
                    const message = document.getElementById('testMessage').value;

                    // 텍스트 반영 (실제 오버레이와 동일한 2줄 포맷)
                    line1.innerText = nickname + '님 ' + amount + '원';
                    line2.innerText = message;

                    // 폰트 크기 및 이미지 표시 여부 적용
                    line1.style.fontSize = fontSizeInput;
                    line2.style.fontSize = 'calc(' + fontSizeInput + ' * 0.9)';
                    img.style.display = useImageCheckbox ? 'block' : 'none';
                }

                // 입력 이벤트 연동
                document.getElementById('fontSize').addEventListener('input', updatePreview);
                document.getElementById('useImage').addEventListener('change', updatePreview);
                document.getElementById('testNickname').addEventListener('input', updatePreview);
                document.getElementById('testAmount').addEventListener('input', updatePreview);
                document.getElementById('testMessage').addEventListener('input', updatePreview);
                
                // 초기 실행
                updatePreview();

                // 🚀 테스트 후원 버튼 클릭 시 사운드 재생 및 효과
                document.getElementById('sendTestBtn').addEventListener('click', () => {
                    const previewSection = document.querySelector('.preview-section');
                    previewSection.style.transform = 'scale(1.02)';
                    setTimeout(() => { previewSection.style.transform = 'scale(1)'; }, 150);

                    try {
                        const testSound = new Audio('/coinsound.mp3');
                        testSound.currentTime = 0;
                        testSound.play().catch(e => console.log('사운드 재생 제한', e));
                    } catch (e) {
                        console.error(e);
                    }
                });

                // 설정 저장 처리
                document.getElementById('alertSettingsForm').addEventListener('submit', async (e) => {
                    e.preventDefault();
                    const duration = document.getElementById('duration').value;
                    const fontSize = document.getElementById('fontSize').value;
                    const useImage = document.getElementById('useImage').checked;

                    try {
                        const res = await fetch('/api/settings/alert/${user.apiKey}', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ duration, fontSize, useImage })
                        });
                        const result = await res.json();
                        if (result.success) {
                            alert('설정이 성공적으로 저장되었습니다!');
                        } else {
                            alert('설정 저장 실패: ' + (result.error || '알 수 없는 오류'));
                        }
                    } catch (err) {
                        console.error(err);
                        alert('서버 통신 중 오류가 발생했습니다.');
                    }
                });
            script
        body
        html
    `);
});
