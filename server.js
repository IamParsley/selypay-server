app.get('/overlay/:apiKey', async (req, res) => {
    const apiKeyVal = req.params.apiKey;
    const user = await User.findOne({ apiKey: apiKeyVal });
    if (!user) return res.status(404).send('Not found');
    
    res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>html,body{width:100%;height:100%;margin:0;background:transparent!important;font-family:sans-serif;overflow:hidden;}#alert-container{width:100vw;height:100vh;display:none;flex-direction:column;justify-content:center;align-items:center;text-align:center;}#alert-image{height:35vh;max-width:80vw;object-fit:contain;margin-bottom:1.5vh;display:block;}#alert-line1,#alert-line2{color:#fff;font-size:7vh;font-weight:800;text-shadow:-2px -2px 0 #000,2px -2px 0 #000,-2px 2px 0 #000,2px 2px 0 #000;width:90vw;word-break:break-word;}</style></head><body><div id="alert-container"><img id="alert-image" src="/alerticon.gif"><div id="alert-line1"></div><div id="alert-line2"></div></div><audio id="alert-sound" crossorigin="anonymous"></audio><script>
        let lastCount = -1;
        let hideTimeout = null;

        async function check() {
            try {
                const res = await fetch('/api/logs/${apiKeyVal}');
                const logs = await res.json();
                if(logs) {
                    const currentCount = logs.length;
                    
                    // 최초 실행 시점에는 현재 개수만 저장하고 알림은 띄우지 않음 (페이지 켤 때마다 옛날 거 폭탄으로 뜨는 것 방지)
                    if(lastCount === -1) {
                        lastCount = currentCount;
                        return;
                    }

                    // 후원 건수가 늘어났다면 새로운 후원이 온 것!
                    if(currentCount > lastCount) {
                        lastCount = currentCount;
                        const latest = logs[0]; // 가장 최신 후원
                        trigger(latest);
                    } else if(currentCount < lastCount) {
                        // 혹시 로그가 삭제되거나 초기화된 경우 동기화
                        lastCount = currentCount;
                    }
                }
            } catch(e) {}
        }

        async function trigger(d) {
            let img = "/alerticon.gif", sound = "/coinsound.mp3";
            let useImage = true;
            try {
                const res = await fetch('/api/reactions/${apiKeyVal}');
                const data = await res.json();
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
            showAlert(d.message, useImage ? img : "", sound);
        }

        function showAlert(msg, imgUrl, soundUrl) {
            const c = document.getElementById('alert-container');
            const img = document.getElementById('alert-image');
            const l1 = document.getElementById('alert-line1');
            const l2 = document.getElementById('alert-line2');
            const s = document.getElementById('alert-sound');

            if(hideTimeout) clearTimeout(hideTimeout);
            s.pause(); s.currentTime = 0;
            
            let t1 = msg, t2 = "";
            if (msg.includes('\\\\n')) {
                const parts = msg.split('\\\\n');
                t1 = parts[0]; t2 = parts.slice(1).join(' ');
            } else if (msg.includes('\\n')) {
                const parts = msg.split('\\n');
                t1 = parts[0]; t2 = parts.slice(1).join(' ');
            } else if (msg.includes('\n')) {
                const parts = msg.split('\n');
                t1 = parts[0]; t2 = parts.slice(1).join(' ');
            }
            l1.innerText = t1; 
            l2.innerText = t2; 
            
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
