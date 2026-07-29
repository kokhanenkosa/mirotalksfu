'use strict';

// Единая русская локализация для всех страниц, использующих Brand.js.
if (!document.querySelector('script[src$="/js/RussianUI.js"], script[src$="../js/RussianUI.js"]')) {
    const localeScript = document.createElement('script');
    localeScript.src = '../js/RussianUI.js';
    localeScript.defer = true;
    document.head.appendChild(localeScript);
}

// v3 — сброс старого английского кэша MiroTalk
const brandDataKey = 'brandData_optrf_v4';

/** Жёстко фиксируем hero-тексты — env/Coolify не должен их перетирать */
const OPTRF_HERO = {
    title: 'ОПТ РФ<br />Платформа онлайн-обучения.<br />Учитесь. Общайтесь. Вместе.',
    description:
        'Начните видеозвонок в один клик. Без установки программ и плагинов — сразу к разговору, чату и демонстрации экрана.',
};
try {
    window.sessionStorage.removeItem('brandData');
    window.sessionStorage.removeItem('brandData_optrf_v3');
} catch (e) {
    /* ignore */
}
const brandData = window.sessionStorage.getItem(brandDataKey);

const title = document.getElementById('title');
const icon = document.getElementById('icon');
const appleTouchIcon = document.getElementById('appleTouchIcon');
const newRoomTitle = document.getElementById('newRoomTitle');
const newRoomDescription = document.getElementById('newRoomDescription');

const description = document.getElementById('description');
const keywords = document.getElementById('keywords');

const appTitle = document.getElementById('appTitle');
const appDescription = document.getElementById('appDescription');
const joinDescription = document.getElementById('joinDescription');
const joinRoomBtn = document.getElementById('joinRoomButton');
const customizeRoomBtn = document.getElementById('customizeRoomButton');
const joinLastLabel = document.getElementById('joinLastLabel');

const topSponsors = document.getElementById('topSponsors');
const features = document.getElementById('features');
const teams = document.getElementById('teams');
const tryEasier = document.getElementById('tryEasier');
const poweredBy = document.getElementById('poweredBy');
const sponsors = document.getElementById('sponsors');
const pastSponsors = document.getElementById('pastSponsors');
const advertisers = document.getElementById('advertisers');
const supportUs = document.getElementById('supportUs');
const footer = document.getElementById('footer');

const waitingRoomHeading = document.getElementById('waitingRoomHeading');
const waitingRoomDescription = document.getElementById('waitingRoomDescription');
const waitingRoomStatus = document.getElementById('waitingStatus');
const waitingRoomHostLink = document.getElementById('waitingRoomHostLink');
const waitingRoomLoginLink = document.getElementById('waitingRoomLoginLink');

const loginHeading = document.getElementById('loginHeading');
const loginDescription = document.getElementById('loginDescription');
const loginButton = document.getElementById('loginButton');
//...

