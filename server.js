const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const crypto = require('crypto');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');

// 홈 랜딩 및 모달 라우터 불러오기
const homeRouter = require('./home');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname));

const upload = multer({ storage: multer.memoryStorage() });

// 1. MongoDB 연결
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(async () => {
        console.log('✅ MongoDB Atlas 연결 성공!');
        await User.updateMany(
            { "alertSettings.useImage": { $exists: false } },
            { $set: { "alertSettings.useImage": true, "alertSettings.useReaction": true } }
        );
    })
    .catch((err) => console.error('❌ MongoDB 연결 에러:', err));

// 유저 스키마
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    apiKey: { type: String, required: true, unique: true },
    alertSettings: {
        soundType: { type: String, default: 'coinsound.mp3' },
        duration: { type: Number, default: 5 },
        fontSize: { type: String, default: '7.5vh' },
        useImage: { type: Boolean, default: true }
    },
    menuSettings: {
        textColor: { type: String, default: '#ffffff' },
        fontSize: { type: String, default: '24px' },
        fontFamily: { type: String, default: 'Malgun Gothic' },
        effect: { type: String, default: 'shadow' },
        borderColor: { type: String, default: '#000000' },
        borderWidth: { type: String, default: '2px' },
        scrollMode: { type: String, default: 'page' },
        scrollInterval: { type: Number, default: 3 }
    }
});

// 후원 스키마
const donationSchema = new mongoose.Schema({
    streamerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    nickname: { type: String, default: "익명" },
    amount: { type: Number, default: 0 },
    message: { type: String, default: "" },
    datetime: { type: String, required: true },
    dateKey: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
});

// 리액션 설정 스키마
const reactionSchema = new mongoose.Schema({
    streamerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, default: "기본 리액션" },
    amount: { type: Number, default: 0 },
    imageUrl: { type: String, default: "" },
    audioUrl: { type: String, default: "" }
});

const User = mongoose.model('User', userSchema);
const Donation = mongoose.model('Donation', donationSchema);
const Reaction = mongoose.model('Reaction', reactionSchema);

function getKSTDateTime() {
    return new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function getKSTDateKey() {
    const now = new Date();
    const kstDate = new Date(now.getTime() + (9 * 60 * 60 * 1000));
    return kstDate.toISOString().split('T')[0];
}

// 홈 루트 라우터 연결
app.use('/', homeRouter);

// 회원가입 처리 API
app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        const apiKey = 'sely_' + crypto.randomBytes(16).toString('hex');
        const newUser = new User({ username, password, apiKey });
        await newUser.save();
        res.send(`<script>alert('회원가입 성공! 발급된 계정으로 로그인해주세요.'); location.href = '/login';</script>`);
    } catch (e) {
        res.send(`<script>alert('회원가입 실패 (중복된 아이디일 수 있습니다)'); history.back();</script>`);
    }
});

// 메뉴판 설정 저장 API
app.post('/api/settings/menu/:apiKey', async (req, res) => {
    try {
        const { textColor, fontSize, fontFamily, effect, borderColor, borderWidth, scrollMode, scrollInterval } = req.body;
        const user = await User.findOneAndUpdate(
            { apiKey: req.params.apiKey },
            { $set: { 
                'menuSettings.textColor': textColor,
                'menuSettings.fontSize': fontSize,
                'menuSettings.fontFamily': fontFamily,
                'menuSettings.effect': effect,
                'menuSettings.borderColor': borderColor,
                'menuSettings.borderWidth': borderWidth,
                'menuSettings.scrollMode': scrollMode,
                'menuSettings.scrollInterval': Number(scrollInterval) || 3
            }},
            { new: true }
        );
        if (!user) return res.status(404).json({ success: false, error: 'Streamer not found' });
        res.json({ success: true, message: '메뉴판 설정이 저장되었습니다.' });
    } catch (e) {
        res.status(500).json({ success: false, error: 'Server Error' });
    }
});

// 로그인 및 대시보드 UI (리액션 추가/관리 팝업 모달 탑재)
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username, password });
        if (!user) {
            return res.send(`<script>alert('아이디 또는 비밀번호가 틀렸습니다.'); history.back();</script>`);
        }

        let reactions = [];
        try {
            reactions = await Reaction.find({ streamerId: user._id }).sort({ amount: 1 });
        } catch (err) {
            console.error("리액션 조회 에러:", err);
        }

        const menuSettings = user.menuSettings || {
            textColor: '#ffffff',
            fontSize: '24px',
            fontFamily: 'Malgun Gothic',
            effect: 'shadow',
            borderColor: '#000000',
            borderWidth: '2px',
            scrollMode: 'page',
            scrollInterval: 3
        };

        res.send(`
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Slenation Dashboard - ${user.username}</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background-color: #f0f4f8; color: #1e293b; min-height: 100vh; }
        header { display: flex; justify-content: space-between; align-items: center; padding: 16px 40px; background-color: #ffffff; border-bottom: 1px solid #e2e8f0; }
        .logo { display: flex; align-items: center; gap: 8px; font-size: 22px; font-weight: 800; color: #101828; text-decoration: none; }
        .logo-icon { width: 28px; height: 28px; background-color: #52b735; border-radius: 6px; display: inline-block; }
        .nav-links { display: flex; gap: 32px; list-style: none; }
        .nav-links a { text-decoration: none; color: #475569; font-size: 15px; font-weight: 600; }
        .user-profile-menu { position: relative; cursor: pointer; }
        .avatar-btn { width: 36px; height: 36px; border-radius: 50%; background-color: #3b82f6; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; border: 2px solid #52b735; }
        .profile-dropdown { display: none; position: absolute; top: 48px; right: 0; width: 220px; background: white; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); border: 1px solid #e2e8f0; z-index: 100; overflow: hidden; }
        .profile-dropdown.active { display: block; }
        .dropdown-header { padding: 14px 18px; border-bottom: 1px solid #f1f5
