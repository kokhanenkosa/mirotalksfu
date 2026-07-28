'use strict';

console.log(window.location);

const settings = JSON.parse(localStorage.getItem('SFU_SETTINGS')) || {};
console.log('Settings:', settings);

const pollInterval = 5000;

const pathParts = window.location.pathname.split('/');
const roomId = filterXSS(pathParts[pathParts.length - 1]);

const statusEl = document.getElementById('waitingStatus');
const loginLink = document.getElementById('loginLink');
const waitingRoomNameEl = document.getElementById('waitingRoomName');
const waitingRoomNameText = document.getElementById('waitingRoomNameText');
const waitingElapsedText = document.getElementById('waitingElapsedText');
const waitingOrb = document.getElementById('waitingOrb');

window.sessionStorage.roomID = roomId;

let intervalId = null;
let roomActive = false;
const waitStartTime = Date.now();
let elapsedTimerId = null;

if (roomId && roomId !== 'whoAreYou') {
    waitingRoomNameText.textContent = roomId;
    waitingRoomNameEl.style.display = 'inline-block';
}

function updateElapsedTime() {
    const seconds = Math.floor((Date.now() - waitStartTime) / 1000);
    if (seconds < 60) {
        waitingElapsedText.textContent = getWaitingRoomBrand('waitingRoomElapsedJust', 'Ожидание только началось');
    } else {
        const minutes = Math.floor(seconds / 60);
        const template = getWaitingRoomBrand('waitingRoomElapsedMinutes', 'Ожидание: {minutes}');
        waitingElapsedText.textContent = template.replace('{minutes}', minutes + ' мин.');
    }
}
elapsedTimerId = setInterval(updateElapsedTime, 10000);

function getWaitingRoomBrand(key, fallback) {
    try {
        return (typeof BRAND !== 'undefined' && BRAND?.whoAreYou?.[key]) || fallback;
    } catch (e) {
        return fallback;
    }
}

if (roomId && roomId !== 'whoAreYou') {
    loginLink.href = '/phone-auth?next=' + encodeURIComponent('/newroom');
}

function playSound(name) {
    if (!settings.sounds) return;

    const soundSrc = `../sounds/${name}.wav`;
    const audio = new Audio(soundSrc);
    audio.volume = 0.5;

    audio.play().catch((err) => {
        console.error(`Error playing sound: ${err}`);
    });
}

function flashCheckingState() {
    if (window.ThinkingOrbs && waitingOrb) {
        window.ThinkingOrbs.update(waitingOrb, { state: 'searching' });
        setTimeout(() => window.ThinkingOrbs.update(waitingOrb, { state: 'listening' }), 900);
    }
}

function checkRoom() {
    flashCheckingState();
    axios
        .post('/isRoomActive', { roomId: roomId })
        .then(function (response) {
            const isActive = response.data.message;
            console.log('Room active status:', isActive);

            if (isActive && !roomActive) {
                roomActive = true;
                if (waitingAudio) {
                    waitingAudio.pause();
                    waitingAudio = null;
                }
                playSound('roomActive');
                statusEl.textContent = getWaitingRoomBrand('waitingRoomReady', 'Комната готова. Выполняется вход...');
                statusEl.classList.add('ready');
                setTimeout(function () {
                    window.location.href = '/join/' + encodeURIComponent(roomId);
                }, 800);
            } else if (!isActive) {
                statusEl.textContent = getWaitingRoomBrand(
                    'waitingRoomWaiting',
                    'Ожидаем, когда ведущий начнёт встречу...'
                );
                scheduleNextCheck();
            }
        })
        .catch(function () {
            statusEl.textContent = getWaitingRoomBrand(
                'waitingRoomWaiting',
                'Ожидаем, когда ведущий начнёт встречу...'
            );
            scheduleNextCheck();
        });
}

function scheduleNextCheck() {
    if (intervalId) return;
    intervalId = setTimeout(function () {
        intervalId = null;
        if (document.visibilityState === 'visible') {
            checkRoom();
        } else {
            scheduleNextCheck();
        }
    }, pollInterval);
}

document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && !roomActive) {
        checkRoom();
    }
});

// Waiting room audio player
const audioPlayerEl = document.getElementById('waitingAudioPlayer');
const audioBtn = document.getElementById('waitingAudioBtn');
const audioIcon = document.getElementById('waitingAudioIcon');
const audioMuteBtn = document.getElementById('waitingAudioMute');
const audioMuteIcon = document.getElementById('waitingAudioMuteIcon');
const audioProgress = document.getElementById('waitingAudioProgress');

let waitingAudio = null;
let audioPlaying = false;

function initWaitingAudio() {
    const songUrl = getWaitingRoomBrand('waitingRoomSongUrl', '');
    if (!songUrl || !audioPlayerEl) return;

    waitingAudio = new Audio(songUrl);
    waitingAudio.loop = true;
    waitingAudio.volume = 0.3;
    waitingAudio.preload = 'auto';

    waitingAudio.addEventListener('error', function () {
        console.warn('Waiting room audio failed to load:', songUrl);
        audioPlayerEl.style.display = 'none';
        waitingAudio = null;
    });

    waitingAudio.addEventListener(
        'canplaythrough',
        function () {
            audioPlayerEl.style.display = 'flex';
        },
        { once: true }
    );

    waitingAudio.addEventListener('timeupdate', function () {
        if (waitingAudio.duration) {
            const pct = (waitingAudio.currentTime / waitingAudio.duration) * 100;
            audioProgress.style.width = pct + '%';
        }
    });

    audioBtn.onclick = function () {
        if (audioPlaying) {
            waitingAudio.pause();
            audioIcon.className = 'fa-solid fa-play';
            audioBtn.title = 'Включить музыку';
        } else {
            waitingAudio.play().catch(function (err) {
                console.warn('Audio play blocked:', err.message);
            });
            audioIcon.className = 'fa-solid fa-pause';
            audioBtn.title = 'Приостановить музыку';
        }
        audioPlaying = !audioPlaying;
    };

    audioMuteBtn.onclick = function () {
        waitingAudio.muted = !waitingAudio.muted;
        audioMuteIcon.className = waitingAudio.muted ? 'fa-solid fa-volume-xmark' : 'fa-solid fa-volume-high';
        audioMuteBtn.title = waitingAudio.muted ? 'Включить звук' : 'Выключить звук';
    };
}

// Wait for Brand.js to load before initializing audio
setTimeout(initWaitingAudio, 1000);

checkRoom();