// app/src/config.js - ui.brand
let BRAND = {
    app: {
        language: 'ru',
        name: 'ОПТ РФ',
        title: OPTRF_HERO.title,
        description: OPTRF_HERO.description,
        joinDescription: 'Введите название комнаты.<br />Например, вот такое:',
        joinButtonLabel: 'Создать комнату',
        customizeButtonLabel: 'Настроить комнату',
        joinLastLabel: 'Недавняя комната:',
    },
    site: {
        title: 'ОПТ РФ — видеоконференции',
        icon: '../images/logo-no-background.svg',
        appleTouchIcon: '../images/logo-no-background.svg',
        newRoomTitle: 'Название.<br />Ссылка.<br />Встреча.',
        newRoomDescription: 'У каждой комнаты свой URL. Придумайте название и отправьте ссылку участникам.',
    },
    meta: {
        description: 'Платформа онлайн-обучения ОПТ РФ: занятия в браузере, видео, чат и демонстрация экрана.',
        keywords: 'видеоконференции, видеозвонок, вебинар, чат, демонстрация экрана, webrtc, sfu',
    },
    html: {
        topSponsors: false,
        features: false,
        teams: false,
        tryEasier: false,
        poweredBy: false,
        sponsors: false,
        pastSponsors: false,
        advertisers: false,
        supportUs: false,
        footer: true,
    },
    whoAreYou: {
        title: 'Ожидание ведущего',
        waitingRoomHeading: 'Ожидание ведущего...',
        waitingRoomDescription:
            'Встреча ещё не началась.<br />Вы войдёте автоматически, когда ведущий откроет комнату.',
        waitingRoomStatus: 'Проверка статуса комнаты...',
        waitingRoomReady: 'Комната готова! Входим...',
        waitingRoomWaiting: 'Ожидание, пока ведущий начнёт встречу...',
        waitingRoomHostLink: 'Вы ведущий?',
        waitingRoomLoginLink: 'Войти',
        waitingRoomElapsedJust: 'Ожидание только началось',
        waitingRoomElapsedMinutes: 'Ожидание: {minutes}',
        waitingRoomSongUrl: '',
    },
    login: {
        heading: 'С возвращением',
        description: 'Введите данные для входа.',
        buttonLabel: 'Войти',
    },
    about: {
        imageUrl: '../images/mirotalk-logo.gif',
        title: '<strong>ОПТ РФ</strong>',
        html: `
            <hr />
            <span>&copy; ${new Date().getFullYear()} ОПТ РФ. Все права защищены.</span>
            <hr />
        `,
    },
    widget: {
        enabled: false,
        roomId: 'support-room',
        theme: 'dark',
        widgetState: 'minimized',
        widgetType: 'support',
        supportWidget: {
            position: 'top-right',
            expertImages: [
                'https://photo.cloudron.pocketsolution.net/uploads/original/95/7d/a5f7f7a2c89a5fee7affda5f013c.jpeg',
            ],
            buttons: {
                audio: true,
                video: true,
                screen: true,
                chat: true,
                join: true,
            },
            checkOnlineStatus: false,
            isOnline: true,
            customMessages: {
                heading: 'Need Help?',
                subheading: 'Get instant support from our expert team!',
                connectText: 'connect in < 5 seconds',
                onlineText: 'We are online',
                offlineText: 'We are offline',
                poweredBy: 'Powered by MiroTalk SFU',
            },
            alert: {
                enabled: false,
                type: 'email',
            },
        },
    },
    //...
};

async function initialize() {
    await getBrand();

    customizeSite();

    customizeMetaTags();

    customizeApp();

    customizeWidget();

    customizeWhoAreYou();

    customizeLogin();

    checkBrand();
}

async function getBrand() {
    // Всегда тянем бренд с сервера — иначе sessionStorage залипает на английском
    try {
        const response = await fetch('/brand', { cache: 'no-store' });
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        const data = await response.json();
        const serverBrand = data.message;
        if (serverBrand) {
            setBrand(serverBrand);
            console.log('FETCH BRAND SETTINGS', {
                serverBrand: serverBrand,
                clientBrand: BRAND,
            });
            window.sessionStorage.setItem(brandDataKey, JSON.stringify(serverBrand));
            return;
        }
        console.warn('FETCH BRAND SETTINGS - DISABLED');
    } catch (error) {
        console.error('FETCH GET BRAND ERROR', error.message);
        if (brandData) {
            try {
                setBrand(JSON.parse(brandData));
            } catch (e) {
                /* keep defaults */
            }
        }
    }
}

// BRAND configurations
function setBrand(data) {
    BRAND = mergeBrand(BRAND, data);
    // Серверный /brand из Coolify часто тащит старые APP_TITLE/DESCRIPTION — возвращаем наши
    if (!BRAND.app) BRAND.app = {};
    BRAND.app.title = OPTRF_HERO.title;
    BRAND.app.description = OPTRF_HERO.description;
    console.log('Set Brand done');
}

function mergeBrand(current, updated) {
    for (const key of Object.keys(updated)) {
        if (!current.hasOwnProperty(key) || typeof updated[key] !== 'object') {
            current[key] = updated[key];
        } else {
            mergeBrand(current[key], updated[key]);
        }
    }
    return current;
}

// BRAND check
function checkBrand() {
    !BRAND.html.topSponsors && elementDisplay(topSponsors, false);
    !BRAND.html.features && elementDisplay(features, false);
    !BRAND.html.teams && elementDisplay(teams, false);
    !BRAND.html.tryEasier && elementDisplay(tryEasier, false);
    !BRAND.html.poweredBy && elementDisplay(poweredBy, false);
    !BRAND.html.sponsors && elementDisplay(sponsors, false);
    !BRAND.html.pastSponsors && elementDisplay(pastSponsors, false);
    !BRAND.html.advertisers && elementDisplay(advertisers, false);
    !BRAND.html.supportUs && elementDisplay(supportUs, false);
    !BRAND.html.footer && elementDisplay(footer, false);
}

