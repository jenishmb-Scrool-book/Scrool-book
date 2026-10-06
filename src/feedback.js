import {FEEDBACK_EMAIL} from './name.js';

// Письмо разработчику — системной почтой, а не своей формой: формы без
// интернета не бывает, а разрешения выходить в сеть у приложения нет. Ссылка
// `mailto:` уходит из WebView в Android, и тот открывает почтовое приложение
// с уже заполненными темой и текстом.
//
// Сведения о сборке кладутся в тело письма, ниже черты: просить тестировщика
// «скопируй и вставь» значит потерять половину отзывов на втором шаге.
export function mailto(subject, note, details) {
  const body = note + '\n\n\n\n—\n' + details;
  return 'mailto:' + FEEDBACK_EMAIL +
    '?subject=' + encodeURIComponent(subject) +
    '&body=' + encodeURIComponent(body);
}
