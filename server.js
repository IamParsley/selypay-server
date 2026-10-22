// 🌟 OBS 알림 오버레이 화면 라우트
app.get('/overlay/:apiKey', async (req, res) => {
    try {
        const { apiKey } = req.params;
        const user = await User.findOne({ apiKey });
        if (!user) return res.status(404).send('Streamer not found');

        const settings = user.alertSettings || {};
        const reactions = await Reaction.find({ streamerId: user._id }).sort({ amount: 1 });
        const useImage = settings.useImage !== undefined ? settings.useImage : true;

        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>SelyPay Alert Overlay</title>
                <style>
                    body { background: transparent; margin: 0; overflow: hidden; font-family: 'Malgun Gothic', sans-serif; }
                    #alert-container {
                        width: 100vw; height: 100vh; display: none;
                        flex-direction: column; justify-content: flex-start; align-items: center;
                        text-align: center; box-sizing: border-box; padding: 2vh 3vw;
                        background: transparent !important;
                    }
                    #alert-image { 
                        width: 70vw; height: auto; max-width: 80%; max-height: 50vh; 
                        object-fit: contain; display: ${useImage ? 'block' : 'none'}; margin-bottom: 5vh;
                    }
                    #alert-line1 {
                        color: #ffffff; font-size: 8vh; font-weight: 800; 
                        text-shadow: -3px -3px 0 #000, 3px -3px 0 #000, -3px 3px 0 #000, 3px 3px 0 #000, 4px 4px 8px rgba(0, 0, 0, 0.9);
                        width: 90vw; word-break: keep-all; overflow-wrap: break-word; line-height: 1.2; margin-bottom: 3vh;
                    }
                    #alert-line2 {
                        color: #ffffff; font-size: 6.5vh; font-weight: 800; 
                        text-shadow: -3px -3px 0 #000, 3px -3px 0 #000, -3px 3px 0 #000, 3px 3px 0 #000, 4px 4px 8px rgba(0, 0, 0, 0.9);
                        width: 90vw; word-break: break-word; line-height: 1.2;
                    }
                </style>
            </head>
            <body>
                <div id="alert-container">
                    <img id="alert-image" src="" alt="리액션 이미지" onerror="this.src='/alerticon.gif'">
                    <div class="text-box" id="alert-line1"></div>
                    <div class="text-box" id="alert-line2"></div>
                </div>

                <script>
                const reactions = ${JSON.stringify(reactions)};
                const defaultSound = "/${settings.soundType || 'coinsound.mp3'}";
                const defaultImage = "/alerticon.gif";
                const useImageSetting = ${useImage};

                let lastCheckedTime = "";
                const alertQueue = [];
                let isPlaying = false;

                async function checkNewDonation() {
                    try {
                        const response = await fetch('/api/logs/' + '${apiKey}');
                        const logs = await response.json();
                        if (logs.length > 0) {
                            const latest = logs[0];
                            if (latest.datetime !== lastCheckedTime) {
                                lastCheckedTime = latest.datetime;
                                alertQueue.push(latest);
                                processQueue();
                            }
                        }
                    } catch (e) { console.error(e); }
                }

                async function checkManualPlay() {
                    try {
                        const response = await fetch('/api/manual-play/' + '${apiKey}');
                        const items = await response.json();
                        if (items && items.length > 0) {
                            items.forEach(item => { alertQueue.push(item); });
                            processQueue();
                        }
                    } catch (e) { console.error(e); }
                }

                function processQueue() {
                    if (isPlaying || alertQueue.length === 0) return;
                    isPlaying = true;
                    const donation = alertQueue.shift();
                    showAlert(donation);
                }

                function showAlert(donation) {
                    const container = document.getElementById('alert-container');
                    const imgElement = document.getElementById('alert-image');
                    const line1 = document.getElementById('alert-line1');
                    const line2 = document.getElementById('alert-line2');
                    
                    const message = donation.message;
                    const amount = donation.amount || 0;
                            
                    let firstText = message;
                    let secondText = "";
                    
                    const newlineIdx = message.indexOf('\\n');
                    if (newlineIdx !== -1) {
                        firstText = message.substring(0, newlineIdx);
                        secondText = message.substring(newlineIdx + 1);
                    }

                    line1.innerText = firstText;
                    line2.innerText = secondText;

                    const matchedReaction = reactions.find(r => r.amount === amount);

                    if (useImageSetting) {
                        if (matchedReaction && matchedReaction.imageUrl) {
                            imgElement.src = matchedReaction.imageUrl;
                            imgElement.style.display = 'block';
                        } else {
                            imgElement.src = defaultImage;
                            imgElement.style.display = 'block';
                        }
                    } else {
                        imgElement.style.display = 'none';
                    }

                    const audioSrc = (matchedReaction && matchedReaction.audioUrl) ? matchedReaction.audioUrl : defaultSound;
                    const sound = new Audio(audioSrc);

                    container.style.display = 'flex';
                    sound.currentTime = 0;
                    
                    sound.play().catch(e => console.log("사운드 재생 실패:", e));

                    sound.onended = () => {
                        setTimeout(() => {
                            container.style.display = 'none';
                            isPlaying = false;
                            processQueue();
                        }, 3500);
                    };

                    sound.onerror = () => {
                        setTimeout(() => {
                            container.style.display = 'none';
                            isPlaying = false;
                            processQueue();
                        }, 3500);
                    };
                }
                
                setInterval(checkNewDonation, 1000);
                setInterval(checkManualPlay, 1000);
            </script>
            </body>
            </html>
        `);
    } catch (e) {
        res.status(500).send('Overlay Server Error');
    }
});