// ELEMENT display mode
function elementDisplay(element, display, mode = 'block') {
    if (!element) return;
    element.style.display = display ? mode : 'none';
}

// APP customize
function customizeApp() {
    if (appTitle && BRAND.app?.title) {
        appTitle.innerHTML = BRAND.app?.title;
    }
    if (appDescription && BRAND.app?.description) {
        appDescription.textContent = BRAND.app.description;
    }
    if (joinDescription && BRAND.app?.joinDescription) {
        joinDescription.innerHTML = BRAND.app.joinDescription;
    }
    if (joinRoomBtn && BRAND.app?.joinButtonLabel) {
        joinRoomBtn.innerText = BRAND.app.joinButtonLabel;
    }
    if (customizeRoomBtn && BRAND.app?.customizeButtonLabel) {
        customizeRoomBtn.innerText = BRAND.app.customizeButtonLabel;
    }
    if (joinLastLabel && BRAND.app?.joinLastLabel) {
        joinLastLabel.innerText = BRAND.app.joinLastLabel;
    }
}

// WIDGET customize
function customizeWidget() {
    if (BRAND.widget?.enabled) {
        const domain = window.location.host;
        const roomId = BRAND.widget?.roomId || 'support-room';
        const userName = 'guest-' + Math.floor(Math.random() * 10000);
        if (typeof MiroTalkWidget !== 'undefined') {
            new MiroTalkWidget(domain, roomId, userName, BRAND.widget);
        } else {
            console.warn('MiroTalkWidget is not defined in the current context. Please check Widget.js loading.', {
                domain,
                roomId,
                userName,
                widget: BRAND.widget,
            });
        }
    }
}

// SITE metadata
function customizeSite() {
    if (title && BRAND.site?.title) {
        title.textContent = BRAND.site?.title;
    }
    if (icon && BRAND.site?.icon) {
        icon.href = BRAND.site?.icon;
    }
    if (appleTouchIcon && BRAND.site?.appleTouchIcon) {
        appleTouchIcon.href = BRAND.site.appleTouchIcon;
    }
    if (newRoomTitle && BRAND.site?.newRoomTitle) {
        newRoomTitle.innerHTML = BRAND.site?.newRoomTitle;
    }
    if (newRoomDescription && BRAND.site?.newRoomDescription) {
        newRoomDescription.textContent = BRAND.site.newRoomDescription;
    }
}

// SEO metadata
function customizeMetaTags() {
    if (description && BRAND.meta?.description) {
        description.content = BRAND.meta.description;
    }
    if (keywords && BRAND.meta?.keywords) {
        keywords.content = BRAND.meta.keywords;
    }
}

function customizeWhoAreYou() {
    if (waitingRoomHeading && title && BRAND.whoAreYou?.title) title.textContent = BRAND.whoAreYou.title;
    if (waitingRoomHeading && BRAND.whoAreYou?.waitingRoomHeading)
        waitingRoomHeading.textContent = BRAND.whoAreYou.waitingRoomHeading;
    if (waitingRoomDescription && BRAND.whoAreYou?.waitingRoomDescription)
        waitingRoomDescription.innerHTML = BRAND.whoAreYou.waitingRoomDescription;
    if (waitingRoomStatus && BRAND.whoAreYou?.waitingRoomStatus)
        waitingRoomStatus.textContent = BRAND.whoAreYou.waitingRoomStatus;
    if (waitingRoomHostLink && BRAND.whoAreYou?.waitingRoomHostLink)
        waitingRoomHostLink.textContent = BRAND.whoAreYou.waitingRoomHostLink;
    if (waitingRoomLoginLink && BRAND.whoAreYou?.waitingRoomLoginLink)
        waitingRoomLoginLink.textContent = BRAND.whoAreYou.waitingRoomLoginLink;
}

function customizeLogin() {
    if (loginHeading && BRAND.login?.heading) loginHeading.textContent = BRAND.login.heading;
    if (loginDescription && BRAND.login?.description) loginDescription.textContent = BRAND.login.description;
    if (BRAND.login?.buttonLabel) {
        const loginBtnText = document.getElementById('loginBtnText');
        if (loginBtnText) {
            loginBtnText.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i>&nbsp; ' + BRAND.login.buttonLabel;
        } else if (loginButton) {
            loginButton.textContent = BRAND.login.buttonLabel;
        }
    }
}

initialize();
