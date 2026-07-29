'use strict';

// Интерфейс OPTRF изначально написан по-русски. Google Translate раньше
// считал исходным языком английский и ошибочно переводил "Loading" как
// «Жидкий». Автоперевод намеренно отключён, чтобы текст интерфейса не искажался.
document.documentElement.lang = 'ru';
document.documentElement.classList.add('notranslate');
document.documentElement.setAttribute('translate', 'no');
